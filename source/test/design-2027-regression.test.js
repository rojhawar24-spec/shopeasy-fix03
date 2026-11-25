import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFAULT_APPEARANCE,APPEARANCE_SWITCHES,allowedFonts,validPrimary,safeHex,normalizeAppearance,appearanceCss} from '../src/store-appearance.js';
const text=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('new design tokens cover interactive, responsive, focus, motion, dark theme and RTL',()=>{
 const css=text('public/css/design-tokens.css')+'\n'+text('public/css/retail-2027.css');
 for(const name of ['--brand-primary','--brand-font','--canvas','--line','--font-display','--shadow-focus','--radius-lg','--space-16']) assert.ok(css.includes(name),name);
 for(const part of ['data-theme="dark"','[dir="rtl"]','prefers-reduced-motion','forced-colors','max-width:359px','min-width:1800px',':focus-visible','cookie-consent-banner','compare-tray','quick-view']) assert.ok(css.includes(part),part);
});
test('brand colours reject low-contrast text surfaces and malicious CSS',()=>{
 assert.ok(validPrimary('#4335c9'));
 assert.ok(!validPrimary('#ffffff'));
 assert.ok(!validPrimary('red'));assert.ok(!validPrimary('#00ff00'));assert.ok(!validPrimary('#000000;display:none'));
 assert.equal(safeHex('red',''), '');
 assert.equal(normalizeAppearance({brandPrimary:'#FFFFFF'}).brandPrimary,DEFAULT_APPEARANCE.brandPrimary);
 const injected=appearanceCss({brandPrimary:'#ffffff;}.secret{display:none',brandAccent:'"<>',font:'url(https://evil)',logo:'javascript:alert(1)'});
 assert.ok(!/evil|javascript:|display:none|url\(/.test(injected));
});
test('store logo path, font and server toggles are validated',()=>{
 assert.deepEqual(allowedFonts,['inter','system','editorial']);
 assert.equal(normalizeAppearance({logo:'/uploads/'+'a'.repeat(32)+'.webp'}).logo,'/uploads/'+'a'.repeat(32)+'.webp');
 assert.equal(normalizeAppearance({logo:'/uploads/../../secret'}).logo,'');
 assert.equal(normalizeAppearance({font:'oops'}).font,'inter');
 for (const flag of Object.keys(APPEARANCE_SWITCHES)) assert.equal(normalizeAppearance({[flag]:'0'})[flag],false);
 assert.equal(normalizeAppearance({freeShippingMinimum:'-100'}).freeShippingMinimum,0);
 assert.equal(normalizeAppearance({freeShippingMinimum:'99999999999999999999'}).freeShippingMinimum,0);
});
test('all optional storefront controls are conditionally rendered by server settings',()=>{
 const footer=text('views/partials/footer.ejs'), product=text('views/partials/product-card.ejs');
 const server=text('src/server.js'),manager=text('views/admin/appearance.ejs');
 for(const flag of Object.keys(APPEARANCE_SWITCHES))assert.ok(manager.includes("'"+flag+"'")||manager.includes('appearance.'+flag),flag);
 for(const fragment of ['appearance.quickView','appearance.compare','appearance.recentlyViewed'])assert.ok(footer.includes(fragment)||product.includes(fragment),fragment);
 for(const fragment of ['requireManager,upload.single(\'shopLogo\'),verifyCsrf','normalizeAppearance','appearanceCss(res.locals.appearance)','setSettings(Object.entries(values))'])assert.ok(server.includes(fragment),fragment);
 assert.ok(footer.includes('/js/retail-2027.js?v=2027-p2'));
 for(const element of ['data-quick-dialog','data-compare-tray','data-compare-dialog','data-recently-viewed'])assert.ok(footer.includes(element),element);
});
test('new FAQ/contact endpoints, SEO, unchanged payment routes and legal explicit checkout copy',()=>{
 const server=text('src/server.js');
 for(const route of ["'/faq'","'/contact'","'/checkout'","'/cart/add'","'/api/search'"])assert.ok(server.includes(route),route);
 assert.ok(text('src/seo-locales.js').includes('faq'));
 assert.ok(text('views/checkout.ejs').includes('Order with obligation to pay'));
 assert.ok(text('views/checkout.ejs').includes('termsAccepted'));
 for (const name of ['faq','contact'])for(const code of ['en:','nl:','ckb:','ar:'])assert.ok(text('views/'+name+'.ejs').includes(code),name+' '+code);
});
