// backend/src/services/ai/prompts.js
const { PRIORITY_RULES } = require('../../config/constants');

exports.buildExtractionPrompt = (emailText, today) => {
  return `
You are an executive AI assistant specialized in analyzing email communications and extracting appointment details.
Current Date Context: Today is ${today}. Use this to resolve relative dates like "พรุ่งนี้", "สัปดาห์หน้า", "วันศุกร์นี้".

CRITICAL RULES FOR THREADS & RESCHEDULING RESOLUTION (HIGHEST PRIORITY):
1. In an email thread with multiple messages, you MUST ALWAYS extract the appointment details (Date, Time, Duration, Location, Subject) from the **LATEST (NEWEST) MESSAGE / REPLY** at the bottom of the thread.
2. If earlier messages proposed an initial date (e.g. 17 August), but subsequent replies or the latest reply reschedules, updates, counter-proposes, or agrees to a new date (e.g. "ถ้าอย่างนั้นขอเป็นวันจันทร์ที่ 24 สิงหาคม 2569 เวลา 10:00 - 11:00 น.", "งั้นขอเลื่อนเป็น...", "ขอเปลี่ยนเป็น..."), you MUST EXTRACT THE NEW DATE (24 August 2026) and COMPLETELY DISREGARD all old, outdated, or superseded dates from previous messages.
3. The latest message represents the ACTIVE and CURRENT intent of the conversation.

CRITICAL RULES FOR APPOINTMENT CLASSIFICATION:
- Set "isAppointment": true if the email thread (especially the latest reply) mentions ANY meeting, invitation, appointment, follow-up call, rescheduling, or event proposal (e.g. "ชวนไป...", "นัดพบ...", "ประชุม...", "ว่างไหม...", "สะดวกคุยไหม...", "ขอปรึกษา...", "ขอเลื่อนเป็น...").
- Set "isAppointment": false ONLY if the email is purely promotional newsletter, system automated receipt, spam, or contains no request/intent to meet.

CRITICAL RULES FOR DATES & TIMEZONES:
1. You MUST convert any Thai Buddhist Era (B.E. / พ.ศ.) year found in the text or context into the Gregorian calendar (A.D. / ค.ศ.) before outputting.
   Formula: Gregorian Year = Buddhist Year - 543 (e.g. 2569 becomes 2026).
   NEVER output a year greater than 2100.
2. All extracted dates MUST strictly end with the Thailand timezone offset "+07:00" (e.g., "2026-08-24T10:00:00+07:00"). NEVER use "Z" (UTC).
3. If a specific time is mentioned (e.g., "10:00 น.", "บ่ายสอง", "14.30", "10:00 - 11:00 น."), set "isTimeSpecified": true. If only a date is mentioned without a specific time, set "isTimeSpecified": false and set the time in the date string to "09:00:00+07:00".

DURATION & LOCATION EXTRACTION:
- "durationMinutes": estimate duration in minutes if mentioned (e.g., "30 นาที" -> 30, "10:00 - 11:00 น." -> 60, "2 ชั่วโมง" -> 120, "ครึ่งชั่วโมง" -> 30). Default to 60 if not specified.
- "location": extract physical location, room, or online link/platform (e.g. "Google Meet", "Zoom", "ห้องประชุม 301", "สำนักงาน").

Email Thread Content:
"""
${emailText}
"""

Evaluate the priority of this email based on the following rules:
- HIGH Priority: ${PRIORITY_RULES.HIGH}
- LOW Priority: ${PRIORITY_RULES.LOW}
- NORMAL Priority: ${PRIORITY_RULES.NORMAL}

You MUST reply with a valid JSON object matching this exact schema:
{
  "isAppointment": boolean,
  "title": "string or null",
  "date": "ISO 8601 string with +07:00 or null",
  "isTimeSpecified": boolean,
  "durationMinutes": number,
  "location": "string or null",
  "priority": "HIGH" | "NORMAL" | "LOW"
}
`.trim();
};

