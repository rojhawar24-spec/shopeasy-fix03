import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const header = fs.readFileSync(path.join(root, 'views/partials/header.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');

test('Manager pages render dedicated account controls instead of the hidden storefront menu', () => {
  assert.match(header, /if \(isAdminRoute\) \{[\s\S]*?class="admin-header-actions"/);
  assert.match(header, /String\(user\?\.role\|\|'\'\)\.toLowerCase\(\)/);
  assert.match(header, /href="\/admin\/staff"/);
  assert.match(header, /action="\/logout"/);
  assert.match(header, /admin-header-account/);
  assert.match(header, /admin-header-logout/);
  assert.match(css, /body\.is-admin-app \.nav-row > \.search-box, body\.is-admin-app \.nav-links, body\.is-admin-app \.storefront-search-toggle, body\.is-admin-app \.menu-toggle \{ display: none; \}/);
});

test('Manager pages do not render the storefront product search on desktop or mobile', () => {
  assert.match(header, /if \(!isAdminRoute && isStorefrontPage\)/);
  assert.match(header, /else if \(!isAdminRoute\)/);
  assert.match(css, /body\.is-admin-app \.mobile-search \{ display: none; \}/);
  assert.doesNotMatch(header, /if \(isAdminRoute\) \{[\s\S]{0,1500}mobile-search/);
});

test('Manager account and logout controls remain visible and reachable at small widths', () => {
  assert.match(css, /\.admin-header-actions \{ display: flex/);
  assert.match(css, /\.admin-header-logout button \{ cursor: pointer; \}/);
  assert.match(css, /@media \(max-width: 639px\)[\s\S]*?body\.is-admin-app \.admin-header-actions/);
  assert.match(css, /body\.is-admin-app \.admin-header-actions > a, body\.is-admin-app \.admin-header-logout button/);
});

test('Manager language can be changed without leaving the workspace', () => {
  assert.match(header, /class="admin-header-language" action="\/language" method="post"/);
  assert.match(header, /name="_csrf" value="<%= csrf %>"/);
  assert.match(header, /name="returnTo" value="<%= returnTo\|\|path\|\|'.*?' %>"/);
  assert.match(header, /id="admin-language" name="language" data-language-select/);
  assert.match(app, /data-language-select[\s\S]*?select\.form\?\.requestSubmit\(\)/);
});
