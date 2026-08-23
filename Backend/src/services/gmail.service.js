const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');


// Helper Functions
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

const decodeBase64 = (data) => {
  if (!data) return '';
  const buff = Buffer.from(data, 'base64');
  return buff.toString('utf-8');
};

const getEmailBody = (payload) => {
  let htmlBody = '';
  let textBody = '';

  const extract = (part) => {
    if (part.mimeType === 'text/html' && part.body?.data) {
      htmlBody += decodeBase64(part.body.data);
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      textBody += decodeBase64(part.body.data);
    } else if (part.parts) {
      part.parts.forEach(extract);
    }
  };

  if (payload.parts) {
    payload.parts.forEach(extract);
  } else if (payload.body && payload.body.data) {
    if (payload.mimeType === 'text/html') htmlBody = decodeBase64(payload.body.data);
    else textBody = decodeBase64(payload.body.data);
  }

  return htmlBody || textBody || '';
};
// ฟังก์ชันสำหรับดึงรายการอีเมล
exports.getInboxEmails = async (userId, pageToken, pageSize = 10) => {
  // 1. ดึงข้อมูล User จาก Database
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);
  
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED'); // ส่ง Error ให้ Controller ไปจัดการ 401
  }

  try {
    // 2. ตั้งค่า Token เฉพาะ User นี้
    const authClient = createOAuth2Client({
      refresh_token: refreshToken,
      access_token: accessToken, 
    });

    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // 3. ดึงรายการ ID ของอีเมล
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: parseInt(pageSize),
      pageToken: pageToken,
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken;

    // 4. วนลูปนำ ID ไปดึงรายละเอียด
    const emailDetailsPromises = messages.map(async (msg) => {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata', 
        metadataHeaders: ['Subject', 'From', 'Date'],
      });

      const data = msgRes.data;
      const headers = data.payload.headers;

      // แกะข้อมูล Header
      const subject = headers.find((h) => h.name === 'Subject')?.value || '(ไม่มีหัวข้อ)';
      const from = headers.find((h) => h.name === 'From')?.value || '(ไม่ทราบผู้ส่ง)';
      const date = headers.find((h) => h.name === 'Date')?.value || new Date(parseInt(data.internalDate)).toISOString();

      // เช็คสถานะการอ่านและป้ายกำกับ
      const labels = data.labelIds || [];
      const isRead = !labels.includes('UNREAD');
      
      let status = '';
      if (labels.includes('SENT')) status = 'Sent';
      else if (labels.includes('DRAFT')) status = 'Draft';

      return {
        id: data.id,
        threadId: data.threadId,
        snippet: data.snippet,
        isRead,
        from,
        subject,
        date,
        status,
      };
    });

    const items = await Promise.all(emailDetailsPromises);

    // ส่งข้อมูลกลับไปให้ Controller
    return {
      items,
      nextPageToken,
      hasMore: !!nextPageToken,
    };
  } catch (error) {
    if (isAuthError(error)) {
      throw new Error('UNAUTHORIZED');
    }
    throw error;
  }
};

// ฟังก์ชันสำหรับเปลี่ยนสถานะอีเมลเป็นอ่านแล้ว
exports.markEmailAsRead = async (userId, messageId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);
  
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED');
  }

  const authClient = createOAuth2Client({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: authClient });

  // สั่งลบ Label 'UNREAD'
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  });

  return true; // สำเร็จ
};

// 🌟 เพิ่มฟังก์ชันใหม่สำหรับดึงข้อมูล Thread
exports.getThreadDetails = async (userId, threadId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);
  
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED');
  }

  const authClient = createOAuth2Client({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: authClient });

  try {
    // ดึงข้อมูลทั้ง Thread แบบ Full
    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full'
    });

    const messages = threadRes.data.messages || [];

    // แปลงข้อมูลให้ตรงกับ Type ที่ Frontend ต้องการ
    const items = messages.map(msg => {
      const headers = msg.payload.headers;
      const subject = headers.find((h) => h.name === 'Subject')?.value || '(ไม่มีหัวข้อ)';
      const from = headers.find((h) => h.name === 'From')?.value || '(ไม่ทราบผู้ส่ง)';
      const date = headers.find((h) => h.name === 'Date')?.value || new Date(parseInt(msg.internalDate)).toISOString();
      
      const labels = msg.labelIds || [];
      const isRead = !labels.includes('UNREAD');

      const body = getEmailBody(msg.payload);

      return {
        id: msg.id,
        threadId: msg.threadId,
        from,
        subject,
        date,
        internalDate: msg.internalDate,
        snippet: msg.snippet,
        isRead,
        body
      };
    });

    return items;

  } catch (error) {
    // โยน Error 404 ออกไปให้ Controller ทราบว่าหาอีเมลไม่เจอ
    if (error.code === 404 || error.status === 404) {
      throw new Error('NOT_FOUND');
    }
    throw error; // นอกนั้นโยน Error ปกติออกไป
  }
};

