// ไฟล์: backend/src/services/notification.service.js
const { google } = require('googleapis');
const { createLogger, createTraceId } = require('../utils/logger');

exports.sendPendingDraftNotification = async (
  oauth2Client,
  userEmail,
  emailMetadata,
  suggestedDate,
  observability
) => {
  const logger = observability?.child
    ? observability.child({}, 'NOTIFICATION')
    : createLogger('NOTIFICATION', { traceId: createTraceId('notification') });
  const startedAt = Date.now();
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // ดึง URL ของ Frontend จาก ENV หรือใช้ค่าเริ่มต้น
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

    // 1. สร้างเนื้อหาอีเมล (HTML) ดีไซน์แจ้งเตือนสีส้ม/เหลือง (รอการตรวจสอบ)
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
        
        <div style="background-color: #f59e0b; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 24px;">🔔 มีนัดหมายใหม่รอการยืนยัน!</h2>
        </div>
        
        <div style="padding: 30px; background-color: #ffffff;">
          <p style="color: #475569; font-size: 16px; line-height: 1.5; margin-top: 0;">
            ผู้ช่วย AI ของคุณพบคำขอนัดหมายใหม่จากอีเมลล่าสุด และได้จัดเตรียม "ร่างการตอบกลับ" พร้อมกะเวลาลงปฏิทินไว้ให้คุณตรวจสอบแล้วครับ
          </p>
          
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 8px 0; color: #334155;"><strong>จาก:</strong> ${emailMetadata.from}</p>
            <p style="margin: 8px 0; color: #334155;"><strong>หัวข้ออีเมล:</strong> ${emailMetadata.subject}</p>
            ${suggestedDate ? `<p style="margin: 8px 0; color: #334155;"><strong>วัน/เวลาที่ AI แนะนำ:</strong> ${new Date(suggestedDate).toLocaleString('th-TH')}</p>` : ''}
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${frontendUrl}/inbox" style="background-color: #f59e0b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
              รีวิวและกดยืนยัน (Approve)
            </a>
          </div>
        </div>

        <div style="background-color: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #64748b; font-size: 12px;">อีเมลฉบับนี้ส่งอัตโนมัติจากระบบ MailMind 🤖</p>
        </div>
      </div>
    `;

    // 2. ตั้งชื่อ Subject เป็นเมลใหม่ฉบับใหม่
    const subject = '🔔 คุณมีการนัดหมายใหม่รอการยืนยัน! (จาก MailMind)';
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    
    // 3. จัดโครงสร้างเป็นอีเมลใหม่เอี่ยม
    const messageParts = [
      `To: ${userEmail}`,
      `Subject: ${utf8Subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      emailHtml
    ];
    
    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 4. สั่งส่งอีเมล
    logger.info('SEND_START', 'Sending pending draft notification', {
      recipient: logger.protect(userEmail),
      subject: logger.protect(subject),
      sourceSubject: logger.protect(emailMetadata.subject),
      sourceFrom: logger.protect(emailMetadata.from),
      suggestedDate,
    });
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      },
    });

    logger.info('SEND_END', 'Pending draft notification sent', {
      durationMs: Date.now() - startedAt,
      gmailMessageId: response.data?.id,
      gmailThreadId: response.data?.threadId,
      recipient: logger.protect(userEmail),
    });
    return { success: true, messageId: response.data?.id, threadId: response.data?.threadId };
  } catch (error) {
    logger.error('SEND_ERROR', 'Failed to send pending draft notification', error, {
      durationMs: Date.now() - startedAt,
      recipient: logger.protect(userEmail),
    });
    return { success: false, error: error.message };
  }
};
