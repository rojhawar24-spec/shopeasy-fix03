import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('license draft is structured but never falsely presented as an effective license', () => {
  const licenseDraft = read('LICENSE.txt');
  const readme = read('README.md');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(licenseDraft, /PROPRIETARY COMMERCIAL SOFTWARE LICENSE/i);
  assert.match(licenseDraft, /STATUS: DRAFT ONLY — NOT AN EFFECTIVE LICENSE/);
  assert.match(licenseDraft, /no rights are granted by this draft/i);
  assert.match(licenseDraft, /\[LICENSOR LEGAL NAME\]/);
  for (const section of ['CONDITIONAL LICENSE GRANT', 'RESTRICTIONS', 'OWNERSHIP AND CUSTOMER MATERIALS', 'THIRD-PARTY MATERIALS', 'TERM AND TERMINATION', 'WARRANTY DISCLAIMER', 'LIMITATION OF LIABILITY', 'ACCEPTANCE']) {
    assert.ok(licenseDraft.includes(section), `missing license section: ${section}`);
  }
  assert.match(licenseDraft, /commercial resale, redistribution, rebranding, and sublicensing status therefore remains UNCONFIRMED/i);
  assert.match(readme, /draft proprietary commercial-license template, not yet effective/i);
  assert.equal(pkg.license, 'UNLICENSED');
  assert.equal(lock.packages[''].license, 'UNLICENSED');
  assert.equal(pkg.private, true);
});

test('changelog preserves release history and records the 2.8.57 currency-regression test correction without claiming certification', () => {
  const changelog = read('CHANGELOG.md');
  assert.match(changelog, /^## 2\.8\.57/m);
  assert.match(changelog, /^## 2\.8\.56/m);
  assert.match(changelog, /^## 2\.8\.55/m);
  assert.match(changelog, /^## 2\.8\.54/m);
  assert.match(changelog, /^## 2\.8\.52/m);
  assert.match(changelog, /^## 2\.8\.51/m);
  assert.match(changelog, /^## 2\.8\.50/m);
  assert.match(changelog, /Previous 2\.8\.45 baseline/);
  const currentQa = read('QA-REPORT-2.8.95.md');
  assert.match(currentQa, /NOT production-certified/i);
  assert.match(changelog, /## 2\.8\.72/m);
  assert.doesNotMatch(changelog, /QA-REPORT-2\.8\.(?:48|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69)\.md/);
});

test('API reference documents every Express route declared in src/server.js', () => {
  const source = read('src/server.js');
  const reference = read('API-REFERENCE.md');
  const routePattern = /^app\.(get|post|put|patch|delete)\(\s*'([^']+)'/gm;
  const routes = [...source.matchAll(routePattern)].map((match) => ({ method: match[1].toUpperCase(), path: match[2] }));
  assert.equal(routes.length, 141, 'refresh the documented route inventory if source route count changes');
  for (const managerAction of ['/admin/customers/:id/approve-registration', '/admin/orders/:id/email/retry', '/admin/orders/:id/email/reconcile']) {
    assert.ok(routes.some(route => route.method === 'POST' && route.path === managerAction), `repaired Manager action missing: ${managerAction}`);
  }
  assert.ok(routes.some(route => route.method === 'POST' && route.path === '/verify-email'), 'registration activation must have an explicit protected POST route');
  for (const route of routes) {
    assert.ok(reference.includes(`\`${route.method}\` | \`${route.path}\``), `route missing from API reference: ${route.method} ${route.path}`);
  }
  assert.match(reference, /not a versioned public API specification/i);
  assert.match(reference, /Mollie hosted card checkout is integrated/i);
  assert.match(reference, /MOLLIE_LIVE_CHECKOUT_APPROVED=true/);
  assert.match(reference, /Other entries in Manager onboarding contacts.*are references only/i);
});
