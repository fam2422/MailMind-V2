const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');
const { sanitizeEmailText } = require('../utils/emailSanitizer');

// ดึง AI Services
const localAiService = require('./ai/local');

// ดึง Google Services
const gmailService = require('./gmail.service');
const calendarService = require('./calendar.service');

// Helper: แกะข้อความอีเมล
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

exports.generateDraft = async (userId, threadId) => {
  // 1. ดึงข้อมูลและตรวจสอบ
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const targetModel = user?.setting?.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
  const activeAiService = localAiService;

  // 2. ดึงอีเมลจาก Gmail
  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
  let fullThreadText = '';
  threadDetail.data.messages.forEach((tMsg) => {
    const tText = sanitizeEmailText(getEmailText(tMsg.payload));
    const headers = tMsg.payload.headers;
    const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
    fullThreadText += `\n--- Email From: ${fromHeader} ---\n${tText.trim()}\n`;
  });

  console.log(`\n[AI] 🤖 Generating draft using Local AI | Model: ${targetModel}\n`);

  // 3. สั่ง AI สกัดข้อมูลนัดหมาย
  const aiResult = await activeAiService.extractAppointment(null, fullThreadText, targetModel);

  // 4. ดึงข้อมูล Google Calendar (ล่วงหน้า 14 วันเพื่อครอบคลุมการหาช่วงเวลาว่าง)
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
  } catch (err) {
    console.error('Calendar Fetch Error:', err.message);
  }

  // 5. ร่างอีเมลด้วย Deterministic Scheduling Engine + Local AI
  const draftResult = await activeAiService.draftReplyWithCalendar(
    null,
    fullThreadText,
    aiResult,
    existingEvents,
    user?.setting,
    targetModel
  );

  return {
    isAppointment: aiResult.isAppointment,
    actionType: draftResult.actionType,
    reasoning: draftResult.reasoning,
    suggestedDate: aiResult.date ? new Date(aiResult.date) : null,
    location: aiResult.location,
    priority: aiResult.priority || 'NORMAL',
    draftReply: draftResult.draftMessage || '',
  };
};

exports.approveAndSend = async (userId, draftId, editedReply) => {
  const draft = await prisma.draft.findFirst({ where: { id: draftId, userId } });
  if (!draft) throw new Error('ไม่พบ Draft นี้');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true },
  });

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const metadata = await gmailService.getOriginalEmailMetadata(gmail, draft.messageId);
  await gmailService.sendEmailReply(gmail, draft, metadata, editedReply);

  try {
    await calendarService.addEventToCalendar(
      calendar,
      draft,
      metadata,
      user.setting?.timezone,
      authClient,
      user.email
    );
  } catch (calError) {
    console.error('❌ Calendar Insert Error:', calError.message);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: 'APPROVED', draftReply: editedReply || draft.draftReply },
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