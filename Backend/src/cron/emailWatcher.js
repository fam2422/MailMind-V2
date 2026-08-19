const cron = require('node-cron');
const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const notificationService = require('../services/notification.service');
const { decryptToken } = require('../utils/encryption');
const { APPOINTMENT_KEYWORDS } = require('../config/constants');
const { sanitizeEmailText } = require('../utils/emailSanitizer');
const pLimit = require('p-limit');

const localAiService = require('../services/ai/local');

let isCronRunning = false;
const limit = pLimit(3);

const getEmailText = (payload) => {
  let text = '';
  if (!payload) return text;

  if (payload.parts) {
    payload.parts.forEach((part) => {
      if (part.mimeType === 'text/plain' && part.body.data) {
        text += Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) {
        text += getEmailText(part);
      }
    });
  } else if (payload.body && payload.body.data) {
    text = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  return text;
};

const processUserEmails = async (user) => {
  const logPrefix = `[${user.email}]`;

  try {
    if (!user.setting) return;
    if (!user.setting.isAutoReplyActive) {
      console.log(`${logPrefix} [SKIP] AI Auto-Reply is disabled.`);
      return;
    }

    const refreshToken = decryptToken(user.refreshToken);
    const accessToken = decryptToken(user.accessToken);

    if (!refreshToken) {
      console.log(`${logPrefix} [SKIP] No valid refresh token found.`);
      return;
    }

    const selectedModel = user.setting.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
    const aiService = localAiService;

    const userOauth2Client = createOAuth2Client({
      refresh_token: refreshToken,
      access_token: accessToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: userOauth2Client });
    const calendar = google.calendar({ version: 'v3', auth: userOauth2Client });

    const lastSyncDate = user.setting.lastEmailSync || new Date(Date.now() - 60 * 60 * 1000);
    const lastSyncUnix = Math.floor(lastSyncDate.getTime() / 1000);

    const res = await gmail.users.messages.list({
      userId: 'me',
      q: `newer:${lastSyncUnix} is:unread -from:me`,
      maxResults: 25,
    });

    const messages = res.data.messages || [];

    if (messages.length === 0) {
      console.log(`${logPrefix} [SKIP] No new emails found. Sync time updated.`);

      await prisma.userSetting.update({
        where: { userId: user.id },
        data: { lastEmailSync: new Date() },
      });
      return;
    }

    console.log(`${logPrefix} [INFO] Found ${messages.length} new emails.`);

    for (const msg of messages) {
      try {
        const existingDraft = await prisma.draft.findUnique({
          where: {
            userId_messageId: {
              userId: user.id,
              messageId: msg.id,
            },
          },
        });
        if (existingDraft) continue;

        const mailDetail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });
        const latestRawText = getEmailText(mailDetail.data.payload);
        const latestText = sanitizeEmailText(latestRawText);
        const headers = mailDetail.data.payload.headers;
        const threadId = mailDetail.data.threadId;

        let rawSubject =
          headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        let cleanSubject = rawSubject.replace(/^(re:\s*)+/gi, '').trim();
        let msgFrom = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';

        console.log(`${logPrefix} [EMAIL] Processing: "${cleanSubject}"`);

        const hasKeyword = APPOINTMENT_KEYWORDS.some((kw) =>
          latestText.toLowerCase().includes(kw.toLowerCase())
        );

        if (hasKeyword) {
          const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
          let fullThreadText = '';
          threadDetail.data.messages.forEach((tMsg) => {
            const tText = sanitizeEmailText(getEmailText(tMsg.payload));
            const tHeaders = tMsg.payload.headers;
            const tFrom =
              tHeaders.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
            fullThreadText += `\n--- Email From: ${tFrom} ---\n${tText.trim()}\n`;
          });

          console.log(`${logPrefix} [AI] Analyzing with Local AI (Model: ${selectedModel})...`);

          const aiResult = await aiService.extractAppointment(null, fullThreadText, selectedModel);

          if (aiResult.isAppointment) {
            console.log(
              `${logPrefix} [SUCCESS] Appointment detected! Date: ${aiResult.date || 'NOT SPECIFIED'}`
            );

            // ดึงข้อมูล Google Calendar (ล่วงหน้า 14 วัน เพื่อความแม่นยำในการคำนวณ Slot ว่าง)
            let existingEvents = [];
            try {
              const timeMin = new Date();
              timeMin.setHours(0, 0, 0, 0);

              const timeMax = new Date();
              timeMax.setDate(timeMax.getDate() + 14);

              const calRes = await calendar.events.list({
                calendarId: 'primary',
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
              });
              existingEvents = calRes.data.items || [];
            } catch (calErr) {
              console.error(`${logPrefix} [CALENDAR ERROR]:`, calErr.message);
            }

            const draftResult = await aiService.draftReplyWithCalendar(
              null,
              fullThreadText,
              aiResult,
              existingEvents,
              user.setting,
              selectedModel
            );

            if (draftResult.draftMessage) {
              const eventDate = aiResult.date ? new Date(aiResult.date) : null;

              await prisma.draft.create({
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

              await notificationService.sendPendingDraftNotification(
                userOauth2Client,
                user.email,
                { from: msgFrom, subject: cleanSubject },
                eventDate
              );
              console.log(
                `${logPrefix} [DONE] Draft created via Deterministic AI (${selectedModel}) and Notification sent.`
              );
            }
          }
        }
      } catch (msgErr) {
        console.error(`${logPrefix} [ERROR] Failed to process message ${msg.id}:`, msgErr.message);
      }
    }

    await prisma.userSetting.update({
      where: { userId: user.id },
      data: { lastEmailSync: new Date() },
    });
  } catch (userError) {
    console.error(`${logPrefix} [ERROR] Cycle failed:`, userError.message);
    const msg = (userError?.message || '').toLowerCase();
    if (
      msg.includes('invalid_grant') ||
      msg.includes('invalid credentials') ||
      msg.includes('token has been expired') ||
      userError?.code === 401
    ) {
      throw new Error('UNAUTHORIZED');
    }
  }
};

const checkNewEmails = async () => {
  if (isCronRunning) {
    console.log('[CRON] ⚠️ Previous cycle still active. Skipping this run.');
    return;
  }

  console.log('\n[CRON] 🚀 Starting parallel email check cycle...');
  isCronRunning = true;

  try {
    const users = await prisma.user.findMany({
      where: { refreshToken: { not: null } },
      include: { setting: true },
    });

    const tasks = users.map((user) => limit(() => processUserEmails(user)));

    await Promise.all(tasks);
  } catch (error) {
    console.error('[CRON ERROR] Fatal System Failure:', error);
  } finally {
    isCronRunning = false;
    console.log('[CRON] ✅ Parallel cycle finished and unlocked.\n');
  }
};

const startCron = () => {
  cron.schedule('*/10 * * * *', checkNewEmails);
  console.log('[SYSTEM] Email Watcher Cron Job started (Every 10 mins)');
};

const syncSingleUser = async (userId) => {
  let user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED');
  }

  if (!user.setting) {
    user.setting = await prisma.userSetting.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }

  await processUserEmails(user);
  return { success: true, lastEmailSync: new Date() };
};

module.exports = { startCron, syncSingleUser };