exports.getOriginalEmailMetadata = async (gmail, messageId) => {
  const originalMsg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'Message-ID', 'References', 'Subject']
  });

  const headers = originalMsg.data.payload.headers;
  const fromEmail = headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
  const originalMessageId = headers.find(h => h.name.toLowerCase() === 'message-id')?.value || '';
  const originalReferences = headers.find(h => h.name.toLowerCase() === 'references')?.value || '';
  const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '';

  const emailRegex = /<([^>]+)>/;
  const match = fromEmail.match(emailRegex);
  const cleanEmail = match ? match[1] : fromEmail.trim();

  return { fromEmail, cleanEmail, originalMessageId, originalReferences, subject };
};

exports.sendEmailReply = async (gmail, draft, metadata, editedReply, observability) => {
  const logger = observability?.child ? observability.child({}, 'GMAIL') : null;
  const startedAt = Date.now();
  try {
    const replySubject = metadata.subject.toLowerCase().startsWith('re:')
      ? metadata.subject
      : `Re: ${metadata.subject || draft.subject}`;

    const emailLines = [
      `To: ${metadata.fromEmail}`,
      `Subject: =?utf-8?B?${Buffer.from(replySubject).toString('base64')}?=`,
      `In-Reply-To: ${metadata.originalMessageId}`,
      `References: ${metadata.originalReferences} ${metadata.originalMessageId}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      ``,
      editedReply || draft.draftReply
    ];

    const rawEmail = emailLines.join('\n');
    const encodedEmail = Buffer.from(rawEmail).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    logger?.info('REPLY_SEND_START', 'Sending approved email reply through Gmail', {
      recipient: logger.protect(metadata.fromEmail),
      subject: logger.protect(replySubject),
      replyLength: (editedReply || draft.draftReply || '').length,
      inReplyTo: metadata.originalMessageId,
    });
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedEmail, threadId: draft.threadId }
    });
    logger?.info('REPLY_SEND_END', 'Approved email reply sent through Gmail', {
      durationMs: Date.now() - startedAt,
      gmailMessageId: response.data?.id,
      gmailThreadId: response.data?.threadId,
      labelIds: response.data?.labelIds,
    });
    return response.data;
  } catch (error) {
    logger?.error('REPLY_SEND_ERROR', 'Failed to send approved email reply through Gmail', error, {
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
};

exports.sendDirectReply = async (userId, threadId, messageId, replyText) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);
  
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED');
  }

  const authClient = createOAuth2Client({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const gmail = google.gmail({ version: 'v1', auth: authClient });

  // 1. ดึง Metadata จากอีเมลต้นฉบับที่เราต้องการตอบกลับ
  const metadata = await exports.getOriginalEmailMetadata(gmail, messageId);

  // 2. เตรียมข้อมูลหัวข้อ (Subject)
  const replySubject = metadata.subject.toLowerCase().startsWith('re:') 
    ? metadata.subject 
    : `Re: ${metadata.subject}`;

  // 3. จัด Format อีเมล
  const emailLines = [
    `To: ${metadata.fromEmail}`,
    `Subject: =?utf-8?B?${Buffer.from(replySubject).toString('base64')}?=`,
    `In-Reply-To: ${metadata.originalMessageId}`,
    `References: ${metadata.originalReferences} ${metadata.originalMessageId}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    replyText
  ];

  const rawEmail = emailLines.join('\n');
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 4. สั่งส่งอีเมล โดยระบุ threadId เดิมเพื่อให้ไปต่อท้ายในกระทู้เดียวกัน
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { 
      raw: encodedEmail, 
      threadId: threadId 
    }
  });

  return true;
};
