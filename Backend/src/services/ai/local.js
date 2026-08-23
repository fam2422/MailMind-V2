// backend/src/services/ai/local.js
const { OpenAI } = require('openai');
const { buildExtractionPrompt, buildDraftPrompt } = require('./prompts');
const { analyzeSlotAvailability } = require('./scheduler');
const { createLogger, createTraceId } = require('../../utils/logger');

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

const compactText = (text, maxLength = 600) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}… [truncated ${normalized.length - maxLength} chars]`;
};

const parseJsonFromLlm = (text, diagnostics = {}) => {
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
    diagnostics.strategy = 'direct-json';
    return JSON.parse(cleaned);
  } catch (err1) {
    try {
      let fixed = cleaned.replace(/\\([^"\\\/bfnrtu])/g, '\\\\$1');
      fixed = fixed.replace(/[\r\n]/g, '\\n');
      diagnostics.strategy = 'repaired-json';
      return JSON.parse(fixed);
    } catch (err2) {
      diagnostics.strategy = 'regex-fallback';
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

exports.extractAppointment = async (apiKey, emailText, modelName, observability) => {
  const logger = observability?.child
    ? observability.child({}, 'AI')
    : createLogger('AI', { traceId: createTraceId('ai-extract') });
  const startedAt = Date.now();
  try {
    const openai = getClient();
    const model = getModel(modelName);
    const baseURL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';
    const today = new Date().toLocaleDateString('en-US', { dateStyle: 'full' });
    const prompt = buildExtractionPrompt(emailText, today);
    const systemPrompt =
      'You are an executive AI assistant that outputs structured JSON data. You MUST strictly reply with valid JSON only.';

    logger.info('EXTRACTION_START', 'Starting appointment extraction', {
      model,
      baseURL,
      temperature: 0.1,
      inputLength: emailText?.length || 0,
    });
    logger.debug('EXTRACTION_INPUT', 'AI case and input parameters', {
      case: 'APPOINTMENT_EXTRACTION',
      parameters: {
        model,
        currentDate: today,
        temperature: 0.1,
        emailTextLength: emailText?.length || 0,
        emailTextPreview: logger.protect(compactText(emailText, 240)),
      },
    });

    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1, // Low temperature for high extraction consistency
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parseDiagnostics = {};
    const parsed = parseJsonFromLlm(rawContent, parseDiagnostics);
    if (parseDiagnostics.strategy !== 'direct-json') {
      logger.sensitiveBlock(
        'EXTRACTION_RAW_RESPONSE_DIAGNOSTIC',
        'AI EXTRACTION RAW RESPONSE (PARSER DIAGNOSTIC)',
        compactText(rawContent, 1000),
        { finishReason: response.choices[0]?.finish_reason }
      );
    }

    const result = {
      isAppointment: Boolean(parsed.isAppointment),
      title: parsed.title || null,
      date: parsed.date || null,
      isTimeSpecified: Boolean(parsed.isTimeSpecified),
      durationMinutes: typeof parsed.durationMinutes === 'number' ? parsed.durationMinutes : 60,
      location: parsed.location || null,
      priority: parsed.priority || 'NORMAL',
    };
    logger.info('EXTRACTION_END', 'Appointment extraction completed', {
      durationMs: Date.now() - startedAt,
      parserStrategy: parseDiagnostics.strategy,
      usage: response.usage,
      result: {
        ...result,
        title: logger.protect(result.title),
        location: logger.protect(result.location),
      },
    });
    return result;
  } catch (error) {
    logger.error('EXTRACTION_ERROR', 'Appointment extraction failed', error, {
      durationMs: Date.now() - startedAt,
    });
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
  modelName,
  observability
) => {
  const logger = observability?.child
    ? observability.child({}, 'AI')
    : createLogger('AI', { traceId: createTraceId('ai-draft') });
  const startedAt = Date.now();
  try {
    const openai = getClient();
    const model = getModel(modelName);
    const baseURL = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';

    logger.info('DRAFT_START', 'Starting deterministic scheduling and AI draft generation', {
      model,
      baseURL,
      temperature: 0.3,
      isAppointment: Boolean(extractedData?.isAppointment),
      calendarEventCount: existingEvents?.length || 0,
    });

    // 1. วิเคราะห์ตารางเวลาเฉพาะเมื่อเป็นการนัดหมาย
    let scheduleAnalysis = {
      actionType: 'GENERAL_REPLY',
      reason: 'อีเมลทั่วไป ไม่พบข้อมูลการนัดหมาย',
      suggestedSlots: [],
      isAvailable: false,
    };

    if (extractedData?.isAppointment) {
      scheduleAnalysis = analyzeSlotAvailability(extractedData, existingEvents, userSetting, logger);
    }

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
    const systemPrompt =
      'You are an executive assistant drafting professional email replies. You MUST reply with valid JSON only.';

    const draftCase = extractedData?.isAppointment
      ? `APPOINTMENT_DRAFT_${scheduleAnalysis.actionType}`
      : 'GENERAL_REPLY_DRAFT';
    logger.debug('DRAFT_INPUT', 'AI case and input parameters', {
      case: draftCase,
      parameters: {
        model,
        temperature: 0.3,
        pronoun,
        politeParticle,
        tone,
        workingHours,
        signature: logger.protect(fullSignature),
        extractedData: {
          ...extractedData,
          title: logger.protect(extractedData?.title),
          location: logger.protect(extractedData?.location),
        },
        scheduleAnalysis: {
          ...scheduleAnalysis,
          reason: logger.protect(scheduleAnalysis.reason),
        },
        emailTextLength: emailText?.length || 0,
        emailTextPreview: logger.protect(compactText(emailText, 240)),
      },
    });

    const response = await openai.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const rawContent = response.choices[0]?.message?.content || '{}';
    const parseDiagnostics = {};
    const parsed = parseJsonFromLlm(rawContent, parseDiagnostics);

    const cleanDraft = sanitizeDraftText(parsed.draftMessage);
    if (parseDiagnostics.strategy !== 'direct-json' || !cleanDraft) {
      logger.sensitiveBlock(
        'DRAFT_RAW_RESPONSE_DIAGNOSTIC',
        'AI DRAFT RAW RESPONSE (PARSER/EMPTY-DRAFT DIAGNOSTIC)',
        compactText(rawContent, 1000),
        { finishReason: response.choices[0]?.finish_reason }
      );
    }

    const result = {
      actionType: scheduleAnalysis.actionType, // Strict deterministic decision
      reasoning: scheduleAnalysis.reason || parsed.reasoning || '',
      draftMessage: cleanDraft,
      scheduleAnalysis,
    };
    logger.info('DRAFT_END', 'AI draft generation completed', {
      durationMs: Date.now() - startedAt,
      parserStrategy: parseDiagnostics.strategy,
      usage: response.usage,
      actionType: result.actionType,
      reasoning: logger.protect(result.reasoning),
      draftLength: cleanDraft.length,
    });
    if (cleanDraft) {
      logger.sensitiveBlock('DRAFT_FINAL_MESSAGE', 'FINAL DRAFT MESSAGE', cleanDraft);
    }
    return result;
  } catch (error) {
    logger.error('DRAFT_ERROR', 'AI draft generation failed', error, {
      durationMs: Date.now() - startedAt,
    });
    return {
      actionType: 'RESCHEDULE',
      reasoning: 'Error generating draft with local AI',
      draftMessage: '',
    };
  }
};
