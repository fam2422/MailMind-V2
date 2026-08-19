// backend/src/utils/emailSanitizer.js

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

module.exports = {
  sanitizeEmailText,
};
