import {assertRuntimeStyles,assertSharedAppCacheVersion,assertLocaleScripts,assertCurrentDesignAccessibility,assertOrderFlowCopy} from './helpers/current-design-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const lum=hex=>{const c=hex.replace('#','').match(/.{2}/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
const ratio=(a,b)=>{const [hi,lo]=[lum(a),lum(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);};

test('2027 layered CSS, matching preview versions and accessibility remain intact',()=>{
  assertRuntimeStyles();
  assertSharedAppCacheVersion();
  assertCurrentDesignAccessibility();
  assertLocaleScripts();
});

test('V11 makes buttons, cards, forms, navigation, cart and error feedback consistent',()=>{
 const css=read('test/fixtures/legacy-css/design-v11.css');
 for(const token of ['--bg: #f7f7f2','--accent: #246448','.btn-dark:hover:not(:disabled)','.product-card-signature','.category-card','.shop-controls','.product-detail-v5','.cart-layout-v5','.checkout-layout-v5','.admin-grid','.site-footer','.error-page','.cart-action-error',':focus-visible','@media (max-width: 760px)','@media (max-width: 480px)','@media (prefers-reduced-motion: reduce)','@media (forced-colors: active)','html[dir="rtl"]']) assert.ok(css.includes(token),`missing V11 design coverage: ${token}`);
 assert.doesNotMatch(css,/font-size:\s*[1-9]px\s*;/,'no sub-10px text should be introduced by V11');
 assert.ok(ratio('#ffffff','#246448')>=4.5,'white on primary action should meet WCAG AA contrast');
 assert.ok(ratio('#ffffff','#174832')>=4.5,'white on hover action should meet WCAG AA contrast');
});

test('V11 keeps product imagery readable and mobile layouts responsive without changing checkout/payment architecture',()=>{
 const css=read('test/fixtures/legacy-css/design-v11.css'), h=read('views/partials/header.ejs'), checkout=read('views/checkout.ejs');
 assert.match(css,/aspect-ratio: 4 \/ 4\.8/);
 assert.match(css,/object-fit: contain/);
 assert.match(css,/min-height: 46px/);
 assert.match(css,/grid-template-columns: minmax\(0,1fr\)/);
 assert.match(h,/dir="<%= \['ckb','ar','kmr'\]\.includes\(locale\)\?'rtl':'ltr' %>"/);
 assert.match(checkout,/action="\/checkout"/);
 assert.match(checkout,/name="_csrf"/);
 assert.match(checkout,/cash_on_delivery|cash on delivery/i);
});
