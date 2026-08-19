// backend/src/services/ai/local.js
const { OpenAI } = require('openai');
const { buildExtractionPrompt, buildDraftPrompt } = require('./prompts');
const { analyzeSlotAvailability } = require('./scheduler');

const getClient = () => {
  const baseURL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';
  return new OpenAI({
    baseURL,
    apiKey: 'ollama', // Ollama does not require a real API key
  });
};

const getModel = (modelName) => {
  return modelName || process.env.LOCAL_AI_MODEL || 'llama3.1:latest';
};

const parseJsonFromLlm = (text) => {
  if (!text) return {};
  let cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    try {
      let fixed = cleaned.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
      fixed = fixed.replace(/[\r\n]/g, '\\n');
      return JSON.parse(fixed);
    } catch (err2) {
      const actionType = (cleaned.match(/"actionType"\s*:\s*"([^"]+)"/) || [])[1] || 'ACCEPT';
      let reasoning =
        (cleaned.match(/"reasoning"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"draftMessage"|\s*\})/) || [])[1] ||
        '';
      let draftMessage =
        (cleaned.match(/"draftMessage"\s*:\s*"([\s\S]*?)"(?=\s*\}|$)/) || [])[1] || '';

      if (!draftMessage && cleaned.includes('"draftMessage"')) {
        const draftIdx = cleaned.indexOf('"draftMessage"');
        const colonIdx = cleaned.indexOf(':', draftIdx);
        if (colonIdx !== -1) {
          draftMessage = cleaned
            .substring(colonIdx + 1)
            .replace(/^\s*"/, '')
            .replace(/"\s*\}?\s*$/, '')
            .trim();
        }
      }

      return {
        actionType,
        reasoning: reasoning.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        draftMessage: draftMessage.replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      };
    }
  }
};

const formatWorkDays = (workDays) => {
  if (!workDays) return 'วันจันทร์ ถึง วันศุกร์';
  if (typeof workDays === 'string') return workDays;
  if (Array.isArray(workDays)) {
    const dayMap = {
      mon: 'จันทร์',
      tue: 'อังคาร',
      wed: 'พุธ',
      thu: 'พฤหัสบดี',
      fri: 'ศุกร์',
      sat: 'เสาร์',
      sun: 'อาทิตย์',
    };
    if (
      workDays.length === 5 &&
      ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => workDays.includes(d))
    ) {
      return 'วันจันทร์ ถึง วันศุกร์';
    }
    if (workDays.length === 7) {
      return 'ทุกวัน';
    }
    const thaiDays = workDays.map((d) => dayMap[d.toLowerCase()] || d).filter(Boolean);
    return thaiDays.length > 0 ? `วัน${thaiDays.join(', วัน')}` : 'วันจันทร์ ถึง วันศุกร์';
  }
  return 'วันจันทร์ ถึง วันศุกร์';
};

exports.testKey = async (apiKey, modelName) => {
  try {
    const openai = getClient();
    const model = getModel(modelName);
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply OK' }],
    });
    if (response?.choices?.length > 0) return true;
    throw new Error('Invalid response from Local AI Server');
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      throw new Error(
        'ไม่สามารถเชื่อมต่อกับ Ollama Server ได้ กรุณาตรวจสอบว่าเปิด ollama serve ที่ port 11434 หรือยัง'
      );
    }
    throw new Error(error.message || 'Cannot connect to Local AI Server (Ollama)');
  }
};

exports.extractAppointment = async (apiKey, emailText, modelName) => {
  try {
    const openai = getClient();
    const model = getModel(modelName);
    const today = new Date().toLocaleDateString('en-US', { dateStyle: 'full' });
    const prompt = buildExtractionPrompt(emailText, today);

    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an executive AI assistant that outputs structured JSON data. You MUST strictly reply with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1, // Low temperature for high extraction consistency
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parsed = parseJsonFromLlm(rawContent);

    return {
      isAppointment: Boolean(parsed.isAppointment),
      title: parsed.title || null,
      date: parsed.date || null,
      isTimeSpecified: Boolean(parsed.isTimeSpecified),
      durationMinutes: typeof parsed.durationMinutes === 'number' ? parsed.durationMinutes : 60,
      location: parsed.location || null,
      priority: parsed.priority || 'NORMAL',
    };
  } catch (error) {
    console.error('Local AI Extraction Error:', error.message);
    return { isAppointment: false, priority: 'NORMAL' };
  }
};

