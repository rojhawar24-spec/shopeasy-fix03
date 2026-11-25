import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const luminance=hex=>{const c=hex.replace('#','').match(/.{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const contrast=(a,b)=>{const pair=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (pair[0]+.05)/(pair[1]+.05);};

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('V14 defines a consistent accessible palette and responsive behavior across main surfaces',()=>{
  const css=read('test/fixtures/legacy-css/design-v14.css');
  for(const rule of ['--bg: #f7f6f2','--ink: #202821','--accent: #1e5b42','.hero {','.product-grid-signature {','.product-detail-v5 {','.cart-layout-v5','.checkout-layout-v5','.admin-nav {','.story-grid {','html[dir="rtl"]','@media (max-width: 760px)','@media (max-width: 420px)','@media (prefers-reduced-motion: reduce)','@media (forced-colors: active)']) assert.ok(css.includes(rule),`V14 design rule missing: ${rule}`);
  assert.ok(contrast('#ffffff','#1e5b42')>=4.5,'white on primary CTA must meet WCAG AA contrast');
  assert.ok(contrast('#ffffff','#164631')>=4.5,'white on hover CTA must meet WCAG AA contrast');
  assert.doesNotMatch(css,/font-size:\s*[1-9]px\s*;/,'V14 must not introduce tiny text');
});

test('homepage hero art is separately configurable through Manager branding and safely uploaded',()=>{
  const server=read('src/server.js');
  const form=read('views/admin/branding.ejs');
  const home=read('views/home.ejs');
  assert.match(server,/app\.post\('\/admin\/branding',requireManager,upload\.single\('heroImage'\),verifyCsrf/);
  assert.match(server,/safeImagePath\(req\.file\.buffer,req\.file\.mimetype\)/);
  assert.match(server,/getSetting\('hero_image',''\)/);
  assert.match(server,/UNION ALL SELECT 1 AS used FROM settings WHERE key IN \('hero_image','appearance_logo'\) AND value=\?/);
  assert.match(server,/\['\/admin\/products\/save','\/admin\/stories\/save','\/admin\/branding','\/admin\/appearance'\]/);
  assert.match(form,/enctype="multipart\/form-data"/);
  assert.match(form,/name="heroImage" type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(form,/name="removeHeroImage" value="1"/);
  assert.match(home,/v17-spotlight-image/);
  assert.match(home,/safeImageUrl\(heroProduct\.image_url\)/);
  assert.doesNotMatch(home,/hero-editorial\.webp|hero-studio\.svg/);
  assert.match(server,/const heroProduct=latestProducts\.find/);
  assert.match(home,/heroProduct\.name/);
});

test('MFA QR download errors are accessible inline messages, not blocking browser alerts',()=>{
  const js=read('public/js/mfa-setup.js');
  const page=read('views/mfa-setup.ejs');
  assert.match(js,/mfa-download-status/);
  assert.match(page,/id="mfa-download-status" class="mfa-download-status" role="status" aria-live="polite"/);
  assert.doesNotMatch(js,/window\.alert\s*\(/);
  assert.match(js,/const translate = value => window\.ShopEasyI18n\?\.translate\(value\) \|\| value/);
  for(const phrase of ['Preparing PNG…','Your QR code download has started.','The PNG could not be created in this browser. Try another browser or use the manual setup key.','Key copied. Keep it private.','Copy failed. Select the key and copy it manually.']) {
    assert.ok(read('public/js/i18n-ckb.js').includes(JSON.stringify(phrase)),`Sorani translation source is missing: ${phrase}`);
    assert.ok(read('public/js/i18n-ar.js').includes(JSON.stringify(phrase)),`Arabic translation source is missing: ${phrase}`);
  }
  assert.match(read('views/partials/footer.ejs'),/i18n-ckb\.js\?v=2\.8\.95-r28/);
  assert.match(read('views/partials/footer.ejs'),/i18n-ar\.js\?v=2\.8\.95-r28/);
});
