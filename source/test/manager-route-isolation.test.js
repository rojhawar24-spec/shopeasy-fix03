import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../views/partials/footer.ejs', import.meta.url), 'utf8');
const header = readFileSync(new URL('../views/partials/header.ejs', import.meta.url), 'utf8');
const managerNav = readFileSync(new URL('../views/partials/admin-nav.ejs', import.meta.url), 'utf8');
const staffPage = readFileSync(new URL('../views/admin/staff.ejs', import.meta.url), 'utf8');

test('Manager pages cannot display full-screen storefront cookie or mobile overlays', () => {
  assert.match(footer, /<%\s*if\s*\(!isAdminRoute\)\s*\{\s*%>/);
  assert.match(css, /body\.is-admin-app\s+\.cookie-preferences-overlay\s*,[\s\S]*?body\.is-admin-app\s+\.mobile-bottom-nav\s*,[\s\S]*?display:\s*none\s*;/);
  assert.match(css, /\.cookie-preferences-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/);
});

test('Manager workspace switches from fixed rail to in-flow horizontal navigation on laptop widths', () => {
  assert.match(css, /@media\s*\(max-width:\s*1279px\)\s*\{[\s\S]*?\.admin-nav\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /main\.admin-main:has\(> \.admin-nav\)\s*\{[\s\S]*?padding-inline:\s*0;/);
  assert.match(css, /@media\s*\(max-width:\s*1023px\)\s*\{\s*body\.is-admin-app \.admin-nav\s*\{\s*inset-block-start:\s*var\(--header-mobile\);/);
});

test('Manager account page retains email, password, restricted-admin and deletion forms', () => {
  assert.match(header, /class="admin-header-actions"/);
  assert.match(managerNav, /href="\/admin\/staff"/);
  assert.match(staffPage, /action="\/admin\/staff\/update-email"/);
  assert.match(staffPage, /action="\/admin\/staff\/change-password"/);
  assert.match(staffPage, /action="\/admin\/staff\/create-admin"/);
  assert.match(staffPage, /action="\/admin\/staff\/delete-admin"/);
});
