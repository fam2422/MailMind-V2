const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

const gmailService = require('../src/services/gmail.service');
const calendarService = require('../src/services/calendar.service');
const { createLogger } = require('../src/utils/logger');

const createTestLogger = () => {
  const lines = [];
  const sink = {
    log: (line) => lines.push(line),
    warn: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };
  return {
    lines,
    logger: createLogger('TEST', { traceId: 'workflow-test', draftId: 'draft-1' }, {
      sink,
      env: { LOG_LEVEL: 'debug', LOG_SENSITIVE_CONTENT: 'false' },
    }),
  };
};

const draft = {
  id: 'draft-1',
  messageId: 'message-1',
  threadId: 'thread-1',
  subject: 'Private appointment title',
  location: 'Private room',
  actionType: 'ACCEPT',
  suggestedDate: new Date('2026-08-24T03:00:00.000Z'),
  draftReply: 'Private approved reply',
};

const metadata = {
  fromEmail: 'Customer <customer@example.com>',
  cleanEmail: 'customer@example.com',
  originalMessageId: '<original-message@example.com>',
  originalReferences: '<older-message@example.com>',
  subject: 'Private appointment title',
};

test('Gmail approval reply logs start, end, and correlation IDs', async () => {
  const { lines, logger } = createTestLogger();
  const gmail = {
    users: {
      messages: {
        send: async () => ({ data: { id: 'sent-message-1', threadId: 'thread-1', labelIds: ['SENT'] } }),
      },
    },
  };

  const result = await gmailService.sendEmailReply(gmail, draft, metadata, null, logger);
  const output = lines.join('\n');

  assert.equal(result.id, 'sent-message-1');
  assert.match(output, /REPLY_SEND_START/);
  assert.match(output, /REPLY_SEND_END/);
  assert.match(output, /traceId=workflow-test/);
  assert.doesNotMatch(output, /Private approved reply/);
  assert.doesNotMatch(output, /customer@example\.com/);
});

test('Gmail approval reply logs failures and rethrows them', async () => {
  const { lines, logger } = createTestLogger();
  const gmail = {
    users: { messages: { send: async () => { throw new Error('gmail unavailable'); } } },
  };

  await assert.rejects(
    gmailService.sendEmailReply(gmail, draft, metadata, null, logger),
    /gmail unavailable/
  );
  assert.match(lines.join('\n'), /REPLY_SEND_ERROR/);
});

test('Calendar insertion logs request and returned event identifiers', async () => {
  const { lines, logger } = createTestLogger();
  let insertRequest;
  const calendar = {
    events: {
      insert: async (request) => {
        insertRequest = request;
        return {
          data: {
            id: 'event-1',
            iCalUID: 'ical-1',
            status: 'confirmed',
            htmlLink: 'https://calendar.example/event-1',
            attendees: [{ email: 'customer@example.com', responseStatus: 'needsAction' }],
          },
        };
      },
    },
  };

  const result = await calendarService.addEventToCalendar(
    calendar,
    draft,
    metadata,
    'asia-bangkok',
    null,
    'owner@example.com',
    logger
  );
  const output = lines.join('\n');

  assert.equal(result.id, 'event-1');
  assert.equal(insertRequest.sendUpdates, 'all');
  assert.deepEqual(insertRequest.requestBody.attendees, [{ email: 'customer@example.com' }]);
  assert.match(output, /INSERT_START/);
  assert.match(output, /INSERT_END/);
  assert.match(output, /event-1/);
  assert.match(output, /ical-1/);
  assert.doesNotMatch(output, /Private appointment title/);
});

test('Calendar skip and failure paths produce explicit trace events', async () => {
  const skip = createTestLogger();
  let insertCalled = false;
  const skippedDraft = { ...draft, actionType: 'RESCHEDULE' };
  const skipped = await calendarService.addEventToCalendar(
    { events: { insert: async () => { insertCalled = true; } } },
    skippedDraft,
    metadata,
    'asia-bangkok',
    null,
    'owner@example.com',
    skip.logger
  );
  assert.equal(skipped, null);
  assert.equal(insertCalled, false);
  assert.match(skip.lines.join('\n'), /INSERT_SKIP/);

  const failure = createTestLogger();
  await assert.rejects(
    calendarService.addEventToCalendar(
      { events: { insert: async () => { throw new Error('calendar unavailable'); } } },
      draft,
      metadata,
      'asia-bangkok',
      null,
      'owner@example.com',
      failure.logger
    ),
    /calendar unavailable/
  );
  assert.match(failure.lines.join('\n'), /INSERT_ERROR/);
});
