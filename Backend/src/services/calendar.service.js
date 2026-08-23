const { google } = require('googleapis');
const prisma = require('../config/prisma');
const { createOAuth2Client } = require('../config/google');
const { decryptToken } = require('../utils/encryption');
const notificationService = require('./notification.service');
const { createLogger, createTraceId } = require('../utils/logger');

exports.getEventsForUser = async (userId) => {
  // 1. ตรวจสอบข้อมูลผู้ใช้จาก Database
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = decryptToken(user?.refreshToken);
  const accessToken = decryptToken(user?.accessToken);
  
  // โยน Error ออกไปถ้าไม่มีสิทธิ์ (เดี๋ยว Controller จะรับไปแปลงเป็น Status 401 เอง)
  if (!user || !refreshToken) {
    throw new Error('UNAUTHORIZED'); 
  }

  // 2. ตั้งค่าการเชื่อมต่อ Google API
  const authClient = createOAuth2Client({
    refresh_token: refreshToken,
    access_token: accessToken,
  });

  const calendar = google.calendar({ version: 'v3', auth: authClient });

  // 3. คำนวณช่วงเวลา (ย้อนหลัง 1 เดือน และล่วงหน้า 2 เดือน)
  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 1);
  
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 2);

  // 4. ดึงข้อมูลจาก Google Calendar
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: 2500,
    singleEvents: true,
    orderBy: 'startTime',
  });

  // 5. จัดรูปแบบข้อมูล (Format)
  const events = response.data.items.map(item => ({
    id: item.id,
    summary: item.summary || '(ไม่มีชื่อกิจกรรม)',
    start: item.start?.dateTime || item.start?.date || null,
    end: item.end?.dateTime || item.end?.date || null,
    location: item.location || '',
    htmlLink: item.htmlLink || ''
  }));

  return events;
};

exports.addEventToCalendar = async (
  calendar,
  draft,
  metadata,
  userTimezone,
  oauth2Client,
  userEmail,
  observability
) => {
  const logger = observability?.child
    ? observability.child({}, 'CALENDAR')
    : createLogger('CALENDAR', {
        traceId: createTraceId('calendar-insert'),
        draftId: draft?.id,
        messageId: draft?.messageId,
        threadId: draft?.threadId,
      });
  const startedAt = Date.now();
  if (draft.actionType !== 'ACCEPT' || !draft.suggestedDate) {
    logger.info('INSERT_SKIP', 'Calendar event insertion skipped', {
      reason: draft.actionType !== 'ACCEPT' ? 'action_not_accept' : 'missing_suggested_date',
      actionType: draft.actionType,
      suggestedDate: draft.suggestedDate,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }

  const startTime = new Date(draft.suggestedDate);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); 

  // แปลง Timezone
  let timeZone = 'Asia/Bangkok';
  if (userTimezone === 'asia-tokyo') timeZone = 'Asia/Tokyo';
  else if (userTimezone === 'europe-london') timeZone = 'Europe/London';
  else if (userTimezone && userTimezone !== 'asia-bangkok') timeZone = userTimezone;

  const requestBody = {
    summary: draft.subject ? `[นัดหมาย] ${draft.subject}` : 'นัดหมายจาก Mailmind',
    location: draft.location || '',
    description: `นัดหมายนี้ถูกสร้างอัตโนมัติจากระบบ Mailmind AI\n\nอีเมลที่เกี่ยวข้อง: ${metadata.subject}`,
    start: { dateTime: startTime.toISOString(), timeZone },
    end: { dateTime: endTime.toISOString(), timeZone },
    attendees: metadata.cleanEmail ? [{ email: metadata.cleanEmail }] : [],
  };

  logger.info('INSERT_START', 'Creating Google Calendar event', {
    calendarId: 'primary',
    sendUpdates: 'all',
    summary: logger.protect(requestBody.summary),
    location: logger.protect(requestBody.location),
    start: requestBody.start,
    end: requestBody.end,
    attendeeCount: requestBody.attendees.length,
    attendees: requestBody.attendees.map((attendee) => ({ email: logger.protect(attendee.email) })),
  });
  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      sendUpdates: 'all',
      requestBody,
    });

    logger.info('INSERT_END', 'Google Calendar event created', {
      durationMs: Date.now() - startedAt,
      eventId: response.data?.id,
      iCalUID: response.data?.iCalUID,
      status: response.data?.status,
      htmlLink: logger.protect(response.data?.htmlLink),
      attendees: (response.data?.attendees || []).map((attendee) => ({
        email: logger.protect(attendee.email),
        responseStatus: attendee.responseStatus,
        self: attendee.self,
      })),
    });

    return response.data;
  } catch (error) {
    logger.error('INSERT_ERROR', 'Failed to create Google Calendar event', error, {
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
};
