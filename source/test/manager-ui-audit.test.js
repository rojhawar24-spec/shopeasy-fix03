import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

 test('Manager dashboard and order tables become readable cards before tablet columns become cramped', () => {
  const css = read('public/css/app.css');
  assert.match(css, /@media \(max-width: 899px\)[\s\S]*?\.admin-dashboard-table thead[\s\S]*?display: none;/);
  assert.match(css, /\.admin-dashboard-table tr[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.admin-dashboard-table td:last-child[\s\S]*?grid-column: 1 \/ -1;/);
  assert.match(css, /\.admin-dashboard-table td:last-child \.btn[\s\S]*?inline-size: 100%;/);
});

test('Manager data tables are named and keyboard reachable when their content needs horizontal scrolling', () => {
  for (const [file, phrase] of [
    ['views/admin/audit.ejs', 'Audit trail table'],
    ['views/admin/categories.ejs', 'Categories table'],
    ['views/admin/customers.ejs', 'Customers table'],
    ['views/admin/coupons.ejs', 'Coupons table'],
    ['views/admin/stories.ejs', 'Stories table'],
    ['views/admin/orders.ejs', 'Orders table'],
    ['views/admin/staff.ejs', 'Staff accounts table'],
    ['views/admin/gdpr.ejs', 'Privacy activity log table'],
    ['views/admin/dashboard.ejs', 'Recent orders table'],
  ]) {
    const source = read(file);
    assert.ok(source.includes(`aria-label="${phrase}`), `${file} needs a meaningful table region name`);
    assert.match(source, /class="[^"]*table-wrap[^"]*"[^>]*tabindex="0"|class="[^"]*table-wrap[^"]*"[^>]*role="region"[^>]*tabindex="0"/);
  }
  assert.match(read('public/css/app.css'), /\.table-wrap\[tabindex="0"\]:focus-visible/);
});

test('Settings validation summary is safe on first page load and links errors to the exact form sections', () => {
  const view = read('views/admin/settings.ejs');
  const server = read('src/server.js');
  assert.match(view, /typeof validationErrors!==['"]undefined['"]&&Array\.isArray\(validationErrors\)/);
  assert.match(view, /settings-validation-summary/);
  assert.match(view, /href="<%= validationTarget\(item\) %>"/);
  for (const id of ['ui-languages-field','support-email-field','business-phone-field','currency-field','delivery-fee-field','delivery-countries-field','shipping-rules-field','tax-rules-field','payment-mode-field','payment-provider-field','merchant-country-field','bank-contact-section','bank-contact-email-field','bank-contact-phone-field']) {
    assert.ok(view.includes(`id="${id}"`), `missing settings error target #${id}`);
  }
  assert.match(server, /validationErrors:invalidFields/);
  assert.doesNotMatch(view, /R12\.10 design-audit candidate/);
});

test('Manager preview mirrors the production workspace wrapper and keyboard-scrollable navigation', () => {
  const preview = read('PREVIEW-MANAGER.html');
  assert.match(preview, /<nav class="admin-nav"[^>]*tabindex="0">/);
  assert.match(preview, /<div class="admin-workspace-content" id="manager-page-content">[\s\S]*?manager-dashboard-shell[\s\S]*?<\/div>\s*<\/main>/);
});

test('Release example environment contains no live credentials and provides local database defaults', () => {
  const env = read('.env.example');
  assert.match(env, /^NODE_ENV=development$/m);
  assert.match(env, /^DATABASE_URL=file:\.\/data\/shop\.db$/m);
  assert.match(env, /^MANAGER_EMAIL=$/m);
  assert.match(env, /^MANAGER_PASSWORD=$/m);
  assert.match(env, /^MFA_ENCRYPTION_KEY=$/m);
  assert.match(env, /^RESET_CODE_SECRET=$/m);
  assert.match(env, /^MOLLIE_API_KEY=$/m);
  assert.doesNotMatch(env, /(?:sk_live_|live_[A-Za-z0-9]{12,}|test_[A-Za-z0-9]{12,})/);
});
