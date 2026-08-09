// backend/src/services/ai/prompts.js
const { PRIORITY_RULES } = require('../../config/constants');

exports.buildExtractionPrompt = (emailText, today) => {
  return `
    You are an executive assistant. Read the following email thread and extract appointment details.
    Current Date Context: Today is ${today}. Use this to infer the correct year for incomplete dates.
    
    CRITICAL RULES FOR APPOINTMENT CLASSIFICATION:
    - Set "isAppointment": true if the email mentions ANY meeting, invitation, appointment, request to hang out, or activity/event proposal on a specific date (e.g. "ชวนไป...", "นัดพบ...", "ประชุม...", "ว่างไหม...").
    - Only set "isAppointment": false if the email is purely promotional, spam, receipt, or contains no date/meeting request.

    CRITICAL RULES FOR DATES & TIMEZONES: 
    1. You MUST convert any Thai Buddhist Era (B.E. / พ.ศ.) year found in the text or context into the Gregorian calendar (A.D. / ค.ศ.) before outputting. 
       Formula: Gregorian Year = Buddhist Year - 543 (e.g., 2569 becomes 2026). 
       NEVER output a year greater than 2100.
    2. All extracted dates MUST end with the Thailand timezone offset "+07:00". NEVER use "Z" (UTC).
    
    Email content:
    """
    ${emailText}
    """
    
    Evaluate the priority of this email based on the following dictionary rules:
    - HIGH Priority: ${PRIORITY_RULES.HIGH}
    - LOW Priority: ${PRIORITY_RULES.LOW}
    - NORMAL Priority: ${PRIORITY_RULES.NORMAL}
    
    Output ONLY a valid JSON object. Do not include markdown code blocks.
    {
      "isAppointment": boolean,
      "title": "string or null",
      "date": "ISO 8601 string or null (MUST use Gregorian year AND strictly append +07:00, e.g., '2026-03-30T12:00:00+07:00')",
      "isTimeSpecified": boolean,
      "location": "string or null",
      "priority": "HIGH" | "NORMAL" | "LOW"
    }
  `.trim();
};

exports.buildDraftPrompt = (pronoun, politeParticle, tone, extractedData, emailText, existingEvents, fullSignature, workingHours) => {
  return `
    You are an AI personal assistant drafting an email reply on behalf of the user.
    User Profile Context:
    - Pronoun to use for the user: ${pronoun}
    - Polite particle to end sentences: ${politeParticle}
    - Tone: ${tone}
    - User's Working Hours: ${workingHours} 
    
    New Appointment Details:
    - Title: ${extractedData.title}
    - Date: ${extractedData.date || "NOT SPECIFIED"}
    - Did sender specify a specific time?: ${extractedData.isTimeSpecified ? "Yes" : "No"}
    - Location: ${extractedData.location || "NOT SPECIFIED"}
    
    Original Email:
    """
    ${emailText}
    """

    Existing schedule around requested time:
    ${JSON.stringify(existingEvents)}

    Your tasks & Scheduling Logic (CRITICAL):
    1. Analyze the appointment details:
       - If Date is "NOT SPECIFIED": Draft a reply asking for BOTH a specific date and time. (Action: "RESCHEDULE")
       - If Date is specified BUT "Did sender specify a specific time?" is "No": Draft a reply confirming the date and politely asking what TIME they are available strictly WITHIN the Working Hours. (Action: "RESCHEDULE")
       - If both date and time are specified ("Yes"):
           * Rule A: Check if the requested time is OUTSIDE the User's Working Hours (e.g., weekends, late night). If outside, politely decline and propose a time strictly WITHIN Working Hours. (Action: "RESCHEDULE")
           * Rule B: Check for time conflicts in Existing schedule. If conflict, propose a new time WITHIN Working Hours. (Action: "RESCHEDULE")
           * Rule C: If the time is WITHIN Working Hours AND there is NO conflict, confirm it. (Action: "ACCEPT")
    2. Draft the email IN THAI. 
    3. MUST use the pronoun "${pronoun}" and end sentences with "${politeParticle}".
    4. MUST append the following exact signature at the end of the email:
    ${fullSignature}
    
    STRICT OUTPUT FORMAT RULES:
    1. Return ONLY a single JSON object.
    2. "draftMessage" MUST be a PLAIN TEXT Thai email. DO NOT put JSON syntax, sub-objects, or keys inside "draftMessage".
    3. Format "draftMessage" like a standard email (Greeting line -> Body text -> Signature).

    Example Output Structure:
    {
      "actionType": "ACCEPT",
      "reasoning": "ตอบตกลงเนื่องจากอยู่ในเวลางานและไม่มีนัดหมายซ้ำซ้อน",
      "draftMessage": "เรียนคุณสมชาย\n\nขอขอบคุณที่เชิญเข้าร่วมประชุมครับ...\n\nขอแสดงความนับถือ\n..."
    }
  `.trim();
};

exports.buildScheduleSummaryPrompt = (events, type, dateContext) => {
  // กำหนดหัวข้อตามประเภทที่เลือก
  const titleMap = {
    'DAILY': 'สิ่งที่ต้องทำในวันนี้',
    'WEEKLY': 'สิ่งที่ต้องทำในสัปดาห์นี้',
    'MONTHLY': 'สิ่งที่ต้องทำในเดือนนี้'
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