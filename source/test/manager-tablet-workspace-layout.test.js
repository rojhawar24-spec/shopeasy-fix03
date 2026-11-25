import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
const nav = fs.readFileSync(path.join(root, 'views/partials/admin-nav.ejs'), 'utf8');
const sectionStart = css.indexOf('/* 13 — Manager workspace:');
const sectionEnd = css.indexOf('/* Payment option cards:', sectionStart);
const workspaceRules = sectionStart >= 0 && sectionEnd > sectionStart
  ? css.slice(sectionStart, sectionEnd)
  : '';

test('Manager desktop uses a separate content column and laptop/tablet navigation stays in normal flow', () => {
  assert.ok(workspaceRules, 'the final Manager workspace section must exist');
  assert.match(workspaceRules, /@media \(min-width: 1280px\)/);
  assert.match(workspaceRules, /main\.admin-main:has\(> \.admin-nav\) \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: var\(--manager-rail\) minmax\(0, 1fr\);/);
  assert.match(workspaceRules, /> \.admin-workspace-content \{[\s\S]*?grid-column: 2;/);
  assert.match(nav, /admin-workspace-content/);
  assert.match(workspaceRules, /@media \(max-width: 1279px\)/);
  assert.match(workspaceRules, /body\.is-admin-app main\.admin-main:has\(> \.admin-nav\) > \.admin-nav \{[\s\S]*?position: sticky;/);
  assert.match(workspaceRules, /flex-direction: row;/);
  assert.match(workspaceRules, /inline-size: 100%;/);
  assert.match(workspaceRules, /overflow-x: auto;/);
  assert.match(workspaceRules, /body\.is-admin-app main\.admin-main:has\(> \.admin-nav\) \{[\s\S]*?display: block;[\s\S]*?padding: 0;/);
  assert.match(workspaceRules, /body\.is-admin-app main\.admin-main:has\(> \.admin-nav\) > \.admin-nav \{[\s\S]*?position: sticky;/);
  assert.match(nav, /class="admin-nav container"/);
});

test('Manager tablet header keeps account, language and logout actions compact and visible', () => {
  assert.match(workspaceRules, /body\.is-admin-app \.admin-header-actions > a/);
  assert.match(workspaceRules, /body\.is-admin-app \.admin-header-logout button/);
  assert.match(workspaceRules, /body\.is-admin-app \.admin-header-language select/);
  assert.match(workspaceRules, /body\.is-admin-app \.admin-header-language-submit \{ display: none; \}/);
});
