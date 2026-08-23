const cron = require('node-cron');
const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const notificationService = require('../services/notification.service');
const { decryptToken } = require('../utils/encryption');
const { APPOINTMENT_KEYWORDS } = require('../config/constants');
const { getEmailText, sanitizeEmailText, formatThreadForAi } = require('../utils/emailSanitizer');
const { createLogger, createTraceId } = require('../utils/logger');
const pLimit = require('p-limit');

const localAiService = require('../services/ai/local');

let isCronRunning = false;
const limit = pLimit(3);

const processUserEmails = async (user, observability = {}) => {
  const startedAt = Date.now();
  const logger = observability.logger?.child
    ? observability.logger.child({ userId: user.id }, 'SYNC')
    : createLogger('SYNC', {
        traceId: createTraceId('sync'),
        trigger: observability.trigger || 'cron',
        parentTraceId: observability.parentTraceId,
        userId: user.id,
      });
  const counters = {
    found: 0,
    processed: 0,
    skipped: 0,
    noKeyword: 0,
    notAppointment: 0,
    draftsCreated: 0,
    errors: 0,
  };
  const finish = (status = 'completed') => {
    const summary = { status, durationMs: Date.now() - startedAt, ...counters };
    logger.info('SYNC_END', 'Email synchronization finished', summary);
    return summary;
  };

  logger.info('SYNC_START', 'Email synchronization started', {
    userEmail: logger.protect(user.email),
    autoReplyActive: Boolean(user.setting?.isAutoReplyActive),
    lastEmailSync: user.setting?.lastEmailSync || null,
  });

  try {
    if (!user.setting) {
      counters.skipped += 1;
      logger.warn('SYNC_SKIP', 'User settings are missing');
      return finish('skipped');
    }
    if (!user.setting.isAutoReplyActive) {
      counters.skipped += 1;
      logger.info('SYNC_SKIP', 'AI auto-reply is disabled');
      return finish('skipped');
    }

    const refreshToken = decryptToken(user.refreshToken);
    const accessToken = decryptToken(user.accessToken);

    if (!refreshToken) {
      counters.skipped += 1;
      logger.warn('SYNC_SKIP', 'No valid refresh token found');
      return finish('skipped');
    }

    const selectedModel = user.setting.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:latest';
    const aiService = localAiService;

    const userOauth2Client = createOAuth2Client({
      refresh_token: refreshToken,
      access_token: accessToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: userOauth2Client });
    const calendar = google.calendar({ version: 'v3', auth: userOauth2Client });

    const lastSyncDate = user.setting.lastEmailSync || new Date(Date.now() - 60 * 60 * 1000);
    const lastSyncUnix = Math.floor(lastSyncDate.getTime() / 1000);
    const gmailQuery = `newer:${lastSyncUnix} is:unread -from:me`;

    logger.info('GMAIL_LIST_START', 'Searching Gmail for new unread messages', {
      query: gmailQuery,
      since: lastSyncDate,
      maxResults: 25,
      model: selectedModel,
    });

    const gmailListStartedAt = Date.now();
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: gmailQuery,
      maxResults: 25,
    });

    const messages = res.data.messages || [];
    counters.found = messages.length;
    logger.info('GMAIL_LIST_END', 'Gmail search completed', {
      messageCount: messages.length,
      resultSizeEstimate: res.data.resultSizeEstimate,
      durationMs: Date.now() - gmailListStartedAt,
    });

    if (messages.length === 0) {
      await prisma.userSetting.update({
        where: { userId: user.id },
        data: { lastEmailSync: new Date() },
      });
      logger.info('SYNC_NO_MESSAGES', 'No new emails found; sync time updated');
      return finish('no_messages');
    }

    for (const msg of messages) {
      const messageStartedAt = Date.now();
      const messageLogger = logger.child({ messageId: msg.id }, 'EMAIL');
      try {
        counters.processed += 1;
        messageLogger.info('PROCESS_START', 'Starting email processing');
        const existingDraft = await prisma.draft.findUnique({
          where: {
            userId_messageId: {
              userId: user.id,
              messageId: msg.id,
            },
          },
        });
        messageLogger.debug('DRAFT_DUPLICATE_CHECK', 'Checked existing draft by message ID', {
          existing: Boolean(existingDraft),
          existingDraftId: existingDraft?.id,
          existingStatus: existingDraft?.status,
        });
        if (existingDraft) {
          counters.skipped += 1;
          messageLogger.info('PROCESS_SKIP', 'Message already has a draft', {
            reason: 'existing_message_draft',
            draftId: existingDraft.id,
            durationMs: Date.now() - messageStartedAt,
          });
          continue;
        }

        const mailDetail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });
        const latestRawText = getEmailText(mailDetail.data.payload);
        const latestText = sanitizeEmailText(latestRawText);
        const headers = mailDetail.data.payload.headers;
        const threadId = mailDetail.data.threadId;
        const threadLogger = messageLogger.child({ threadId });

        let rawSubject =
          headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        let cleanSubject = rawSubject.replace(/^(re:\s*)+/gi, '').trim();
        let msgFrom = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
        const msgDate =
          headers.find((h) => h.name.toLowerCase() === 'date')?.value ||
          new Date(Number(mailDetail.data.internalDate)).toISOString();

        threadLogger.info('EMAIL_RECEIVED', 'Received Gmail message', {
          subject: threadLogger.protect(cleanSubject),
          from: threadLogger.protect(msgFrom),
          date: msgDate,
          content: threadLogger.protect(latestText),
        });

        const matchedKeywords = APPOINTMENT_KEYWORDS.filter((kw) =>
          latestText.toLowerCase().includes(kw.toLowerCase())
        );
        const hasKeyword = matchedKeywords.length > 0;
        threadLogger.info('KEYWORD_RESULT', 'Appointment keyword scan completed', {
          hasKeyword,
          matchedKeywords,
          configuredKeywordCount: APPOINTMENT_KEYWORDS.length,
        });

        if (hasKeyword) {
          const threadFetchStartedAt = Date.now();
          threadLogger.info('THREAD_FETCH_START', 'Loading complete Gmail thread');
          const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
          const { formattedThread, latestFrom } = formatThreadForAi(threadDetail.data.messages || []);

          threadLogger.info('THREAD_READY', 'Gmail thread prepared for AI analysis', {
            messageCount: threadDetail.data.messages?.length || 0,
            latestFrom: threadLogger.protect(latestFrom),
            formattedThreadLength: formattedThread.length,
            durationMs: Date.now() - threadFetchStartedAt,
          });

          const aiResult = await aiService.extractAppointment(
            null,
            formattedThread,
            selectedModel,
            threadLogger
          );

          if (aiResult.isAppointment) {
            threadLogger.info('APPOINTMENT_DETECTED', 'AI classified email as an appointment');

            // ดึงข้อมูล Google Calendar (ล่วงหน้า 14 วัน เพื่อความแม่นยำในการคำนวณ Slot ว่าง)
            let existingEvents = [];
            try {
              const calendarQueryStartedAt = Date.now();
              const timeMin = new Date();
              timeMin.setHours(0, 0, 0, 0);

              const timeMax = new Date();
              timeMax.setDate(timeMax.getDate() + 14);

              threadLogger.info('CALENDAR_QUERY_START', 'Loading events for availability analysis', {
                calendarId: 'primary',
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
              });

              const calRes = await calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
              });
              existingEvents = calRes.data.items || [];
              threadLogger.info('CALENDAR_QUERY_END', 'Calendar events loaded', {
                eventCount: existingEvents.length,
                durationMs: Date.now() - calendarQueryStartedAt,
              });
            } catch (calErr) {
              threadLogger.error('CALENDAR_QUERY_ERROR', 'Failed to load Calendar events', calErr);
            }

            const draftResult = await aiService.draftReplyWithCalendar(
              null,
              formattedThread,
              aiResult,
              existingEvents,
              user.setting,
              selectedModel,
              threadLogger
            );

            if (draftResult.draftMessage) {
              const draftPersistStartedAt = Date.now();
              const eventDate = aiResult.date ? new Date(aiResult.date) : null;
              threadLogger.info('DRAFT_PERSIST_START', 'Persisting latest pending draft', {
                actionType: draftResult.actionType || 'ACCEPT',
                suggestedDate: eventDate,
                draftLength: draftResult.draftMessage.length,
              });

              // ลบดราฟ PENDING เดิมใน thread เดียวกันออก (ถ้ามี) เพื่อให้ผู้ใช้ได้รับดราฟฉบับล่าสุดของการตอบกลับ
              const deletedDrafts = await prisma.draft.deleteMany({
                where: {
                  userId: user.id,
                  threadId: threadId,
                  status: 'PENDING',
                },
              });
              threadLogger.info('PENDING_DRAFTS_CLEARED', 'Removed older pending drafts in the thread', {
                deletedCount: deletedDrafts.count,
              });

              const createdDraft = await prisma.draft.create({
                data: {
                  userId: user.id,
                  messageId: msg.id,
                  threadId: threadId,
                  subject: cleanSubject,
                  suggestedDate: eventDate,
                  location: aiResult.location,
                  actionType: draftResult.actionType || 'ACCEPT',
                  draftReply: draftResult.draftMessage,
                  status: 'PENDING',
                  priority: aiResult.priority || 'NORMAL',
                },
              });
              counters.draftsCreated += 1;
              const draftLogger = threadLogger.child({ draftId: createdDraft.id });
              draftLogger.info('DRAFT_CREATED', 'Pending appointment draft created', {
                status: createdDraft.status,
                actionType: createdDraft.actionType,
                suggestedDate: createdDraft.suggestedDate,
                priority: createdDraft.priority,
                draftLength: createdDraft.draftReply.length,
                durationMs: Date.now() - draftPersistStartedAt,
              });

              const notificationResult = await notificationService.sendPendingDraftNotification(
                userOauth2Client,
                user.email,
                { from: latestFrom || msgFrom, subject: cleanSubject },
                eventDate,
                draftLogger
              );
              if (notificationResult?.success !== true) counters.errors += 1;
              draftLogger.info('PROCESS_END', 'Email processing completed', {
                durationMs: Date.now() - messageStartedAt,
                model: selectedModel,
                notificationSent: notificationResult?.success === true,
              });
            } else {
              counters.skipped += 1;
              threadLogger.warn('PROCESS_SKIP', 'AI returned an empty draft message', {
                reason: 'empty_draft',
                durationMs: Date.now() - messageStartedAt,
              });
            }
          } else {
            counters.notAppointment += 1;
            counters.skipped += 1;
            threadLogger.info('PROCESS_SKIP', 'AI classified email as non-appointment', {
              reason: 'not_appointment',
              durationMs: Date.now() - messageStartedAt,
              aiResult: {
                ...aiResult,
                title: threadLogger.protect(aiResult.title),
                location: threadLogger.protect(aiResult.location),
              },
            });
          }
        } else {
          counters.noKeyword += 1;
          counters.skipped += 1;
          threadLogger.info('PROCESS_SKIP', 'No appointment keywords matched', {
            reason: 'no_keyword',
            durationMs: Date.now() - messageStartedAt,
          });
        }
      } catch (msgErr) {
        counters.errors += 1;
        messageLogger.error('PROCESS_ERROR', 'Failed to process email message', msgErr, {
          durationMs: Date.now() - messageStartedAt,
        });
      }
    }

    await prisma.userSetting.update({
      where: { userId: user.id },
      data: { lastEmailSync: new Date() },
    });
    logger.debug('SYNC_CHECKPOINT_UPDATED', 'Updated lastEmailSync checkpoint');
    return finish(counters.errors > 0 ? 'completed_with_errors' : 'completed');
  } catch (userError) {
    counters.errors += 1;
    logger.error('SYNC_ERROR', 'Email synchronization cycle failed', userError, {
      durationMs: Date.now() - startedAt,
      counters,
    });
    const msg = (userError?.message || '').toLowerCase();
    if (
      msg.includes('invalid_grant') ||
      msg.includes('invalid credentials') ||
      msg.includes('token has been expired') ||
      userError?.code === 401
    ) {
      finish('unauthorized');
      throw new Error('UNAUTHORIZED');
    }
    return finish('failed');
  }
};

