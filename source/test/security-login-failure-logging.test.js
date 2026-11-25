import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { privacyLimitedSourcePrefix, recordLoginFailure } from '../src/services/security-events.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function makeLogger() {
  const lines = [];
  return { lines, warn(value) { lines.push(String(value)); } };
}

test('failed login writes a structured, privacy-limited event without submitted secrets', () => {
  const logger = makeLogger();
  const state = new Map();
  const email = 'private-customer@example.test';
  const requestId = '7f14c9c4-e6d2-4f00-ae6f-2587b83e779c';
  recordLoginFailure({
    email, ip: '203.0.113.47', requestId, reason: 'invalid_credentials',
    logger, state, now: 1_800_000_000_000, threshold: 10, windowMs: 900_000
  });
  assert.equal(logger.lines.length, 1);
  const event = JSON.parse(logger.lines[0]);
  assert.equal(event.event, 'auth.login.failure');
  assert.equal(event.timestamp, '2027-01-15T08:00:00.000Z');
  assert.equal(event.requestId, requestId);
  assert.equal(event.reason, 'invalid_credentials');
  assert.equal(event.sourcePrefix, '203.0.113.0/24');
  assert.match(event.identifierHash, /^[a-f0-9]{24}$/);
  const serialized = logger.lines.join('\n');
  for (const forbidden of [email, 'my-test-password', 'session-id-secret', '123456']) {
    assert.equal(serialized.includes(forbidden), false, `sensitive value leaked: ${forbidden}`);
  }
  for (const key of ['email', 'password', 'sessionId', 'resetCode', 'ip']) assert.equal(Object.hasOwn(event, key), false);
});

test('MFA challenge failures retain their category without exposing credentials or session data',()=>{
  const logger=makeLogger();
  const email='private-manager@example.test';
  const secrets={password:'mfa-password-secret',sessionId:'mfa-session-secret',mfaSecret:'mfa-seed-secret',recoveryCode:'mfa-recovery-secret'};
  const event=recordLoginFailure({
    email,userId:23,ip:'203.0.113.47',reason:'mfa_challenge_creation_failed',
    ...secrets,logger,state:new Map(),now:1_800_000_000_000,threshold:10
  });
  assert.equal(event.reason,'mfa_challenge_creation_failed');
  assert.equal(JSON.parse(logger.lines[0]).reason,'mfa_challenge_creation_failed');
  assert.deepEqual(Object.keys(event).sort(),['event','identifierHash','reason','requestId','sourcePrefix','timestamp']);
  for(const value of [email,'203.0.113.47',...Object.values(secrets)])assert.ok(!logger.lines.join('\n').includes(value));
});

test('source alert is thresholded once per window and source addresses are prefix-limited', () => {
  assert.equal(privacyLimitedSourcePrefix('198.51.100.99'), '198.51.100.0/24');
  assert.equal(privacyLimitedSourcePrefix('2001:db8:abcd:1234::42'), '2001:db8:abcd:1234::/64');
  const logger = makeLogger();
  const state = new Map();
  const base = { email: 'x@example.test', ip: '198.51.100.13', logger, state, threshold: 2, windowMs: 60_000 };
  recordLoginFailure({ ...base, requestId: '7f14c9c4-e6d2-4f00-ae6f-2587b83e779c', now: 100_000 });
  recordLoginFailure({ ...base, requestId: '8f14c9c4-e6d2-4f00-ae6f-2587b83e779c', now: 101_000 });
  recordLoginFailure({ ...base, requestId: '9f14c9c4-e6d2-4f00-ae6f-2587b83e779c', now: 102_000 });
  let events = logger.lines.map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.event === 'auth.login.failure').length, 3);
  assert.equal(events.filter(event => event.event === 'auth.login.failure.threshold').length, 1);
  assert.equal(events.find(event => event.event === 'auth.login.failure.threshold').count, 2);
  recordLoginFailure({ ...base, requestId: 'af14c9c4-e6d2-4f00-ae6f-2587b83e779c', now: 161_000 });
  recordLoginFailure({ ...base, requestId: 'bf14c9c4-e6d2-4f00-ae6f-2587b83e779c', now: 162_000 });
  events = logger.lines.map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.event === 'auth.login.failure.threshold').length, 2);
  assert.ok(events.every(event => !JSON.stringify(event).includes('198.51.100.13')));
});

test('login route records every handled authentication rejection and returns a correlation ID', () => {
  const server = read('src/server.js');
  const start = server.indexOf("app.post('/login',loginLimiter,async(req,res)=>{");
  const end = server.indexOf("app.post('/register'", start);
  assert.ok(start >= 0 && end > start, 'login route is present');
  const route = server.slice(start, end);
  assert.match(route, /const requestId=crypto\.randomUUID\(\)/);
  assert.match(route, /res\.set\('X-Request-ID',requestId\)/);
  assert.match(route, /recordLoginFailure\(\{email,ip:req\.ip,requestId,reason:'invalid_credentials'\}\)/);
  assert.match(route, /reason:'authentication_unavailable'/);
  assert.match(route, /reason:'session_creation_failed'/);
  const securityEvents = read('src/services/security-events.js');
  assert.match(securityEvents, /process\.env\.LOGIN_FAILURE_ALERT_THRESHOLD/);
  assert.match(securityEvents, /process\.env\.LOGIN_FAILURE_ALERT_WINDOW_MS/);
});
