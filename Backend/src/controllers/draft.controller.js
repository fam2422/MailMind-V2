const draftService = require('../services/draft.service');
const { createLogger, createTraceId } = require('../utils/logger');

// 1. สั่ง AI ร่างอีเมล
exports.generateDraftOnDemand = async (req, res) => {
  const { threadId } = req.body;
  const userId = req.user.id;
  const logger = createLogger('API', {
    traceId: createTraceId('draft-generate'),
    operation: 'generate-draft',
    userId,
    threadId,
  });
  try {
    logger.info('REQUEST_START', 'On-demand draft generation requested');
    const result = await draftService.generateDraft(userId, threadId, logger);
    logger.info('REQUEST_END', 'On-demand draft generation request completed');
    res.json(result);

  } catch (error) {
    logger.error('REQUEST_ERROR', 'On-demand draft generation request failed', error);
    res.status(error.message.includes('กรุณาตั้งค่า') ? 400 : 500).json({ 
      error: error.message || 'เกิดข้อผิดพลาดในการให้ AI สร้างข้อความร่าง' 
    });
  }
};

// 2. อนุมัติและส่งอีเมล
exports.approveAndSendDraft = async (req, res) => {
  const { id: draftId } = req.params;
  const { editedReply } = req.body;
  const userId = req.user.id;
  const logger = createLogger('API', {
    traceId: createTraceId('approval'),
    operation: 'approve-draft',
    userId,
    draftId,
  });
  try {
    logger.info('REQUEST_START', 'Draft approval requested', {
      hasEditedReply: Boolean(editedReply),
    });
    const result = await draftService.approveAndSend(userId, draftId, editedReply, logger);
    logger.info('REQUEST_END', 'Draft approval request completed');
    res.json(result);

  } catch (error) {
    logger.error('REQUEST_ERROR', 'Draft approval request failed', error);
    res.status(error.message === "ไม่พบ Draft นี้" ? 404 : 500).json({ error: error.message });
  }
};

// 3. ดึงรายการ Draft ทั้งหมด
exports.getDrafts = async (req, res) => {
  try {
    const drafts = await draftService.getUserDrafts(req.user.id);
    res.json(drafts);
  } catch (error) {
    console.error("Get Drafts Error:", error);
    res.status(500).json({ error: "ไม่สามารถดึงข้อมูล Draft ได้" });
  }
};

// 4. ยกเลิก Draft
exports.rejectDraft = async (req, res) => {
  try {
    const { id: draftId } = req.params;
    const result = await draftService.rejectDraft(req.user.id, draftId);
    res.json(result);
  } catch (error) {
    console.error("Reject Draft Error:", error);
    res.status(500).json({ error: "ไม่สามารถยกเลิก Draft ได้" });
  }
};
