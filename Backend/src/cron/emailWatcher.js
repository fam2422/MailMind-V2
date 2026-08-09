const cron = require('node-cron');
const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { oauth2Client } = require('../config/google');
const notificationService = require('../services/notification.service');
const { decrypt } = require('../utils/encryption');
const { APPOINTMENT_KEYWORDS } = require('../config/constants'); 
const pLimit = require('p-limit');

const localAiService = require('../services/ai/local');

let isCronRunning = false;
const limit = pLimit(3); 

const getEmailText = (payload) => {
  let text = '';
  if (!payload) return text;
  
  if (payload.parts) {
    payload.parts.forEach(part => {
      if (part.mimeType === 'text/plain' && part.body.data) {
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

const processUserEmails = async (user) => {
  const logPrefix = `[${user.email}]`; 
  
  try {
    if (!user.setting) return;
    
    const selectedModel = user.setting.defaultModel || process.env.LOCAL_AI_MODEL || 'llama3.1:8b';
    const aiService = localAiService;
    
    const userOauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    userOauth2Client.setCredentials({ 
      refresh_token: user.refreshToken, 
      access_token: user.accessToken 
    });
    
    const gmail = google.gmail({ version: 'v1', auth: userOauth2Client });
    const calendar = google.calendar({ version: 'v3', auth: userOauth2Client });
    
    const lastSyncDate = user.setting.lastEmailSync || new Date(Date.now() - 60 * 60 * 1000);
    const lastSyncUnix = Math.floor(lastSyncDate.getTime() / 1000);

    const res = await gmail.users.messages.list({ 
      userId: 'me', 
      q: `newer:${lastSyncUnix} is:unread -from:me`, 
      maxResults: 10 
    });
    
    const messages = res.data.messages || [];
  
    if (messages.length === 0) {
      console.log(`${logPrefix} [SKIP] No new emails found. Sync time updated.`);
      
      await prisma.userSetting.update({ 
        where: { userId: user.id },
        data: { lastEmailSync: new Date() }
      });
      return; 
    }

    console.log(`${logPrefix} [INFO] Found ${messages.length} new emails.`);

    for (const msg of messages) {
      try {
        const existingDraft = await prisma.draft.findUnique({ where: { messageId: msg.id } });
        if (existingDraft) continue;

        const mailDetail = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
        const latestText = getEmailText(mailDetail.data.payload);
        const headers = mailDetail.data.payload.headers;
        const threadId = mailDetail.data.threadId;

        let rawSubject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || "No Subject";
        let cleanSubject = rawSubject.replace(/^(re:\s*)+/gi, '').trim(); 
        let msgFrom = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown';
        
        console.log(`${logPrefix} [EMAIL] Processing: "${cleanSubject}"`);

        const hasKeyword = APPOINTMENT_KEYWORDS.some(kw => latestText.toLowerCase().includes(kw));

        if (hasKeyword) {
          const threadDetail = await gmail.users.threads.get({ userId: 'me', id: threadId });
          let fullThreadText = "";
          threadDetail.data.messages.forEach((tMsg) => {
            const tText = getEmailText(tMsg.payload);
            fullThreadText += `\n--- Email From: ${msgFrom} ---\n${tText.trim()}\n`;
          });

          console.log(`${logPrefix} [AI] Analyzing with Local AI (Model: ${selectedModel})...`);
          
          const aiResult = await aiService.extractAppointment(null, fullThreadText, selectedModel);
          
          if (aiResult.isAppointment) {
            console.log(`${logPrefix} [SUCCESS] Appointment detected! Date: ${aiResult.date}`);

            let existingEvents = [];
            let eventDate = aiResult.date ? new Date(aiResult.date) : null;

            if (eventDate) {
              const timeMin = new Date(eventDate.getTime() - 2 * 60 * 60 * 1000).toISOString();
              const timeMax = new Date(eventDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
              const calRes = await calendar.events.list({
                calendarId: 'primary', timeMin, timeMax, singleEvents: true
              });
              existingEvents = calRes.data.items || [];
            }

            const draftResult = await aiService.draftReplyWithCalendar(
              null, fullThreadText, aiResult, existingEvents, user.setting, selectedModel
            );

            if (draftResult.draftMessage) {
              await prisma.draft.create({
                data: {
                  userId: user.id,
                  messageId: msg.id,
                  threadId: threadId,
                  subject: cleanSubject,
                  suggestedDate: eventDate,
                  location: aiResult.location,
                  draftReply: draftResult.draftMessage,
                  status: "PENDING",
                  priority: aiResult.priority || "NORMAL"
                }
              });
              
              await notificationService.sendPendingDraftNotification(
                userOauth2Client, user.email, { from: msgFrom, subject: cleanSubject }, eventDate
              );
              console.log(`${logPrefix} [DONE] Draft created via Local AI (${selectedModel}) and Notification sent.`);
            }
          }
        }
      } catch (msgErr) {
        console.error(`${logPrefix} [ERROR] Failed to process message ${msg.id}:`, msgErr.message);
      }
    }
 

    await prisma.userSetting.update({ 
      where: { userId: user.id },
      data: { lastEmailSync: new Date() }
    });

  } catch (userError) {
    console.error(`${logPrefix} [ERROR] Cycle failed:`, userError.message);
  }
};

const checkNewEmails = async () => {
  if (isCronRunning) {
    console.log("[CRON] ⚠️ Previous cycle still active. Skipping this run.");
    return;
  }

  console.log("\n[CRON] 🚀 Starting parallel email check cycle...");
  isCronRunning = true; 

  try {
    const users = await prisma.user.findMany({
      where: { refreshToken: { not: null } },
      include: { setting: true, apiKeys: true }
    });

    const tasks = users.map(user => limit(() => processUserEmails(user)));
    
    await Promise.all(tasks);

  } catch (error) {
    console.error("[CRON ERROR] Fatal System Failure:", error);
  } finally {
    isCronRunning = false;
    console.log("[CRON] ✅ Parallel cycle finished and unlocked.\n");
  }
};

const startCron = () => {
  cron.schedule('*/10 * * * *', checkNewEmails); 
  console.log("[SYSTEM] Email Watcher Cron Job started (Every 10 mins)");
};

const syncSingleUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { setting: true, apiKeys: true }
  });

  if (!user || !user.refreshToken) {
    throw new Error('UNAUTHORIZED');
  }

  await processUserEmails(user);
  return { success: true, lastEmailSync: new Date() };
};

module.exports = { startCron, syncSingleUser };