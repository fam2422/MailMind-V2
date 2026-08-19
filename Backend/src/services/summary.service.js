const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');
const { buildScheduleSummaryPrompt } = require('./ai/prompts');
const { OpenAI } = require('openai');

// Helper ฟังก์ชันหาจุดเริ่มต้น-สิ้นสุดของเวลา
const getTimeRange = (type) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  let start;
  let end;

  if (type === 'DAILY') {
    start = new Date(year, month, date, 0, 0, 0, 0);
    end = new Date(year, month, date, 23, 59, 59, 999);
  } else if (type === 'WEEKLY') {
    const day = now.getDay() || 7; // 1 (Mon) - 7 (Sun)
    start = new Date(year, month, date - day + 1, 0, 0, 0, 0);
    end = new Date(year, month, date - day + 7, 23, 59, 59, 999);
  } else if (type === 'MONTHLY') {
    start = new Date(year, month, 1, 0, 0, 0, 0);
    end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  } else {
    start = new Date(year, month, date, 0, 0, 0, 0);
    end = new Date(year, month, date, 23, 59, 59, 999);
  }
  return { timeMin: start, timeMax: end };
};

exports.getOrGenerateSummary = async (userId, type, isForce) => {
  const { timeMin, timeMax } = getTimeRange(type);
  console.log(`[SUMMARY] Type: ${type} | Force: ${isForce} | Range: ${timeMin.toISOString()} TO ${timeMax.toISOString()}`);

  // 1. ตรวจสอบ Database ก่อนเสมอถ้าไม่ได้สั่ง force=true
  if (!isForce) {
    const existingSummary = await prisma.summary.findFirst({
      where: { userId, type, periodStart: timeMin }
    });

    if (existingSummary) {
      console.log(`[SUMMARY] ✅ Found existing summary in DB. No AI call needed.`);
      return existingSummary.content;
    }
  }

  console.log(`[SUMMARY] ✨ No cache found or forced. Calling AI...`);

  // 2. ดึงข้อมูล User และ Settings
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true }
  });

  if (!user) {
    throw new Error('ไม่พบข้อมูลผู้ใช้');
  }

  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);

  const targetModel = user.setting?.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
  const baseURL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';

  // 3. ดึง Google Calendar Events
  const authClient = createOAuth2Client({ refresh_token: refreshToken, access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: authClient });
  
  const calRes = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (calRes.data.items || []).map(e => ({
    summary: e.summary,
    start: e.start.dateTime || e.start.date,
    end: e.end.dateTime || e.end.date
  }));

  // 4. เตรียม Prompt
  const dateContext = `วันนี้คือ ${new Date().toLocaleDateString('th-TH', { dateStyle: 'full' })}`;
  const prompt = buildScheduleSummaryPrompt(events, type, dateContext);
  let summaryContent = '';

  console.log(`[SUMMARY] Generating using Local AI | Model: ${targetModel}`);

  // 5. สั่ง AI เขียนสรุป
  const openai = new OpenAI({ apiKey: 'ollama', baseURL });
  const response = await openai.chat.completions.create({
    model: targetModel,
    messages: [{ role: "user", content: prompt }]
  });
  summaryContent = response.choices[0].message.content;

  // 6. บันทึก/อัปเดตลง Database
  const savedSummary = await prisma.summary.upsert({
    where: {
      userId_type_periodStart_periodEnd: { userId, type, periodStart: timeMin, periodEnd: timeMax }
    },
    update: { content: summaryContent, createdAt: new Date() },
    create: { userId, type, periodStart: timeMin, periodEnd: timeMax, content: summaryContent }
  });

  return savedSummary.content;
};