import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const read = async p=>readFile(new URL(p,root),'utf8');
const [cart,checkout,success,product,order,back,flow,css,provider,server] = await Promise.all([
  'views/cart.ejs','views/checkout.ejs','views/success.ejs','views/product.ejs','views/order.ejs',
  'views/partials/back-button.ejs','views/partials/purchase-journey.ejs',
  'public/css/research-polish-2027.css','src/services/payment-providers.js','src/server.js'
].map(read));

test('the visible stepper maps to real cart, checkout and confirmation pages',()=>{
 assert.match(cart,/journeyStage:'cart'/);
 assert.match(checkout,/journeyStage:'checkout'/);
 assert.match(success,/journeyStage:'confirmation'/);
 assert.match(flow,/pSteps=\['cart','checkout','confirmation'\]/);
 assert.match(flow,/aria-current/);
 assert.doesNotMatch(flow,/href="\/checkout"/); // never re-enter a paid/pending checkout by clicking a fake step.
 assert.match(flow,/href="\/cart"/);
});

test('checkout collects contact, then delivery, then payment and preserves old server field names',()=>{
 const contact=checkout.indexOf('name="customerEmail"');
 const shipping=checkout.indexOf('name="shippingAddress"');
 const radio=checkout.indexOf('name="paymentMethod"');
 const terms=checkout.indexOf('name="termsAccepted"');
 assert.ok(contact>0 && shipping>contact && radio>shipping && terms>radio);
 for(const value of ['name="_csrf"','name="idempotencyKey"','name="guestAccessToken"','name="pricingQuoteId"','name="shippingCountry"','name="shippingPostalCode"','action="/checkout"','data-submit-once'])assert.ok(checkout.includes(value),value);
 assert.match(checkout,/Order with obligation to pay/);
});

test('no back navigation can return from confirmation into a stale checkout or payment form',()=>{
 assert.doesNotMatch(success,/partials\/back-button/);
 assert.match(product,/product-return-navigation/);
 assert.match(order,/fallback: '\/account'/);
 assert.match(checkout,/fallback: '\/cart'/);
 assert.match(cart,/fallback: '\/shop'/);
 assert.doesNotMatch(back,/data-smart-back|history\.back/);
});

test('card option is shown only when enabled, is hosted by Mollie and preserves server checks',()=>{
 assert.match(checkout,/<% if\(checkoutCardEnabled\)\{ %>/);
 assert.match(checkout,/value="card"/);
 assert.match(checkout,/Mollie/);
 assert.match(checkout,/Card availability depends on the store/);
 assert.match(server,/requestedPaymentMethod==='card'&&!payments\.status\.checkoutCardEnabled/);
 assert.match(provider,/publicHttpsUrlConfigured/);
 assert.match(provider,/transactionModeAllowed/);
 assert.match(server,/applyMolliePaymentState/);
 assert.match(server,/PAYMENT_REFERENCE_MISMATCH/);
});

test('light, dark, RTL and reduced-motion purchase styling share the existing design system',()=>{
 assert.match(css,/\.purchase-journey-list/);
 assert.match(css,/\.checkout-form-v5/);
 assert.match(css,/html\[data-theme=dark\]/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/!important/);
});
