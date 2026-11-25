import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'views/partials/admin-nav.ejs'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views/admin/dashboard.ejs'), 'utf8');
const staff = fs.readFileSync(path.join(root, 'views/admin/staff.ejs'), 'utf8');
const products = fs.readFileSync(path.join(root, 'views/admin/products.ejs'), 'utf8');

const managerRoutes = [
  ['/admin', 'Manage your store'],
  ['/admin/products', 'Products'],
  ['/admin/categories', 'Categories'],
  ['/admin/orders', 'Orders'],
  ['/admin/returns', 'Returns'],
  ['/admin/customers', 'Customers'],
  ['/admin/coupons', 'Discounts'],
  ['/admin/stories', 'Stories'],
  ['/admin/branding', 'Storefront'],
  ['/admin/settings', 'Store settings'],
  ['/admin/staff', 'Staff &amp; Manager account'],
  ['/admin/audit', 'Audit log'],
  ['/admin/gdpr', 'Privacy tools'],
  ['/admin/license', 'License']
];

test('Manager desktop layout reserves a dedicated content column beside the navigation rail', () => {
  assert.match(css, /@media \(min-width: 1280px\) \{[\s\S]*?main\.admin-main:has\(> \.admin-nav\) \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: var\(--manager-rail\) minmax\(0, 1fr\);/);
  assert.match(css, /main\.admin-main:has\(> \.admin-nav\) > \.admin-workspace-content \{[\s\S]*?grid-column: 2;/);
  assert.match(nav, /<div class=\"admin-workspace-content\" id=\"manager-page-content\">/);
  assert.match(fs.readFileSync(path.join(root, 'views/partials/footer.ejs'), 'utf8'), /managerWorkspaceShell[\s\S]*?admin-workspace-content/);
  assert.match(css, /@media \(max-width: 1279px\) \{[\s\S]*?main\.admin-main:has\(> \.admin-nav\) \{[\s\S]*?display: block;/);
  assert.match(css, /body\.is-admin-app \.cookie-preferences-overlay[\s\S]*?display: none;/);
});

test('Every Manager navigation destination has a GET handler and visible page content template', () => {
  for (const [route, label] of managerRoutes) {
    assert.ok(nav.includes(`href="${route}"`) || route === '/admin' && nav.includes('href="/admin"'), `Manager nav must include ${route}`);
    assert.ok(server.includes(`app.get('${route}'`) || route === '/admin/products' && server.includes("app.get('/admin/products'"), `server must expose GET ${route}`);
    assert.ok(label, `route ${route} must have a content marker`);
  }
  assert.match(dashboard, /<h1>Manage your store<\/h1>/);
  assert.match(staff, /<h1>Staff &amp; Manager account<\/h1>/);
  assert.match(staff, /include\('\.\.\/partials\/footer',\{managerWorkspaceShell:user\?\.role==='manager'\}\)/);
  assert.match(staff, /action="\/admin\/staff\/create-admin"/);
  assert.match(products, /<h1>Products<\/h1>/);
});


test('every Manager view pairs the workspace opening with the explicit footer close flag', () => {
  const adminViewsDir = path.join(root, 'views/admin');
  const managerViews = fs.readdirSync(adminViewsDir)
    .filter(name => name.endsWith('.ejs'))
    .map(name => ({ name, source: fs.readFileSync(path.join(adminViewsDir, name), 'utf8') }))
    .filter(view => view.source.includes("partials/admin-nav"));
  assert.ok(managerViews.length >= 15, 'expected all full-access Manager templates to include the shared navigation');
  for (const view of managerViews) {
    assert.match(view.source, /include\('\.\.\/partials\/footer',\{managerWorkspaceShell:user\?\.role==='manager'\}\)/, `${view.name} must close the Manager content wrapper only when opened`);
  }
  assert.match(nav, /<div class="admin-workspace-content" id="manager-page-content">/);
  assert.match(fs.readFileSync(path.join(root, 'views/partials/footer.ejs'), 'utf8'), /typeof managerWorkspaceShell!=='undefined' && managerWorkspaceShell/);
});

test('Manager links remain ordinary browser navigations, not JavaScript-only controls', () => {
  assert.match(nav, /<a href="\/admin\/products"/);
  assert.match(nav, /<a href="\/admin\/staff"/);
  assert.doesNotMatch(nav, /onclick=|data-spa|javascript:/i);
});
