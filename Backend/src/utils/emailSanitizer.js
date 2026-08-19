// backend/src/utils/emailSanitizer.js

/**
 * แกะข้อความ Plain text / HTML จาก Gmail Payload
 */
const getEmailText = (payload) => {
  let text = '';
  if (!payload) return text;

  if (payload.parts) {
    payload.parts.forEach((part) => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
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

/**
 * ตัดข้อความตอบกลับเดิม (Quoted text), ลายเซ็นเก่า, และส่วนประกอบที่ไม่จำเป็นออกจากข้อความอีเมล
 * เพื่อลดขนาด Token และเพิ่มความแม่นยำในการวิเคราะห์ของ LLM
 */
const sanitizeEmailText = (rawText) => {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText;

  // 1. ตัดประวัติการตอบกลับ (Quoted chains)
  const quotePatterns = [
    /-----Original Message-----[\s\S]*/i,
    /_{10,}[\s\S]*/,
    /-{10,}[\s\S]*/,
    /On\s+.+?wrote:[\s\S]*/i,
    /เมื่อ\s+.+?เขียนว่า:[\s\S]*/i,
    /From:\s*.+?Sent:\s*.+?To:\s*.+?Subject:[\s\S]*/i,
    /จาก:\s*.+?ส่งเมื่อ:\s*.+?ถึง:\s*.+?หัวข้อ:[\s\S]*/i,
  ];

  for (const pattern of quotePatterns) {
    text = text.replace(pattern, '');
  }

  // 2. ตัดบรรทัดที่ขึ้นต้นด้วย '>' (Quoted line markers)
  const lines = text.split('\n');
  const filteredLines = lines.filter((line) => !line.trim().startsWith('>'));
  text = filteredLines.join('\n');

  // 3. ตัดข้อความท้ายอีเมลมาตรฐาน (Email client signatures / Disclaimers)
  const footerPatterns = [
    /Sent from my iPhone.*/i,
    /Sent from my Galaxy.*/i,
    /Sent from Mail for Windows.*/i,
    /ส่งจากสมาร์ทโฟนของฉัน.*/i,
    /This email and any attachments are confidential[\s\S]*/i,
    /ข้อความนี้และเอกสารแนบเป็นความลับ[\s\S]*/i,
  ];

  for (const pattern of footerPatterns) {
    text = text.replace(pattern, '');
  }

  // 4. ลบช่องว่าง/ขึ้นบรรทัดใหม่ซ้ำซ้อนเกิน 2 บรรทัด
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text;
};

/**
 * จัดรูปแบบอีเมลทั้ง Thread ตามลำดับเวลา พร้อมระบุลำดับข้อความและเน้นย้ำข้อความล่าสุด (Latest Message)
 * เพื่อให้ AI เข้าใจบริบทการสนทนาและการเลื่อนนัดหมาย (Rescheduling) ได้อย่างแม่นยำ 100%
 */
const formatThreadForAi = (messages) => {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return {
      formattedThread: '',
      latestMessageText: '',
      latestFrom: 'Unknown',
    };
  }

  const total = messages.length;
  const formattedSections = [];

  messages.forEach((msg, index) => {
    const rawText = getEmailText(msg.payload);
    const cleanText = sanitizeEmailText(rawText);
    const headers = msg.payload?.headers || [];
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
    const date = headers.find((h) => h.name.toLowerCase() === 'date')?.value || '';
    const isLatest = index === total - 1;

    let headerLabel = '';
    if (total === 1) {
      headerLabel = `[SINGLE EMAIL MESSAGE]`;
    } else if (isLatest) {
      headerLabel = `[MESSAGE ${index + 1} of ${total} - 🌟 LATEST NEW REPLY (CURRENT FOCUS & HIGHEST PRIORITY)]`;
    } else if (index === 0) {
      headerLabel = `[MESSAGE ${index + 1} of ${total} - (Original Initial Email)]`;
    } else {
      headerLabel = `[MESSAGE ${index + 1} of ${total} - (Previous Intermediate Reply)]`;
    }

    formattedSections.push(
      `${headerLabel}\nFrom: ${from}\nDate: ${date}\nContent:\n${cleanText.trim()}`
    );
  });

  const latestMsg = messages[total - 1];
  const latestRaw = getEmailText(latestMsg.payload);
  const latestCleanText = sanitizeEmailText(latestRaw);
  const latestHeaders = latestMsg.payload?.headers || [];
  const latestFrom =
    latestHeaders.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown';

  return {
    formattedThread: formattedSections.join('\n\n---------------------------------\n\n'),
    latestMessageText: latestCleanText,
    latestFrom,
  };
};

module.exports = {
  getEmailText,
  sanitizeEmailText,
  formatThreadForAi,
};
