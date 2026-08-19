// backend/src/services/ai/scheduler.js

const DAY_MAP = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const THAI_DAY_NAMES = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
];

const THAI_MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

/**
 * แปลงเวลา "HH:mm" เป็นนาทีนับจากเที่ยงคืน (e.g. "09:30" -> 570)
 */
const parseTimeToMinutes = (timeStr, defaultMinutes = 0) => {
  if (!timeStr || typeof timeStr !== 'string') return defaultMinutes;
  const parts = timeStr.split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return parts[0] * 60 + parts[1];
  }
  return defaultMinutes;
};

/**
 * ฟอร์แมตเวลา Date เป็นข้อความภาษาไทยที่อ่านง่าย
 * e.g. "วันพฤหัสบดีที่ 20 สิงหาคม 2569 เวลา 10:00 - 11:00 น."
 */
const formatThaiSlot = (startDate, endDate) => {
  const dayName = THAI_DAY_NAMES[startDate.getDay()];
  const dateNum = startDate.getDate();
  const monthName = THAI_MONTH_NAMES[startDate.getMonth()];
  const thaiYear = startDate.getFullYear() + 543;

  const pad = (n) => String(n).padStart(2, '0');
  const startH = pad(startDate.getHours());
  const startM = pad(startDate.getMinutes());
  const endH = pad(endDate.getHours());
  const endM = pad(endDate.getMinutes());

  return `${dayName}ที่ ${dateNum} ${monthName} ${thaiYear} เวลา ${startH}:${startM} - ${endH}:${endM} น.`;
};

/**
 * ฟอร์แมตเวลาเริ่มต้นสำหรับระบุในข้อความ
 */
const formatThaiDateTime = (dateObj) => {
  const dayName = THAI_DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = THAI_MONTH_NAMES[dateObj.getMonth()];
  const thaiYear = dateObj.getFullYear() + 543;

  const pad = (n) => String(n).padStart(2, '0');
  const h = pad(dateObj.getHours());
  const m = pad(dateObj.getMinutes());

  return `${dayName}ที่ ${dateNum} ${monthName} ${thaiYear} เวลา ${h}:${m} น.`;
};

/**
 * ค้นหาช่วงเวลาว่าง (Deterministic Available Slots) ที่ตรงตาม Working Hours และไม่ชน Calendar
 */
const findAvailableSlots = (
  baseDate,
  durationMinutes,
  existingEvents,
  userSetting,
  maxSlots = 3
) => {
  const allowedDays = (userSetting?.workDays || ['mon', 'tue', 'wed', 'thu', 'fri'])
    .map((d) => DAY_MAP[d.toLowerCase()])
    .filter((d) => d !== undefined);

  const startWorkMin = parseTimeToMinutes(userSetting?.startTime, 9 * 60); // 09:00
  const endWorkMin = parseTimeToMinutes(userSetting?.endTime, 17 * 60); // 17:00
  const duration = durationMinutes && durationMinutes > 0 ? durationMinutes : 60;

  const availableSlots = [];
  const now = new Date();

  // กำหนดวันเริ่มต้นค้นหา (อย่างน้อยคือวันพรุ่งนี้ หรือวันเดียวกับ baseDate หากเป็นอนาคต)
  let searchDate = baseDate && baseDate > now ? new Date(baseDate) : new Date(now);
  searchDate.setHours(0, 0, 0, 0);

  // ค้นหาไปข้างหน้าไม่เกิน 14 วัน
  for (let dayOffset = 0; dayOffset < 14 && availableSlots.length < maxSlots; dayOffset++) {
    const currentDay = new Date(searchDate);
    currentDay.setDate(searchDate.getDate() + dayOffset);

    // ตรวจสอบว่าเป็นวันทำงานหรือไม่
    if (!allowedDays.includes(currentDay.getDay())) {
      continue;
    }

    // สร้าง candidate slots ทุก 1 ชั่วโมง ในช่วงเวลางาน
    for (
      let slotStartMin = startWorkMin;
      slotStartMin + duration <= endWorkMin && availableSlots.length < maxSlots;
      slotStartMin += 60
    ) {
      const slotStart = new Date(currentDay);
      slotStart.setHours(Math.floor(slotStartMin / 60), slotStartMin % 60, 0, 0);

      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      // ข้ามถ้าเป็นเวลาในอดีต (ต้องล่วงหน้าอย่างน้อย 2 ชั่วโมง)
      if (slotStart.getTime() <= now.getTime() + 2 * 60 * 60 * 1000) {
        continue;
      }

      // ตรวจสอบการชนกับ existing events
      const hasOverlap = (existingEvents || []).some((evt) => {
        const evtStart = new Date(evt.start?.dateTime || evt.start?.date || evt.start);
        const evtEnd = new Date(evt.end?.dateTime || evt.end?.date || evt.end);
        if (isNaN(evtStart.getTime()) || isNaN(evtEnd.getTime())) return false;
        return slotStart < evtEnd && slotEnd > evtStart;
      });

      if (!hasOverlap) {
        availableSlots.push({
          start: slotStart,
          end: slotEnd,
          thaiText: formatThaiSlot(slotStart, slotEnd),
        });
      }
    }
  }

  return availableSlots;
};

