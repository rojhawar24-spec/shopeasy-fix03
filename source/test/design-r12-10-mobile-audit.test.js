import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const css = read('public/css/app.css');
const header = read('views/partials/header.ejs');
const footer = read('views/partials/footer.ejs');
const dashboard = read('views/admin/dashboard.ejs');
const orders = read('views/admin/orders.ejs');
const success = read('views/success.ejs');

test('mobile order and dashboard tables expose readable responsive card labels', () => {
  assert.match(orders, /class="[^"]*admin-orders-table-wrap[^"]*"/);
  assert.match(orders, /class="[^"]*admin-orders-table[^"]*"/);
  for (const label of ['Order', 'Customer', 'Total', 'Status', 'Placed', 'Actions']) {
    assert.ok(orders.includes(`table-mobile-label">${label}</span>`), `missing ${label} mobile label`);
  }
  assert.match(dashboard, /class="[^"]*admin-recent-orders-wrap[^"]*"/);
  assert.match(dashboard, /class="[^"]*admin-dashboard-table[^"]*"/);
});

test('dashboard phone and order contact/date values use isolated natural text directions', () => {
  assert.match(dashboard, /dashboard-phone-mobile" dir="ltr"/);
  assert.match(dashboard, /dashboard-phone-cell" dir="ltr"/);
  assert.match(dashboard, /<time dir="ltr"/);
  assert.match(orders, /admin-order-customer" dir="ltr"/);
  assert.match(orders, /<time dir="ltr"/);
});

test('order confirmation amounts cannot wrap into multiple lines', () => {
  assert.match(css, /\.success-items \.order-item > strong[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.success-summary-v5 > strong[\s\S]*?white-space:\s*nowrap/);
  assert.match(success, /formatPrice\(item\.total_cents,order\.currency\)/);
});

test('reduced-motion override is placed after component transitions', () => {
  const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /html:root \*/);
  assert.match(block, /transition-duration:\s*0\.01ms/);
  assert.match(block, /animation-duration:\s*0\.01ms/);
});

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