const sanitizeDraftText = (text) => {
  if (!text) return '';

  if (typeof text === 'object') {
    return Object.values(text)
      .map((val) => (typeof val === 'object' ? sanitizeDraftText(val) : String(val)))
      .filter(Boolean)
      .join('\n\n');
  }

  let str = String(text).trim();

  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsedObj = JSON.parse(str);
      return sanitizeDraftText(parsedObj);
    } catch (e) {
      str = str
        .replace(/\{\s*/g, '')
        .replace(/\s*\}\s*/g, '')
        .replace(/"(subject|body|signature|text|message|เนื้อหา|ลายเซ็น)"\s*:\s*/gi, '')
        .replace(/^"/, '')
        .replace(/"$/, '');
    }
  }

  return str
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\/g, '')
    .replace(/^"/, '')
    .replace(/"$/, '')
    .trim();
};

exports.draftReplyWithCalendar = async (
  apiKey,
  emailText,
  extractedData,
  existingEvents,
  userSetting,
  modelName
) => {
  try {
    const openai = getClient();
    const model = getModel(modelName);

    // 1. วิเคราะห์ตารางเวลาแบบ Deterministic ผ่าน Scheduler Engine
    const scheduleAnalysis = analyzeSlotAvailability(extractedData, existingEvents, userSetting);

    // 2. จัดเตรียม Context สรรพนาม ลายเซ็น และเวลางาน
    let pronoun = 'ฉัน';
    let politeParticle = 'ครับ/ค่ะ';
    if (userSetting?.gender === 'MALE') {
      pronoun = 'ผม';
      politeParticle = 'ครับ';
    } else if (userSetting?.gender === 'FEMALE') {
      pronoun = 'ดิฉัน';
      politeParticle = 'ค่ะ';
    }

    const tone =
      userSetting?.tone === 'casual'
        ? 'เป็นกันเอง สุภาพ และอบอุ่น (Casual and polite)'
        : 'เป็นทางการ สุภาพ และมืออาชีพ (Formal and professional)';
    const fullName = `${userSetting?.firstName || ''} ${userSetting?.lastName || ''}`.trim();
    const position = userSetting?.position ? `\n${userSetting.position}` : '';
    const signatureText = userSetting?.signature || 'ขอแสดงความนับถือ';
    const fullSignature = `${signatureText}\n${fullName}${position}`.trim();

    const startWork = userSetting?.startTime || '09:00';
    const endWork = userSetting?.endTime || '17:00';
    const workDays = formatWorkDays(userSetting?.workDays);
    const workingHours = `${workDays}, เวลา ${startWork} น. - ${endWork} น.`;

    const prompt = buildDraftPrompt({
      pronoun,
      politeParticle,
      tone,
      extractedData,
      emailText,
      scheduleAnalysis,
      fullSignature,
      workingHours,
    });

    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an executive assistant drafting professional email replies. You MUST reply with valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parsed = parseJsonFromLlm(rawContent);

    const cleanDraft = sanitizeDraftText(parsed.draftMessage);

    return {
      actionType: scheduleAnalysis.actionType, // Strict deterministic decision
      reasoning: scheduleAnalysis.reason || parsed.reasoning || '',
      draftMessage: cleanDraft,
      scheduleAnalysis,
    };
  } catch (error) {
    console.error('Local AI Draft Error:', error.message);
    return {
      actionType: 'RESCHEDULE',
      reasoning: 'Error generating draft with local AI',
      draftMessage: '',
    };
  }
};
