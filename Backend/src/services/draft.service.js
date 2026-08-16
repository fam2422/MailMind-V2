const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');

// ดึง AI Services
const localAiService = require('./ai/local');

// ดึง Google Services (สมมติว่าคุณมี 2 ไฟล์นี้อยู่แล้วตามที่คอมเมนต์ไว้)
const gmailService = require('./gmail.service'); 
const calendarService = require('./calendar.service');

// Helper: แกะข้อความอีเมล
const getEmailText = (payload) => {
  let text = '';
  if (!payload) return text;
  if (payload.parts) {
    payload.parts.forEach(part => {
      if (part.mimeType === 'text/plain' && part.body.data) {
        text += Buffer.from(part.body.data, 'base64').toString('utf8');
      } else if (part.parts) { text += getEmailText(part); }
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
    include: { setting: true }
  });

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const targetModel = user?.setting?.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
  const activeAiService = localAiService;

  // 3. ดึงอีเมล
  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: authClient });
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
  let fullThreadText = "";
  threadDetail.data.messages.forEach((tMsg) => {
    const tText = getEmailText(tMsg.payload);
    const headers = tMsg.payload.headers;
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
    fullThreadText += `\n--- Email From: ${fromHeader} ---\n${tText.trim()}\n`;
  });
  console.log(`\n[AI] 🤖 Generating draft using Local AI | Model: ${targetModel}\n`);

  // 4. สั่ง AI วิเคราะห์
  const aiResult = await activeAiService.extractAppointment(null, fullThreadText, targetModel);

  // 5. ดึงข้อมูล Calendar
  let existingEvents = [];
  if (aiResult.isAppointment && aiResult.date) {
    const eventDate = new Date(aiResult.date);
    const timeMin = new Date(eventDate.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
    try {
      const calRes = await calendar.events.list({
        calendarId: 'primary', timeMin, timeMax, singleEvents: true, orderBy: 'startTime'
      });
      existingEvents = calRes.data.items.map(e => ({
        summary: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date
      }));
    } catch (err) { console.error("Calendar Fetch Error:", err.message); }
  }

  // 6. ร่างอีเมล
  const draftResult = await activeAiService.draftReplyWithCalendar(
    null, fullThreadText, aiResult, existingEvents, user?.setting, targetModel
  );

  return {
    isAppointment: aiResult.isAppointment,
    draftReply: draftResult.draftMessage || ''
  };
};

exports.approveAndSend = async (userId, draftId, editedReply) => {
  const draft = await prisma.draft.findUnique({ where: { id: draftId, userId } });
  if (!draft) throw new Error("ไม่พบ Draft นี้");

  const user = await prisma.user.findUnique({ 
    where: { id: userId },
    include: { setting: true }
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
    console.error("❌ Calendar Insert Error:", calError.message);
  }

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: 'APPROVED', draftReply: editedReply || draft.draftReply }
  });

  return { message: "ส่งอีเมลและบันทึกลงปฏิทินเรียบร้อยแล้ว!" };
};

exports.getUserDrafts = async (userId) => {
  return await prisma.draft.findMany({
    where: { userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  });
};

exports.rejectDraft = async (userId, draftId) => {
  await prisma.draft.delete({
    where: { id: draftId, userId }
  });
  return { message: "ลบ Draft เรียบร้อยแล้ว" };
};