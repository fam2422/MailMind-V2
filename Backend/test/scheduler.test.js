const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSlotAvailability } = require('../src/services/ai/scheduler');
const { createLogger } = require('../src/utils/logger');

const settings = {
  startTime: '09:00',
  endTime: '17:00',
  workDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  timezone: 'asia-bangkok',
};

const createTestLogger = () => {
  const lines = [];
  const sink = {
    log: (line) => lines.push(line),
    warn: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  return {
    lines,
    logger: createLogger('AI', { traceId: 'schedule-test' }, {
      sink,
      env: { LOG_LEVEL: 'debug', LOG_SENSITIVE_CONTENT: 'false' },
    }),
  };
};

test('scheduler logs and accepts an available appointment slot', () => {
  const { lines, logger } = createTestLogger();
  const result = analyzeSlotAvailability({
    date: '2026-08-24T10:00:00+07:00',
    isTimeSpecified: true,
    durationMinutes: 60,
  }, [], settings, logger);

  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.actionType, 'ACCEPT');
  assert.match(lines.join('\n'), /\[SCHEDULE_START\]/);
  assert.match(lines.join('\n'), /\[SCHEDULE_END\]/);
});

test('scheduler identifies and logs the event causing a conflict', () => {
  const { lines, logger } = createTestLogger();
  const result = analyzeSlotAvailability({
    date: '2026-08-24T10:00:00+07:00',
    isTimeSpecified: true,
    durationMinutes: 60,
  }, [{
    id: 'calendar-event-1',
    summary: 'Private customer meeting',
    start: { dateTime: '2026-08-24T10:00:00+07:00' },
    end: { dateTime: '2026-08-24T11:00:00+07:00' },
  }], settings, logger);

  const output = lines.join('\n');
  assert.equal(result.status, 'CONFLICT');
  assert.equal(result.actionType, 'RESCHEDULE');
  assert.match(output, /calendar-event-1/);
  assert.doesNotMatch(output, /Private customer meeting/);
});

test('scheduler logs the missing-time decision and suggested slots', () => {
  const { lines, logger } = createTestLogger();
  const result = analyzeSlotAvailability({
    date: '2026-08-24T09:00:00+07:00',
    isTimeSpecified: false,
    durationMinutes: 30,
  }, [], settings, logger);

  assert.equal(result.status, 'TIME_NOT_SPECIFIED');
  assert.equal(result.actionType, 'RESCHEDULE');
  assert.ok(result.suggestedSlots.length > 0);
  assert.match(lines.join('\n'), /TIME_NOT_SPECIFIED/);
});