exports.buildDraftPrompt = ({
  pronoun,
  politeParticle,
  tone,
  extractedData,
  emailText,
  scheduleAnalysis,
  fullSignature,
  workingHours,
}) => {
  const isAccept = scheduleAnalysis.actionType === 'ACCEPT';

  let decisionInstructions = '';
  if (isAccept) {
    decisionInstructions = `
DECISION: ACCEPT THE APPOINTMENT / CONFIRM RESCHEDULED TIME
- The requested time (${scheduleAnalysis.requestedTimeThai || extractedData.date}) is AVAILABLE and strictly within working hours.
- Draft a warm, polite email confirming your availability and attendance for this appointment (acknowledging the agreed upon time).
- Confirm the location/channel if mentioned (${extractedData.location || 'ตามที่เสนอ'}).
`;
  } else {
    const slotsText =
      scheduleAnalysis.suggestedSlots && scheduleAnalysis.suggestedSlots.length > 0
        ? scheduleAnalysis.suggestedSlots.map((s, idx) => `  ${idx + 1}. ${s}`).join('\n')
        : '  - วันเวลาทำการที่สะดวกในสัปดาห์นี้';

    decisionInstructions = `
DECISION: RESCHEDULE / PROPOSE NEW TIMES
- Reason for not accepting: ${scheduleAnalysis.reason || 'ติดภารกิจอื่นหรืออยู่นอกเวลาทำการ'}
- Politely apologize/inform the sender why the requested time cannot be confirmed.
- Propose the following pre-calculated AVAILABLE time slots to the sender:
${slotsText}
- Ask the sender if any of these suggested times work for them, or if they prefer another slot.
`;
  }

  return `
You are an AI executive personal assistant drafting a reply email on behalf of the user.

USER PROFILE & TONE CONTEXT:
- Pronoun for user: ${pronoun}
- Polite ending particle: ${politeParticle}
- Tone style: ${tone}
- User's Standard Working Hours: ${workingHours}

APPOINTMENT ANALYSIS:
- Topic: ${extractedData.title || 'การนัดหมาย'}
- Location: ${extractedData.location || 'ไม่ได้ระบุ'}
- Decision: ${scheduleAnalysis.actionType}
- Analysis Details: ${scheduleAnalysis.reason}

${decisionInstructions}

ORIGINAL EMAIL THREAD CONTENT:
"""
${emailText}
"""

DRAFTING GUIDELINES (STRICT):
1. Write the entire email in natural, grammatically correct THAI.
2. Must use the pronoun "${pronoun}" and polite particles "${politeParticle}".
3. Structure the email properly:
   - Polite Salutation / Greeting
   - Context acknowledgement and clear Decision (Accept or Reschedule with suggested slots)
   - Closing remark
4. MUST append the following exact signature at the end of the email:
${fullSignature}

OUTPUT FORMAT:
Return a valid JSON object:
{
  "actionType": "${scheduleAnalysis.actionType}",
  "reasoning": "${scheduleAnalysis.reason}",
  "draftMessage": "ข้อความร่างอีเมลภาษาไทยฉบับเต็ม..."
}
`.trim();
};

exports.buildScheduleSummaryPrompt = (events, type, dateContext) => {
  const titleMap = {
    DAILY: 'สิ่งที่ต้องทำในวันนี้',
    WEEKLY: 'สิ่งที่ต้องทำในสัปดาห์นี้',
    MONTHLY: 'สิ่งที่ต้องทำในเดือนนี้',
  };

  const title = titleMap[type] || 'สิ่งที่ต้องทำในช่วงเวลานี้';

  return `
You are an executive AI assistant. Summarize the user's schedule based on the provided events.
Current Date Context: ${dateContext}

Events (JSON):
${JSON.stringify(events, null, 2)}

STRICT OUTPUT RULES:
1. Start the response with exactly this markdown header: "# ${title}"
2. Write the entire response in THAI.
3. NO emojis, NO icons, and NO introductory text (like "นี่คือสรุปของคุณ").
4. Use standard bullet points (-) for the list of tasks or events.
5. Group related events and mention specific times clearly.
6. If there are no events, say: "- ไม่มีกิจกรรมที่บันทึกไว้"
7. Focus only on what needs to be done and the schedule flow.

Example Output Structure:
# สิ่งที่ต้องทำในวันนี้
- 09:00 น. ประชุมทีมงาน
- 13:00 น. พบลูกค้าที่บริษัท
- ช่วงบ่ายคุณมีเวลาว่างสำหรับเคลียร์งานส่วนตัว
`.trim();
};