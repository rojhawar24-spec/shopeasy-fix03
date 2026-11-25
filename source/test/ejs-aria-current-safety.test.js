import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('conditional aria-current attributes are emitted as literal HTML, never escaped EJS text', () => {
  const managerNavigation = read('views/partials/admin-nav.ejs');
  const accountTabs = read('views/login.ejs');

  assert.doesNotMatch(managerNavigation, /<%=\s*[^%]*aria-current\s*=/i);
  assert.match(managerNavigation, /<% if\(navActive\('\/admin\/audit'\)\)\{ %> aria-current="page"<% \}/);
  assert.doesNotMatch(accountTabs, /<%=\s*[^%]*aria-current\s*=/i);
  assert.match(accountTabs, /<% if\(mode==='login'\)\{ %>aria-current="page"<% \}/);
  assert.match(accountTabs, /<% if\(mode==='register'\)\{ %>aria-current="page"<% \}/);
});
