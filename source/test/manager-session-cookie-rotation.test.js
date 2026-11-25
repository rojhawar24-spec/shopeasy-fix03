import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('login and Manager MFA replace the anonymous sid cookie rather than append duplicates', () => {
  const auth = read('src/auth.js');
  const server = read('src/server.js');
  const integration = read('scripts/manager-dashboard-integration.mjs');
  assert.match(auth, /export function setSessionCookie\(res, sid, options = cookieOptions\(\)\)/);
  assert.match(auth, /function removeQueuedSessionCookie\(res\)[\s\S]*?res\.setHeader\('Set-Cookie', values\)/);
  assert.match(auth, /setSessionCookie\(res, sid, cookieOptions\(\)\)/);
  assert.match(auth, /setSessionCookie\(res, newSid, cookieOptions\(rememberMe\)\)/);
  assert.match(server, /import \{[^}]*\bsetSessionCookie\b[^}]*\} from '\.\/auth\.js'/);
  assert.match(server, /setSessionCookie\(res,nextSid,\{\.\.\.cookieOptions\(false\),maxAge:MFA_CHALLENGE_TTL_MS\}\)/);
  assert.match(integration, /responseCookie, responseCookieHeader, responseSetCookieHeaders/);
  assert.match(integration, /session rotation must replace the anonymous cookie instead of emitting ambiguous duplicate session cookies/);
});
