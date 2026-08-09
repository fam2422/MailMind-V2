const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { oauth2Client } = require('../config/google');
const { decrypt } = require('../utils/encryption');
const { buildScheduleSummaryPrompt } = require('./ai/prompts');

// Import AI SDKs
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// Helper ฟังก์ชันหาจุดเริ่มต้น-สิ้นสุดของเวลา
const getTimeRange = (type) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (type === 'DAILY') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (type === 'WEEKLY') {
    const day = now.getDay() || 7; 
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (type === 'MONTHLY') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
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

  const targetModel = user.setting?.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
  const baseURL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';

  // 3. ดึง Google Calendar Events
  oauth2Client.setCredentials({ refresh_token: user.refreshToken, access_token: user.accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
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