import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const managerViews = [
  'dashboard.ejs', 'products.ejs', 'product-form.ejs', 'categories.ejs',
  'orders.ejs', 'order.ejs', 'order-cash.ejs', 'stories.ejs', 'story-form.ejs',
  'coupons.ejs', 'customers.ejs', 'branding.ejs', 'settings.ejs', 'audit.ejs', 'license.ejs', 'staff.ejs'
];

test('Manager pages share the grouped navigation and retain every full-access destination', () => {
  const nav = fs.readFileSync(path.join(root, 'views/partials/admin-nav.ejs'), 'utf8');
  for (const file of managerViews) {
    const source = fs.readFileSync(path.join(root, 'views/admin', file), 'utf8');
    assert.match(source, /include\(['"]\.\.\/partials\/admin-nav['"]\)/, `${file} must include the shared navigation`);
  }
  for (const label of ['WORKSPACE','CATALOGUE','SALES','PROMOTIONS','STORE CONTENT','MANAGER TOOLS']) assert.ok(nav.includes(label), `missing group ${label}`);
  for (const href of ['/admin/settings','/admin/audit','/admin/branding','/admin/products','/admin/orders']) assert.ok(nav.includes(`href="${href}"`), `shared navigation is missing ${href}`);
  assert.match(nav, /if\(user\?\.role===['"]manager['"]\)/);
  const managerHtml = ejs.render(nav, { path: '/admin/branding', user: { role: 'manager' } });
  assert.match(managerHtml, /href="\/admin\/branding" class="active" aria-current="page"/);
  const adminHtml = ejs.render(nav, { path: '/admin/branding', user: { role: 'admin' } });
  assert.doesNotMatch(adminHtml, /href="\/admin\/(?:settings|audit|branding|products|orders)"/);
});

test('restricted Admin dashboard remains separate and does not expose management routes', () => {
  const source = fs.readFileSync(path.join(root, 'views/admin/limited-dashboard.ejs'), 'utf8');
  for (const href of ['/admin/settings','/admin/audit','/admin/license','/admin/products','/admin/orders']) {
    assert.ok(!source.includes(`href="${href}"`), `limited Admin dashboard must not expose ${href}`);
  }
});
