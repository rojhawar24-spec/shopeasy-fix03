import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
function getDictionary(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} dictionary source should be present`);
  return JSON.parse(match[1]);
}
const main = getDictionary(read('public/js/i18n.js'), /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalize/, 'main');
const arabic = getDictionary(read('public/js/i18n-ar.js'), /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/, 'Arabic');
const sorani = getDictionary(read('public/js/i18n-ckb.js'), /const dictionary = (\{[\s\S]*\});\s*\n\s*const normalizeWhitespace/, 'Sorani');

test('storefront has translations for checkout and manager labels in all supported languages', () => {
  const phrases = [
    'Postal code', 'Delivery & returns', 'Back to shop', 'View my bag', 'SHOPPING HELP',
    'Purchase cost not set', 'Cost', 'Unit margin',
    'Manage product details, prices, availability and what customers can see.',
    'Quantity ×', 'Name *', 'available', 'reserved', 'left', 'options',
    'You can return to your cart and try again.', '+ Stock', 'PRODUCTS /', 'sold ·', 'gross',
    'profit incomplete', 'Requested:', 'Decide before shipping.',
    'Previous cancellation request was rejected on', 'Reason:',
    'Include the full international number with country calling code.',
    'Stock added successfully. The same product, SKU, price and order history were kept.',
    'Category image (optional)', 'Display order (lower numbers first)',
    'Only add a public HTTPS image link if you want a custom category picture. Leave this blank to use the default image.',
    'Use 0 for highest priority. A smaller number makes this category appear earlier in the shop.',
    'You can add up to 99 of the same product option. Check the quantity and try again.',
    'The maximum is 99 of the same product option. Reduce the quantity to 99 or less and update.',
    'Discount code not applied.', 'That code is invalid, inactive or expired.',
    'The order does not meet that code’s minimum spend.', 'Your cart prices have not been changed by this attempt.',
    'Your existing code', 'is still active and saves', 'remains active and saves',
    'Enter a discount code before selecting Apply code. Use Remove code to clear a code that is already active.',
    'Active code', 'You save', 'Remove code',
    'Enter the code provided by the shop. An invalid replacement will not remove a valid code that is already active.',
    'Your previous discount code no longer meets its minimum order value, so it is no longer applied.',
    'Nothing is waiting here yet. Browse the shop and add an item whenever you are ready.',
    'Your details', 'Manage your login and continue shopping.', 'ORDER HISTORY',
    'Follow each order from confirmation to delivery.', 'order in your history', 'orders in your history',
    'Your bag is empty.', 'Order summary', 'Subtotal before discounts', 'Automatic product discounts',
    'Order total', 'Delivery', 'Continue shopping', 'Fix stock issues to continue',
    'Delivery fee and any valid discount are shown above. Stock and the final total are checked again before the order is accepted.',
    'Pay in cash when your order is delivered. No card is needed.',
    'Credit or debit card',
    'Continue to Mollie’s secure hosted checkout. Your card details are entered with the payment provider, not in ShopEasy.',
    'Secure provider checkout · ShopEasy does not collect or store your card number or security code. Card availability depends on the store’s approved payment setup.',
    'Online card payment is not enabled for this store. Cash on delivery remains available. The store manager must complete provider onboarding and configuration before card checkout can appear.',
    'Card checkout is not available for this store yet. Choose cash on delivery or contact the store.',
    'Choose one of the payment methods shown at checkout.',
    'Card payments are not configured yet. Choose cash on delivery.',
    'Card payments require the store’s public HTTPS address to be configured. Choose cash on delivery for now.',
    'The secure payment provider is temporarily unavailable. Your cart has been kept; please try again or choose cash on delivery.',
    'The secure payment provider could not create this payment. Your cart has been kept; please try again or choose cash on delivery.',
    'The secure payment provider returned an invalid response. Your cart has been kept; contact the store if this repeats.',
    'The payment could not be linked safely to this order. It has not been confirmed; please contact the store before retrying.',
    'Payment options shown at checkout.',
  ];
  for (const phrase of phrases) {
    assert.ok(main.en[phrase], `English dictionary entry missing: ${phrase}`);
    assert.ok(main.ar[phrase], `Arabic dictionary entry missing: ${phrase}`);
    assert.ok(main.ckb[phrase], `Sorani dictionary entry missing: ${phrase}`);
    assert.ok(arabic.ar[phrase], `Arabic runtime dictionary entry missing: ${phrase}`);
    assert.ok(sorani.ckb[phrase], `Sorani runtime dictionary entry missing: ${phrase}`);
  }
  for (const phrase of [
    'Pay in cash when your order is delivered. No card is needed.',
    'Credit or debit card',
    'Continue to Mollie’s secure hosted checkout. Your card details are entered with the payment provider, not in ShopEasy.',
    'Secure provider checkout · ShopEasy does not collect or store your card number or security code. Card availability depends on the store’s approved payment setup.',
    'Online card payment is not enabled for this store. Cash on delivery remains available. The store manager must complete provider onboarding and configuration before card checkout can appear.',
    'Payment options shown at checkout.'
  ]) {
    assert.notEqual(sorani.ckb[phrase], phrase, `Sorani payment translation missing: ${phrase}`);
    assert.notEqual(arabic.ar[phrase], phrase, `Arabic payment translation missing: ${phrase}`);
  }
});

test('category and search examples use reusable general-retail copy', () => {
  const shop = read('views/shop.ejs');
  const categories = read('views/admin/categories.ejs');
  const productForm = read('views/admin/product-form.ejs');
  assert.match(shop, /e\.g\. clothing, homeware, accessories/);
  assert.match(categories, /such as Clothing, Homeware or Accessories/);
  assert.match(categories, /placeholder="Accessories"/);
  assert.match(categories, /Mugs under Homeware/);
  assert.match(productForm, /placeholder="lightweight, everyday, handmade"/);
  assert.doesNotMatch(shop + categories + productForm, /perfume, face cream, serum|Perfume, skincare or makeup|Serums under Skincare|floral, woody, skincare|Shoes, Clothing or Gifts|Trainers under Shoes/);
  assert.doesNotMatch(categories, /child categor<%=/, 'child-category plural must not be split across an untranslated English suffix');
  assert.match(categories, /فئة فرعية/);
  assert.match(categories, /پۆلی لاوەکی/);
});


test('checkout and legal templates avoid market-specific legacy examples', () => {
  const checkout = read('views/checkout.ejs');
  const ckbTerms = read('SELLER-PROTECTION-PACK/legal/terms/ckb.md');
  const arTerms = read('SELLER-PROTECTION-PACK/legal/terms/ar.md');
  assert.match(checkout, /Include the full international number with country calling code\./);
  assert.doesNotMatch(checkout, /\+964|\+32/);
  assert.doesNotMatch(ckbTerms, /عێراق|Baghdad|٧ ڕۆژ بۆ عێراق/);
  assert.doesNotMatch(arTerms, /العراق|بغداد|7 أيام في العراق/);
  const legacyKeys = [
    'Iraq United Arab Emirates',
    'e.g. water bottle, backpack, skincare',
    'Perfume',
    'Create clear groups so customers can find products quickly, such as Perfume, skincare or makeup.',
    'Choose a parent only when this category belongs inside another category, for example Serums under Skincare.',
    'floral, woody, skincare',
  ];
  for (const locale of [main.en, main.ar, main.ckb, arabic.ar, sorani.ckb]) {
    for (const key of legacyKeys) assert.equal(Object.hasOwn(locale, key), false, `legacy market/beauty dictionary key retained: ${key}`);
  }
});

test('Arabic and Sorani runtime dictionaries stay aligned with the master dictionary for all supported keys', () => {
  assert.deepEqual(Object.keys(main.en).sort(), Object.keys(main.ar).sort());
  assert.deepEqual(Object.keys(main.en).sort(), Object.keys(main.ckb).sort());
  for (const key of Object.keys(main.en)) {
    assert.equal(arabic.ar[key], main.ar[key], `Arabic runtime mismatch: ${key}`);
    assert.equal(sorani.ckb[key], main.ckb[key], `Sorani runtime mismatch: ${key}`);
  }
});