const checkNewEmails = async () => {
  const cycleStartedAt = Date.now();
  const cycleTraceId = createTraceId('cron');
  const logger = createLogger('CRON', { traceId: cycleTraceId, trigger: 'cron' });
  if (isCronRunning) {
    logger.warn('CYCLE_SKIP', 'Previous cron cycle is still active');
    return;
  }

  logger.info('CYCLE_START', 'Starting parallel email check cycle', { concurrency: 3 });
  isCronRunning = true;

  try {
    const users = await prisma.user.findMany({
      where: { refreshToken: { not: null } },
      include: { setting: true },
    });
    logger.info('USERS_LOADED', 'Loaded users eligible for email synchronization', {
      userCount: users.length,
    });

    const tasks = users.map((user) =>
      limit(() => processUserEmails(user, {
        trigger: 'cron',
        parentTraceId: cycleTraceId,
      }))
    );

    const summaries = await Promise.all(tasks);
    logger.info('CYCLE_RESULTS', 'All user synchronization tasks settled', {
      userCount: users.length,
      summaries,
    });
  } catch (error) {
    logger.error('CYCLE_ERROR', 'Fatal cron cycle failure', error);
  } finally {
    isCronRunning = false;
    logger.info('CYCLE_END', 'Parallel email check cycle finished and unlocked', {
      durationMs: Date.now() - cycleStartedAt,
    });
  }
};

const startCron = () => {
  cron.schedule('*/10 * * * *', checkNewEmails);
  createLogger('SYSTEM', { traceId: createTraceId('startup') })
    .info('CRON_REGISTERED', 'Email watcher cron job started', {
      schedule: '*/10 * * * *',
      intervalDescription: 'Every 10 minutes',
    });
};

const syncSingleUser = async (userId, observability = {}) => {
  const logger = observability.logger || createLogger('SYNC', {
    traceId: createTraceId('manual-sync'),
    trigger: 'manual',
    userId,
  });
  let user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  if (!user || !refreshToken) {
    logger.warn('MANUAL_SYNC_REJECTED', 'Manual sync cannot start because authorization is missing');
    throw new Error('UNAUTHORIZED');
  }

  if (!user.setting) {
    user.setting = await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    logger.info('SETTINGS_CREATED', 'Default user settings created before manual sync');
  }

  await processUserEmails(user, { logger, trigger: 'manual' });
  return { success: true, lastEmailSync: new Date() };
};

module.exports = { startCron, syncSingleUser };
