import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views/local-manager-recovery.ejs'), 'utf8');

test('local Manager recovery is restricted to development, local SQLite and loopback-only requests', () => {
  assert.match(server, /function isLocalManagerRecoveryRequest\(req\)/);
  assert.match(server, /process\.env\.NODE_ENV !== 'development'/);
  assert.match(server, /process\.env\.CLOUDFLARE_WORKER === '1'/);
  assert.ok(server.includes('if (databaseUrl && !/^file:/i.test(databaseUrl)) return false;'));
  assert.match(server, /req\.socket\?\.remoteAddress/);
  assert.ok(server.includes("['127.0.0.1','::1','::ffff:127.0.0.1']"));
  assert.ok(server.includes('localhost|127\\.0\\.0\\.1|\\[::1\\]'));
  assert.match(server, /req\.headers\?\.host/);
});

test('browser recovery uses normal session CSRF protection and a separate POST limiter', () => {
  assert.match(server, /app\.post\('\/local-manager-recovery',localManagerRecoveryLimiter/);
  assert.match(server, /app\.use\(csrfToken\)/);
  assert.match(server, /app\.use\(\(req,res,next\)=>\s*\{[\s\S]*?return verifyCsrf\(req,res,next\)/);
  assert.match(view, /name="_csrf" value="<%= csrf %>"/);
  assert.match(view, /action="\/local-manager-recovery"/);
});

test('unlock-only action does not rewrite credentials and password reset preserves MFA columns', () => {
  assert.match(server, /if\(action==='unlock'\)[\s\S]*?await clearAccountLoginFailures\(emailHash\)/);
  assert.match(server, /if\(action==='reset-password'\)[\s\S]*?updateUserPassword\(manager\.id,await hashPassword\(password\)\)/);
  assert.match(server, /mfaPreserved:true/);
  assert.doesNotMatch(server, /UPDATE users SET[^\n]*(mfa_secret|mfa_enabled|mfa_recovery_codes_hash)/);
  const db=fs.readFileSync(path.join(root,'src/db.js'),'utf8');
  const passwordHelper=db.slice(db.indexOf('export async function updateUserPassword'),db.indexOf('export async function destroyUserSessionsExcept'));
  assert.match(passwordHelper,/await revokeCredentialSessions\(userId,keepSessionId,tx\)/);
  assert.match(passwordHelper,/keepSessionId=''/);
  assert.doesNotMatch(server,/Some previous Manager sessions could not be revoked/);
});

test('recovery page exposes no Manager creation or role-promotion action', () => {
  assert.ok(server.includes('No Manager account was found in this database.'));
  assert.ok(server.includes('No Manager account exists in this database.')); 
  assert.match(server, /will not create or promote an account/);
  assert.doesNotMatch(server.slice(server.indexOf("app.get('/local-manager-recovery'"), server.indexOf("app.get('/login'")), /createUser\(|promoteBootstrapAdminToManager\(/);
});
