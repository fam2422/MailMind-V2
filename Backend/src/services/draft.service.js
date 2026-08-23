const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');
const { formatThreadForAi } = require('../utils/emailSanitizer');
const { createLogger, createTraceId } = require('../utils/logger');

// ดึง AI Services
const localAiService = require('./ai/local');

// ดึง Google Services
const gmailService = require('./gmail.service');
const calendarService = require('./calendar.service');

exports.generateDraft = async (userId, threadId, observability) => {
  const logger = observability?.child
    ? observability.child({ userId, threadId }, 'DRAFT')
    : createLogger('DRAFT', { traceId: createTraceId('draft-generate'), userId, threadId });
  const startedAt = Date.now();
  logger.info('GENERATE_START', 'On-demand draft generation started');
  // 1. ดึงข้อมูลและตรวจสอบ
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const targetModel = user?.setting?.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:latest';
  const activeAiService = localAiService;

  // 2. ดึงอีเมลจาก Gmail
  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
  const { formattedThread } = formatThreadForAi(threadDetail.data.messages || []);
  logger.info('THREAD_READY', 'Thread prepared for on-demand draft generation', {
    messageCount: threadDetail.data.messages?.length || 0,
    formattedThreadLength: formattedThread.length,
    model: targetModel,
  });

  // 3. สั่ง AI สกัดข้อมูลนัดหมายจาก Thread โดยเน้นย้ำข้อความล่าสุด
  const aiResult = await activeAiService.extractAppointment(null, formattedThread, targetModel, logger);

  // 4. ดึงข้อมูล Google Calendar (ล่วงหน้า 14 วันเพื่อครอบคลุมการหาช่วงเวลาว่าง)
  let existingEvents = [];
  try {
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);

    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 14);
    logger.info('CALENDAR_QUERY_START', 'Loading events for on-demand draft analysis', {
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
    logger.info('CALENDAR_QUERY_END', 'Calendar events loaded', {
      eventCount: existingEvents.length,
    });
  } catch (err) {
    logger.error('CALENDAR_QUERY_ERROR', 'Failed to load Calendar events', err);
  }

  // 5. ร่างอีเมลด้วย Deterministic Scheduling Engine + Local AI
  const draftResult = await activeAiService.draftReplyWithCalendar(
    null,
    formattedThread,
    aiResult,
    existingEvents,
    user?.setting,
    targetModel,
    logger
  );

  const result = {
    isAppointment: aiResult.isAppointment,
    actionType: draftResult.actionType,
    reasoning: draftResult.reasoning,
    suggestedDate: aiResult.date ? new Date(aiResult.date) : null,
    location: aiResult.location,
    priority: aiResult.priority || 'NORMAL',
    draftReply: draftResult.draftMessage || '',
  };
  logger.info('GENERATE_END', 'On-demand draft generation completed', {
    durationMs: Date.now() - startedAt,
    isAppointment: result.isAppointment,
    actionType: result.actionType,
    suggestedDate: result.suggestedDate,
    priority: result.priority,
    draftLength: result.draftReply.length,
  });
  return result;
};

exports.approveAndSend = async (userId, draftId, editedReply, observability) => {
  const logger = observability?.child
    ? observability.child({ userId, draftId }, 'APPROVAL')
    : createLogger('APPROVAL', { traceId: createTraceId('approval'), userId, draftId });
  const startedAt = Date.now();
  logger.info('APPROVAL_START', 'Draft approval workflow started', {
    hasEditedReply: Boolean(editedReply),
    editedReplyLength: editedReply?.length || 0,
  });
  const draft = await prisma.draft.findFirst({ where: { id: draftId, userId } });
  if (!draft) {
    logger.warn('DRAFT_NOT_FOUND', 'Draft approval stopped because draft was not found');
    throw new Error('ไม่พบ Draft นี้');
  }
  const draftLogger = logger.child({ messageId: draft.messageId, threadId: draft.threadId });
  draftLogger.info('DRAFT_LOADED', 'Draft loaded for approval', {
    status: draft.status,
    actionType: draft.actionType,
    suggestedDate: draft.suggestedDate,
    subject: draftLogger.protect(draft.subject),
    location: draftLogger.protect(draft.location),
    originalDraftLength: draft.draftReply.length,
  });
  draftLogger.sensitiveBlock(
    'APPROVED_REPLY_CONTENT',
    editedReply ? 'EDITED APPROVED REPLY' : 'ORIGINAL APPROVED REPLY',
    editedReply || draft.draftReply
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  draftLogger.info('EMAIL_METADATA_LOAD_START', 'Loading original email metadata for reply');
  const metadata = await gmailService.getOriginalEmailMetadata(gmail, draft.messageId);
  draftLogger.info('EMAIL_METADATA_LOADED', 'Original email metadata loaded', {
    from: draftLogger.protect(metadata.fromEmail),
    cleanEmail: draftLogger.protect(metadata.cleanEmail),
    subject: draftLogger.protect(metadata.subject),
    originalMessageId: metadata.originalMessageId,
    hasReferences: Boolean(metadata.originalReferences),
  });
  await gmailService.sendEmailReply(gmail, draft, metadata, editedReply, draftLogger);

  try {
    await calendarService.addEventToCalendar(
      calendar,
      draft,
      metadata,
      user.setting?.timezone,
      authClient,
      user.email,
      draftLogger
    );
  } catch (calError) {
    draftLogger.error('CALENDAR_INSERT_ERROR', 'Calendar event insertion failed', calError);
  }

  draftLogger.info('DRAFT_STATUS_UPDATE_START', 'Updating approved draft status');
  const updatedDraft = await prisma.draft.update({
    where: { id: draftId },
    data: { status: 'APPROVED', draftReply: editedReply || draft.draftReply },
  });
  draftLogger.info('DRAFT_STATUS_UPDATED', 'Draft status updated after approval', {
    status: updatedDraft.status,
    updatedAt: updatedDraft.updatedAt,
  });
  draftLogger.info('APPROVAL_END', 'Draft approval workflow completed', {
    durationMs: Date.now() - startedAt,
    actionType: updatedDraft.actionType,
    status: updatedDraft.status,
  });

  return { message: 'ส่งอีเมลและบันทึกลงปฏิทินเรียบร้อยแล้ว!' };
};

exports.getUserDrafts = async (userId) => {
  return await prisma.draft.findMany({
    where: { userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
};

exports.rejectDraft = async (userId, draftId) => {
  const draft = await prisma.draft.findFirst({ where: { id: draftId, userId } });
  if (!draft) throw new Error('ไม่พบ Draft นี้');

  await prisma.draft.delete({
    where: { id: draftId },
  });
  return { message: 'ลบ Draft เรียบร้อยแล้ว' };
};
