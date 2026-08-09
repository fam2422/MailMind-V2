const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/auth');

const { 
  getEmails, 
  markAsRead, 
  getThread, 
  replyToThread,
  syncEmails
} = require('../controllers/email.controller');

router.get('/', verifyToken, getEmails);
router.post('/sync', verifyToken, syncEmails);
router.post('/mark-read', verifyToken, markAsRead);
router.get('/:threadId', verifyToken, getThread);
router.post('/threads/:threadId', verifyToken, replyToThread);

module.exports = router;