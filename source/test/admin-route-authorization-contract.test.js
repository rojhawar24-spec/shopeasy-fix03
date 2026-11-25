import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'src/auth.js'), 'utf8');

// All /admin declarations start on a single line in this codebase. Looking at
// that line lets this contract fail immediately if a future route is added
// without an explicit role middleware before its handler.
const adminRouteLines = server.split(/\r?\n/).filter(line => /\bapp\.(?:get|post|put|patch|delete)\(\s*['"]\/admin(?:\/|['"])/.test(line));
const roleOf = line => line.includes('requireDashboardAccess') ? 'dashboard' : line.includes('requireAdmin') ? 'admin' : line.includes('requireManager') ? 'manager' : null;

 test('every declared /admin route has explicit manager/admin authorization', () => {
  assert.ok(adminRouteLines.length >= 25, `expected to inventory the admin routes, found ${adminRouteLines.length}`);
  for (const line of adminRouteLines) {
    const route = line.match(/\bapp\.(get|post|put|patch|delete)\(\s*(['"])(\/admin[^'"]*)\2/);
    assert.ok(route, `could not parse admin route line: ${line}`);
    assert.ok(roleOf(line), `${route[1].toUpperCase()} ${route[3]} has no explicit role middleware`);
    if (route[3] === '/admin') assert.ok(line.includes('requireDashboardAccess'), 'only the dashboard may accept Admin');
    else assert.ok(line.includes('requireManager'), `${route[3]} must be Manager-only`);
  }
});

test('Manager is the only role with full store-management permissions', () => {
  for (const signature of ["app.get('/admin/audit',requireManager","app.get('/admin/license',requireManager","app.get('/admin/settings',requireManager","app.post('/admin/settings',requireManager"]) assert.ok(server.includes(signature), `full manager access must protect ${signature}`);
  assert.match(auth, /export async function requireManager[\s\S]*?role !== 'manager'/);
  assert.match(auth, /export async function requireDashboardAccess[\s\S]*?!\['admin',\s*'manager'\]\.includes\(role\)/);
  assert.match(server, /app\.get\('\/admin',requireDashboardAccess/);
  assert.match(server, /if \(String\(req\.user\?\.role \?\? ''\)\.trim\(\)\.toLowerCase\(\) === 'admin'\) return render\(res,'admin\/limited-dashboard'\)/);
  assert.match(auth, /export async function requireAdmin[\s\S]*?role !== 'admin'/);
});

test('manager role is refreshed from the database for privileged requests', () => {
  assert.match(auth, /async function refreshSessionUser[\s\S]*?const freshUser = await getUserById\(req\.session\.user_id\)/);
  assert.match(auth, /export async function requireManager[\s\S]*?refreshSessionUser\(req, res, next\)/);
});

test('every privileged multipart write remains CSRF-protected after upload parsing', () => {
  assert.ok(server.includes("const multipartTokenParsedAtRoute = req.is('multipart/form-data')"));
  for (const signature of [
    "app.post('/admin/products/save',requireManager,upload.fields([{name:'image',maxCount:1},{name:'galleryImages',maxCount:MAX_ADDITIONAL_GALLERY_UPLOADS}]),verifyCsrf",
    "app.post('/admin/stories/save',requireManager,upload.single('image'),verifyCsrf",
    "app.post('/admin/branding',requireManager,upload.single('heroImage'),verifyCsrf",
  ]) assert.ok(server.includes(signature), `missing role/CSRF protection: ${signature}`);
  const globalCsrfPosition = server.indexOf('return verifyCsrf(req,res,next);');
  const firstAdminRoutePosition = server.indexOf("app.get('/admin'");
  assert.ok(globalCsrfPosition >= 0 && firstAdminRoutePosition > globalCsrfPosition,
    'global CSRF guard must be mounted before /admin route handlers');
});

test('Admin overview template exposes no store-management links or private store metrics', () => {
  const limited = fs.readFileSync(path.join(root, 'views/admin/limited-dashboard.ejs'), 'utf8');
  assert.match(limited, /Store overview access/);
  assert.match(limited, /read-only overview/i);
  for (const pathName of ['/admin/products','/admin/categories','/admin/orders','/admin/stories','/admin/coupons','/admin/customers','/admin/branding','/admin/settings','/admin/license','/admin/audit']) assert.ok(!limited.includes(`href=\"${pathName}\"`), `limited Admin dashboard must not link to ${pathName}`);
  assert.match(limited, /cannot view or change those sections/i);
});
