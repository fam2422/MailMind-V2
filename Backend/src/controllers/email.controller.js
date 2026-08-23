const gmailService = require('../services/gmail.service'); // ดึง Service มาใช้งาน
const { syncSingleUser } = require('../cron/emailWatcher');
const { createLogger, createTraceId } = require('../utils/logger');

const isAuthError = (error) => {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    msg === 'unauthorized' ||
    msg.includes('invalid_grant') ||
    msg.includes('invalid credentials') ||
    msg.includes('token has been expired') ||
    msg.includes('invalid_request') ||
    error.code === 401 ||
    error.status === 401 ||
    error.response?.status === 401
  );
};

exports.getEmails = async (req, res) => {
  try {
    const { pageToken, pageSize = 10 } = req.query;
    const userId = req.user.id;

    // 🌟 ส่งงานไปให้ Service จัดการการดึงอีเมล
    const result = await gmailService.getInboxEmails(userId, pageToken, pageSize);
    
    // ได้ผลลัพธ์มาก็ส่งกลับหน้าเว็บเลย
    res.json(result);

  } catch (error) {
    console.error('Error fetching emails:', error.message);
    
    // ดักจับ Error กรณีหลุด Auth
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google กรุณาล็อกอินใหม่' });
    }
    
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงอีเมล' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.body;
    const userId = req.user.id; 

    // 🌟 สั่ง Service ให้เปลี่ยนสถานะอีเมล
    await gmailService.markEmailAsRead(userId, messageId);

    console.log(`[INFO] Marked email ${messageId} as read for user ${userId}.`);
    res.json({ success: true, message: 'Marked as read' });

  } catch (error) {
    console.error('Error marking as read:', error.message);
    
    // ดักจับ Error กรณีหลุด Auth
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.status(500).json({ error: 'Failed to mark email as read' });
  }
};

exports.getThread = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = req.user.id;

    // 🌟 สั่ง Service ไปดึงข้อมูล Thread คืนมา
    const items = await gmailService.getThreadDetails(userId, threadId);

    // ส่งกลับไปให้หน้าเว็บ
    res.json({ items });

  } catch (error) {
    // 🌟 ดักจับ Error ตามประเภทที่ Service โยนออกมา
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google' });
    }
    
    if (error.message === 'NOT_FOUND') {
      console.log(`[INFO] Thread ID ${req.params.threadId} not found in Gmail (Likely deleted).`);
      return res.status(404).json({ error: 'ไม่พบข้อมูลอีเมลนี้ (อาจถูกลบไปแล้วในระบบ Gmail)' });
    }

    console.error('Error fetching thread:', error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอีเมล' });
  }
};

// 🌟 คอนโทรลเลอร์ใหม่: รับค่าจาก Frontend มาสั่ง Service ส่งอีเมล
exports.replyToThread = async (req, res) => {
  try {
    const { threadId } = req.params;
    const { messageId, replyText } = req.body;
    const userId = req.user.id;

    if (!replyText || !replyText.trim()) {
      return res.status(400).json({ error: 'กรุณาพิมพ์ข้อความตอบกลับ' });
    }

    // สั่ง Service ส่งอีเมล
    await gmailService.sendDirectReply(userId, threadId, messageId, replyText);

    console.log(`[INFO] User ${userId} directly replied to thread ${threadId}`);
    res.json({ success: true, message: 'ส่งอีเมลตอบกลับสำเร็จ!' });

  } catch (error) {
    console.error('Error sending direct reply:', error.message);
    
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google กรุณาล็อกอินใหม่' });
    }
    
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งอีเมลตอบกลับ' });
  }
};

exports.syncEmails = async (req, res) => {
  const userId = req.user.id;
  const logger = createLogger('API', {
    traceId: createTraceId('manual-sync'),
    operation: 'manual-email-sync',
    userId,
  });
  try {
    logger.info('REQUEST_START', 'Manual email sync requested');
    const result = await syncSingleUser(userId, { logger });
    logger.info('REQUEST_END', 'Manual email sync request completed');
    res.json({ success: true, message: 'ซิงค์อีเมลสำเร็จ!', ...result });
  } catch (error) {
    logger.error('REQUEST_ERROR', 'Manual email sync request failed', error);
    if (isAuthError(error)) {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google กรุณาล็อกอินใหม่' });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการซิงค์อีเมล' });
  }
};