/**
 * วิเคราะห์ความพร้อมของวันเวลาที่ขอนัดหมายอย่างแม่นยำ 100% (Deterministic Logic)
 */
const analyzeSlotAvailability = (extractedData, existingEvents, userSetting) => {
  const duration = extractedData?.durationMinutes || 60;

  // 1. กรณีไม่ระบุวันที่ หรือไม่ระบุเวลา
  if (!extractedData?.date || !extractedData?.isTimeSpecified) {
    const baseDate = extractedData?.date ? new Date(extractedData.date) : new Date();
    const suggestions = findAvailableSlots(baseDate, duration, existingEvents, userSetting, 3);
    return {
      status: 'TIME_NOT_SPECIFIED',
      actionType: 'RESCHEDULE',
      reason: 'ผู้ส่งไม่ได้ระบุเวลาการนัดหมายที่ชัดเจน',
      suggestedSlots: suggestions.map((s) => s.thaiText),
      isAvailable: false,
    };
  }

  const requestedStart = new Date(extractedData.date);
  if (isNaN(requestedStart.getTime())) {
    const suggestions = findAvailableSlots(new Date(), duration, existingEvents, userSetting, 3);
    return {
      status: 'INVALID_DATE',
      actionType: 'RESCHEDULE',
      reason: 'รูปแบบวันที่ไม่ถูกต้อง',
      suggestedSlots: suggestions.map((s) => s.thaiText),
      isAvailable: false,
    };
  }

  const requestedEnd = new Date(requestedStart.getTime() + duration * 60 * 1000);
  const requestedTimeThai = formatThaiSlot(requestedStart, requestedEnd);

  // 2. ตรวจสอบวันทำงาน (Work Days)
  const allowedDays = (userSetting?.workDays || ['mon', 'tue', 'wed', 'thu', 'fri'])
    .map((d) => DAY_MAP[d.toLowerCase()])
    .filter((d) => d !== undefined);

  if (!allowedDays.includes(requestedStart.getDay())) {
    const suggestions = findAvailableSlots(requestedStart, duration, existingEvents, userSetting, 3);
    return {
      status: 'OUT_OF_WORK_DAYS',
      actionType: 'RESCHEDULE',
      reason: `เวลานัดหมายตรงกับ${THAI_DAY_NAMES[requestedStart.getDay()]} ซึ่งเป็นวันหยุด`,
      requestedTimeThai,
      suggestedSlots: suggestions.map((s) => s.thaiText),
      isAvailable: false,
    };
  }

  // 3. ตรวจสอบเวลาทำงาน (Working Hours)
  const startWorkMin = parseTimeToMinutes(userSetting?.startTime, 9 * 60);
  const endWorkMin = parseTimeToMinutes(userSetting?.endTime, 17 * 60);

  const reqStartMin = requestedStart.getHours() * 60 + requestedStart.getMinutes();
  const reqEndMin = reqStartMin + duration;

  if (reqStartMin < startWorkMin || reqEndMin > endWorkMin) {
    const suggestions = findAvailableSlots(requestedStart, duration, existingEvents, userSetting, 3);
    return {
      status: 'OUT_OF_WORKING_HOURS',
      actionType: 'RESCHEDULE',
      reason: `เวลานัดหมาย (${requestedStart.getHours().toString().padStart(2, '0')}:${requestedStart.getMinutes().toString().padStart(2, '0')} น.) อยู่นอกช่วงเวลาทำงาน (${userSetting?.startTime || '09:00'} - ${userSetting?.endTime || '17:00'} น.)`,
      requestedTimeThai,
      suggestedSlots: suggestions.map((s) => s.thaiText),
      isAvailable: false,
    };
  }

  // 4. ตรวจสอบการชนกับปฏิทิน (Calendar Conflict)
  const conflict = (existingEvents || []).find((evt) => {
    const evtStart = new Date(evt.start?.dateTime || evt.start?.date || evt.start);
    const evtEnd = new Date(evt.end?.dateTime || evt.end?.date || evt.end);
    if (isNaN(evtStart.getTime()) || isNaN(evtEnd.getTime())) return false;
    return requestedStart < evtEnd && requestedEnd > evtStart;
  });

  if (conflict) {
    const conflictTitle = conflict.summary || 'กิจกรรมอื่น';
    const suggestions = findAvailableSlots(requestedStart, duration, existingEvents, userSetting, 3);
    return {
      status: 'CONFLICT',
      actionType: 'RESCHEDULE',
      reason: `มีนัดหมายอื่นอยู่แล้ว ("${conflictTitle}") ในช่วงเวลาดังกล่าว`,
      requestedTimeThai,
      suggestedSlots: suggestions.map((s) => s.thaiText),
      isAvailable: false,
    };
  }

  // 5. ตารางว่างและตรงตามเงื่อนไขทุกประการ
  return {
    status: 'AVAILABLE',
    actionType: 'ACCEPT',
    reason: 'เวลาที่ขอนัดหมายอยู่ในช่วงเวลาทำงานและไม่มีนัดหมายซ้อนทับ',
    requestedTimeThai,
    suggestedSlots: [],
    isAvailable: true,
  };
};

module.exports = {
  analyzeSlotAvailability,
  findAvailableSlots,
  formatThaiSlot,
  formatThaiDateTime,
};
