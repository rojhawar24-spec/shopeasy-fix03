import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const env = read('.env.example');
const server = read('src/server.js');
const db = read('src/db.js');
const staff = read('views/admin/staff.ejs');
const cli = read('scripts/create-staff.mjs');
const limited = read('views/admin/limited-dashboard.ejs');

test('environment bootstraps Manager, not Admin', () => {
  assert.match(env, /^MANAGER_NAME=/m);
  assert.match(env, /^MANAGER_EMAIL=/m);
  assert.match(env, /^MANAGER_PASSWORD=/m);
  assert.doesNotMatch(env, /^ADMIN_EMAIL=$/m);
  assert.doesNotMatch(env, /^ADMIN_PASSWORD=$/m);
  assert.match(server, /async function bootstrapManager\(\)/);
  assert.match(server, /createUser\(email,await hashPassword\(password\),'manager',fullName,null\)/);
  assert.doesNotMatch(server, /async function bootstrapAdmin\(\)/);
});

test('legacy bootstrap migration requires matching email and the existing password proof', () => {
  assert.match(server, /configured\.role==='admin' && await verifyPassword\(password,configured\.password_hash\)/);
  assert.match(server, /promoteBootstrapAdminToManager\(configured\.id,fullName\)/);
  assert.match(server, /password is never replaced by \.env/i);
  assert.match(db, /async function promoteBootstrapAdminToManager\(userId, fullName\)/);
  assert.match(db, /SELECT id FROM users WHERE role='manager' LIMIT 1/);
  assert.match(db, /UPDATE users SET role='manager',full_name=\? WHERE id=\? AND role='admin'/);
  assert.match(db, /DELETE FROM password_reset_tokens WHERE user_id=\?/);
});

test('only Manager can view staff management or submit staff/account mutations', () => {
  for (const signature of [
    "app.get('/admin/staff',requireManager",
    "app.post('/admin/staff/create-admin',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/delete-admin',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/update-email',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/change-password',managerAccountLimiter,requireManager",
  ]) assert.ok(server.includes(signature), `missing Manager authorization: ${signature}`);
  assert.match(server, /createUser\(email,await hashPassword\(password\),'admin',fullName,null\)/);
  assert.match(server, /currentPassword,auth\.password_hash/);
  assert.match(server, /auth\.role!=='manager'\|\|!await verifyPassword\(currentPassword,auth\.password_hash\)/);
  assert.match(cli, /if \(role !== 'manager' \|\| invalidOptions\)/);
  assert.match(cli, /restricted Admin accounts must be created from the Manager screen/);
});

test('Manager page exposes email/password update and Admin creation forms without leaking credentials', () => {
  for (const action of ['/admin/staff/update-email','/admin/staff/change-password','/admin/staff/create-admin','/admin/staff/delete-admin']) assert.ok(staff.includes(`action="${action}"`), `missing form for ${action}`);
  assert.match(staff, /name="currentPassword"/);
  assert.match(staff, /name="newEmail"/);
  assert.match(staff, /name="newPassword"/);
  assert.match(staff, /name="confirmPassword"/);
  assert.match(staff, /name="fullName"/);
  assert.match(staff, /name="email"/);
  assert.match(server, /createUser\(email,await hashPassword\(password\),'admin',fullName,null\)/);
  assert.doesNotMatch(staff, /password_hash/i);
  assert.doesNotMatch(limited, /\/admin\/staff/);
});

test('Manager account changes have a separate rate-limit bucket from sign-in attempts', () => {
  assert.match(server, /const loginLimiter=makeRateLimiter\('login',\{windowMs:15\*60\*1000,max:10/);
  assert.match(server, /const managerAccountLimiter=makeRateLimiter\('manager-account',\{windowMs:15\*60\*1000,max:10/);
  assert.match(server, /app\.post\('\/login',loginLimiter,/);
  for (const signature of [
    "app.post('/admin/staff/create-admin',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/delete-admin',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/update-email',managerAccountLimiter,requireManager",
    "app.post('/admin/staff/change-password',managerAccountLimiter,requireManager",
  ]) assert.ok(server.includes(signature), `Manager account route must use its dedicated limiter: ${signature}`);
  assert.doesNotMatch(server, /app\.post\('\/admin\/staff\/(?:create-admin|update-email|change-password)',loginLimiter/);
});


test('Admin account deletion is Manager-only, reauthenticates and deletes only the restricted role', () => {
  assert.match(server, /app\.post\('\/admin\/staff\/delete-admin',managerAccountLimiter,requireManager/);
  assert.match(server, /verifyPassword\(currentPassword,managerAuth\.password_hash\)/);
  assert.match(server, /deleteAdminUser\(targetId\)/);
  assert.match(server, /admin_account_deleted/);
  assert.match(db, /DELETE FROM users WHERE id=\? AND role='admin'/);
  assert.match(db, /SELECT id,full_name,email,role FROM users WHERE id=\? AND role='admin'/);
  assert.match(staff, /name="adminId"/);
  assert.match(staff, /name="currentPassword"/);
  assert.match(staff, /name="_csrf"/);
  assert.match(staff, /colspan="5"/);
});


test('manager integration treats null and undefined database no-row results as account absence', () => {
  const integration = read('scripts/manager-dashboard-integration.mjs');
  assert.match(integration, /assert\.equal\(\(await data\.getUserAuthByEmail\(limitedAdminEmail\)\)\s*\?\?\s*null,\s*null,\s*'deleted Admin must no longer exist'/);
  assert.match(integration, /assert\.equal\(\(await data\.getUserAuthByEmail\(staffManagerEmail\)\)\s*\?\?\s*null,\s*null,\s*'old Manager email must no longer authenticate'/);
  assert.doesNotMatch(integration, /assert\.equal\(await data\.getUserAuthByEmail\((?:limitedAdminEmail|staffManagerEmail)\),\s*null/);
});
