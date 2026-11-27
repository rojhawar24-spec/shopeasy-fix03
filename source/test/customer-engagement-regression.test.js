import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emailAddress,actionToken,tokenHash,validActionToken,sanitizeReview} from '../src/engagement-validation.js';
import {APPEARANCE_SWITCHES,normalizeAppearance} from '../src/store-appearance.js';
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('consent and product review inputs reject malformed values',()=>{
  assert.equal(emailAddress(' Customer@Example.COM '),'customer@example.com');
  for(const bad of ['x','a@localhost','xx@@a.com','x@a..com','a'.repeat(260)+'@a.com', 'a\r\nb@x.com']) assert.equal(emailAddress(bad),'');
  assert.equal(sanitizeReview({rating:0,title:'Great product',body:'This is a detailed review of this product.'}),null);
  assert.equal(sanitizeReview({rating:6,title:'Great product',body:'This is a detailed review of this product.'}),null);
  assert.equal(sanitizeReview({rating:4,title:'ok',body:'This is a detailed review of this product.'}),null);
  assert.equal(sanitizeReview({rating:4,title:'Great',body:'short'}),null);
  assert.equal(sanitizeReview({rating:4,title:'Great',body:'This is a detailed review of this product.'}).rating,4);
});
test('cryptographically random one-time bearer token has a fixed 256-bit shape',()=>{
  const first=actionToken(),second=actionToken();
  assert.equal(first.length,43);assert.ok(validActionToken(first));assert.notEqual(first,second);
  assert.match(tokenHash(first),/^[a-f0-9]{64}$/);assert.notEqual(tokenHash(first),tokenHash(second));
  assert.equal(validActionToken('../escape'),false);assert.equal(validActionToken(''),false);
});
test('all customer-engagement options are disabled by default and owner-configurable',()=>{
  for(const flag of ['newsletter','reviews','stockAlerts','cartDrawer','countrySuggestion']){
    assert.equal(APPEARANCE_SWITCHES[flag],false);
    assert.equal(normalizeAppearance({[flag]:'1'})[flag],true);
    assert.equal(normalizeAppearance({[flag]:'0'})[flag],false);
  }
});
test('review path verifies completed-purchase eligibility and moderates before publication',()=>{
  const m=source('src/customer-engagement.js');
  assert.match(m,/o\.status='completed'/);
  assert.match(m,/status='pending'/);
  assert.match(m,/r\.status='approved'/);
  assert.match(m,/status='pending'\s*AND|AND status='pending'/);
  assert.match(source('src/server.js'),/app\.post\('\/products\/:id\/reviews',requireAuth/);
  assert.match(source('src/server.js'),/app\.post\('\/admin\/reviews\/moderate',requireManager,verifyCsrf/);
});
test('mailing routes require explicit consent, token expiry, unsubscribe and manager action',()=>{
  const m=source('src/customer-engagement.js'),server=source('src/server.js');
  assert.match(m,/confirmation_expires_ms>\?/);
  assert.match(m,/status='active'/);
  assert.match(m,/status='unsubscribed'/);
  assert.match(m,/status='confirmed'/);
  assert.match(server,/app\.post\('\/newsletter\/subscribe',engagementLimiter/);
  assert.match(server,/app\.post\('\/admin\/newsletter\/send-batch',requireManager,newsletterSendLimiter,verifyCsrf/);
  assert.match(server,/newsletterSubscriberActive\(item\.email\)/);
  assert.match(source('src/services/email.js'),/sendNewsletterCampaignEmail/);
  assert.match(source('src/services/email.js'),/Unsubscribe/);
});
test('unsubscribed newsletter addresses can consent again, without reviving the old opt-out token',()=>{
  const sourceCode=source('src/customer-engagement.js');
  assert.match(sourceCode,/ON CONFLICT\(email\) DO UPDATE SET status='pending'/);
  assert.match(sourceCode,/unsubscribe_hash=excluded\.unsubscribe_hash/);
  assert.match(sourceCode,/UPDATE newsletter_subscriptions SET status='active'.*confirmation_hash=NULL/s);
});
test('drawer route does not mutate cart or checkout and remains server-gated',()=>{
  const s=source('src/server.js'),section=s.split("app.get('/api/cart/preview'")[1].split('});')[0];
  assert.match(section,/appearance\.cartDrawer/);
  assert.match(section,/cartSummary\(req\)/);
  assert.doesNotMatch(section,/saveSessionCart|createOrderAtomic|setSetting|checkoutIntent/);
  assert.match(source('views/partials/header.ejs'),/data-cart-drawer-trigger/);
});
test('privacy deletion includes marketing and stock-alert tables',()=>{
  const db=source('src/db.js');
  for(const name of ['newsletter_subscriptions','newsletter_deliveries','stock_alerts']){
    assert.ok(db.includes(`DELETE FROM ${name} WHERE lower(email)=lower(?)`));
  }
  assert.match(db,/newsletter_subscription:newsletterRecord/);
});
test('multipart manager appearance form validates CSRF after Multer parsing',()=>{
  const server=source('src/server.js');
  assert.match(server,/\['\/admin\/categories\/save','\/admin\/products\/save','\/admin\/stories\/save','\/admin\/branding','\/admin\/appearance'\]/);
  assert.match(server,/app\.post\('\/admin\/appearance',requireManager,upload\.single\('shopLogo'\),verifyCsrf/);
});

test('country hints are browser-only and never override checkout tax or shipping',()=>{
  const js=source('public/js/retail-2027.js');
  assert.match(js,/navigator\.languages/);
  assert.match(js,/Intl\.DisplayNames/);
  assert.doesNotMatch(js,/fetch\(['"]\/api\/geo/);
  assert.match(source('views/partials/footer.ejs'),/data-country-suggestion/);
  assert.match(source('views/home.ejs'),/newsletterNotice/);
});
