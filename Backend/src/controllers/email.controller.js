const gmailService = require('../services/gmail.service'); // ดึง Service มาใช้งาน
const { syncSingleUser } = require('../cron/emailWatcher');

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
    if (error.message === 'UNAUTHORIZED') {
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
    if (error.message === 'UNAUTHORIZED') {
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
    if (error.message === 'UNAUTHORIZED') {
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
    
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google กรุณาล็อกอินใหม่' });
    }
    
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งอีเมลตอบกลับ' });
  }
};

exports.syncEmails = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[INFO] Manual email sync requested for user ${userId}`);
    
    const result = await syncSingleUser(userId);
    res.json({ success: true, message: 'ซิงค์อีเมลสำเร็จ!', ...result });
  } catch (error) {
    console.error('Error syncing emails:', error.message);
    if (error.message === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'ไม่พบการเชื่อมต่อกับ Google กรุณาล็อกอินใหม่' });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการซิงค์อีเมล' });
  }
};