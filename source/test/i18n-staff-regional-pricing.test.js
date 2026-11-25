import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readDict = (path, pattern) => {
  const match = read(path).match(pattern);
  assert.ok(match, `${path} must have a parseable dictionary`);
  return JSON.parse(match[1]);
};
const main = readDict('public/js/i18n.js', /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/);
const arRuntime = readDict('public/js/i18n-ar.js', /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/);
const ckbRuntime = readDict('public/js/i18n-ckb.js', /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/);

const staffPhrases = [
  'ACCESS CONTROL','Staff & Manager account','Manage the Manager login and create restricted Admin accounts. Only a signed-in Manager can use this page.',
  'Admin account created successfully. It can sign in to the read-only overview only.','Manager email changed. Other Manager sessions were signed out.',
  'Manager password changed. Other Manager sessions were signed out and unused password-reset codes were invalidated.',
  'FULL ACCESS','Manager account','This is the account with full access to products, categories, stock, orders, discounts, stories, customers, storefront settings, audit records and licensing.',
  'CHANGE LOGIN EMAIL','Update Manager email','The current password is required. The new email must not be used by another account.',
  'New email address','Current Manager password','Change email','CHANGE LOGIN PASSWORD','Update Manager password',
  'Use a unique password with at least 8 characters. Other active Manager sessions and outstanding password-reset codes will be revoked.',
  'New password','Confirm new password','Change password','LIMITED ACCESS','Create an Admin account',
  'Admin accounts can sign in and view the restricted overview only. They cannot create accounts, edit the shop, change settings, or open Manager-only pages. Admin accounts are created here; they are not created from `.env`.',
  'Admin full name','Admin email','Temporary password','Confirm temporary password',
  'Give the new Admin the login email and password securely. The password is never shown again after creating the account.',
  'Create Admin account','EXISTING ACCOUNTS','Admin accounts','Only Admin accounts are listed here. Passwords and password hashes are never displayed.',
  'Name','Email','Created','Access level','Actions','Restricted Admin','Delete Admin','Current Manager password','Delete Admin',
  'No Admin accounts yet.','Create one above if someone needs read-only access to the overview.'
];
const newPricingOrderPhrases = [
  'PAYMENT METHOD','Regional delivery fee overrides','Regional VAT / sales-tax rules',
  'Country | City or * | Postal prefix or * | Rate % | Tax shipping (yes/no)',
  'Enter up to 250 valid country names, one per line. Only listed countries are offered at checkout, and the server rejects orders for every other country. List a country only when you can fulfil and collect cash there. The country list is the outer allow-list; use the regional delivery rules below for cities and postal-code areas.',
  'Manage your market, business details, delivery, payment information and customer policies in one place. You can save these settings before adding products or buying stock. Incomplete launch requirements only keep checkout closed.',
  'Passing this checklist is not a legal-compliance certificate, a tax-rate lookup, a VAT return, or proof of production capacity. Configure only the regions you can serve and have verified rules for.',
  'No return or refund requests have been made for this order.','Return requests become available when the store marks the order delivered.',
  'AFTER-SALES','Choose an item','DELIVERY','Item','Refund recorded','Request','Updated','Print / save PDF','Order cancelled',
  'The order will not be delivered.','ORDER PROGRESS','Track your order','Order received','Store is preparing it','Delivery is on the way','Order completed',
  'ORDER CONTENTS','Items','Items subtotal','Coupon discount','Delivery fee','Total','Delivery details','Delivery address','Cash',
  'Cash on delivery','Payment method recorded on the original order','Order note','CHANGES','Need to cancel?',
  'You may cancel while the store is still reviewing the order.','Reason (optional)','I no longer need this item.','Cancel order',
  'Request cancellation','Your cancellation request is waiting for the store\'s decision.','Reason:','The store has accepted the order. You can still send a cancellation request for review.',
  'Reason *','Explain why you need to cancel.','Delivery in progress','Your order is already out for delivery. Contact the store using the contact details on its policy page.',
  'Need a return?','This order is marked delivered. Use the returns policy to ask for a return or refund.','Order closed','This order is no longer editable.',
  'Order status history','Every recorded status change appears here, including cancellation.'
];

test('master and runtime EN/CKB/AR dictionaries stay exactly key-aligned', () => {
  const keys = Object.keys(main.en).sort();
  assert.deepEqual(Object.keys(main.ckb).sort(), keys);
  assert.deepEqual(Object.keys(main.ar).sort(), keys);
  for (const key of keys) {
    assert.equal(ckbRuntime.ckb[key], main.ckb[key], `Sorani runtime mismatch: ${key}`);
    assert.equal(arRuntime.ar[key], main.ar[key], `Arabic runtime mismatch: ${key}`);
  }
});

test('staff Manager/Admin account page copy has all three translations', () => {
  for (const phrase of staffPhrases) {
    assert.ok(main.en[phrase], `English staff copy missing: ${phrase}`);
    assert.ok(main.ckb[phrase], `Sorani staff translation missing: ${phrase}`);
    assert.ok(main.ar[phrase], `Arabic staff translation missing: ${phrase}`);
  }
});

test('regional pricing and customer order lifecycle copy is translated in all locales', () => {
  for (const phrase of newPricingOrderPhrases) {
    assert.ok(main.en[phrase], `English phrase missing: ${phrase}`);
    assert.ok(main.ckb[phrase], `Sorani phrase missing: ${phrase}`);
    assert.ok(main.ar[phrase], `Arabic phrase missing: ${phrase}`);
  }
});

test('templates avoid baked-in location-specific fee and tax examples', () => {
  const settings = read('views/admin/settings.ejs');
  assert.match(settings, /Country A \| City A \| \* \| 5\.00/);
  assert.doesNotMatch(settings, /Iraq \| Baghdad \| \* \| 5000|Iraq \| \* \| \* \| 0 \| no/);
});
