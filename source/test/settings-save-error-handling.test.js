import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('settings POST contains unexpected failures and preserves submitted legal-policy text',()=>{
  const server=read('src/server.js');
  const start=server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{");
  const end=server.indexOf("\n\napp.use((req,res)=>res.status(404).render('error'",start);
  assert.ok(start>=0&&end>start,'settings POST route must be located');
  const route=server.slice(start,end);
  assert.match(route,/let failureStage='normalize-submitted-form'/);
  assert.match(route,/failureStage='read-current-settings'/);
  assert.match(route,/failureStage='write-settings-batch'/);
  assert.match(route,/const draftText=\(value,max\)=>typeof value==='string'\?value\.slice\(0,max\):''/);
  assert.match(route,/logOperationalFailure\(`Store settings request failed at \$\{failureStage\}`,[\s\S]*?\)/);
  assert.match(route,/your entered values are preserved on this page/i);
  assert.match(route,/const renderOverrides=\{\.\.\.submitted,storeReady:false,saved:false,error:errorMessage\}/);
  assert.match(route,/buildAdminSettingsData\(renderOverrides\)/);
  assert.match(route,/title:'Store settings temporarily unavailable'/);
  assert.match(route,/No successful save was confirmed/);
  assert.doesNotMatch(route,/console\.log\s*\(/,'settings route must not add debug console logging');
});

test('settings input is validated before a database write and invalid text is not saved',()=>{
  const server=read('src/server.js');
  const start=server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{");
  const end=server.indexOf("\n\napp.use((req,res)=>res.status(404).render('error'",start);
  const route=server.slice(start,end);
  assert.ok(route.indexOf('if(!inputIsValid)')<route.indexOf("failureStage='write-settings-batch'"));
  assert.match(route,/return res\.status\(400\)\.render\('admin\/settings',data\)/);
  assert.match(route,/await saveStoreSettingsWithCurrency\(settingsEntries/);
  assert.match(route,/failureStage='verify-settings-readback'/,'Save must verify committed values before showing success');
  assert.match(route,/const persistedValue=await getSetting\(key,null\)/,'every persisted settings key must be read back');
  assert.match(route,/SETTINGS_READBACK_MISMATCH/,'a mismatched database read-back must not be reported as a successful save');
});


test('global error middleware gives store-settings requests a diagnostic-specific page',()=>{
  const server=read('src/server.js');
  const start=server.indexOf("app.use((err,req,res,next)=>{");
  const end=server.indexOf('async function bootstrapManager()',start);
  assert.ok(start>=0&&end>start,'global error middleware must be located');
  const handler=server.slice(start,end);
  assert.match(handler,/settingsRequestPath=String\(req\.path/);
  assert.match(handler,/req\.method==='POST'&&settingsRequestPath==='\/admin\/settings'/);
  assert.match(handler,/req\.method==='GET'&&settingsRequestPath==='\/admin\/settings'/);
  assert.match(handler,/title:'Store settings temporarily unavailable'/);
  assert.match(handler,/The save status could not be confirmed/);
  assert.match(handler,/Check the local server terminal for the diagnostic error/);
});

test('settings GET reports a database-load failure without changing settings',()=>{
  const server=read('src/server.js');
  const start=server.indexOf("app.get('/admin/settings',requireManager,async(req,res)=>{");
  const end=server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{",start);
  assert.ok(start>=0&&end>start,'settings GET route must be located');
  const route=server.slice(start,end);
  assert.match(route,/catch\(error\)/);
  assert.match(route,/logOperationalFailure\('Store settings page load',error\)/);
  assert.match(route,/No settings were changed/);
});

test('settings form parser accepts the bounded multilingual policy payload',()=>{
  const server=read('src/server.js');
  const general=server.indexOf('app.use(generalLimiter);');
  const urlencoded=server.indexOf("app.use(express.urlencoded({extended:false,limit:'2mb'}));");
  const json=server.indexOf('app.use(express.json(');
  assert.ok(urlencoded>general && json>urlencoded,'the rate limiter must precede bounded body parsers');
  assert.match(server,/up to 160k[\s\S]*URL-encoded UTF-8 can expand[\s\S]*2 MiB/);
});


test('settings form permits saving incomplete drafts while launch checklist keeps checkout closed',()=>{
  const settings=read('views/admin/settings.ejs');
  const server=read('src/server.js');
  assert.doesNotMatch(settings,/name="deliveryCountries"[^>]*required/);
  assert.match(settings,/Settings saved, delivery countries not changed/);
  assert.doesNotMatch(settings,/name="legalName"[^>]*required/);
  assert.doesNotMatch(settings,/name="supportEmail"[^>]*required/);
  assert.doesNotMatch(settings,/policyRequired\?'required'/);
  assert.match(settings,/required before checkout can open, not before you save a draft/i);
  assert.match(settings,/LAUNCH CHECK · affects checkout only, not saving settings/i);
  assert.match(settings,/Draft saved successfully/);
  assert.match(settings,/save these settings before adding products or buying stock/i);
  const guide=read('MANAGER-GUIDE.md');
  assert.match(guide,/After the first order exists, the store currency is locked/i);
  assert.match(server,/Policy completeness belongs to the launch gate, not draft persistence/);
  assert.match(server,/return res\.redirect\(303,`\/admin\/settings\?saved=1/);
  const routeStart=server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{");
  const routeEnd=server.indexOf("\n\napp.use((req,res)=>res.status(404).render('error'",routeStart);
  const block=server.slice(routeStart,routeEnd);
  assert.doesNotMatch(block,/sellableProductCount.*inputIsValid|storeReady.*inputIsValid/,'draft saving must not depend on the launch gate');
  const launchGate=read('src/launch-gate.js');
  assert.match(launchGate,/deliveryCountriesConfigured/);
  assert.match(launchGate,/Number\(sellableProductCount\)\s*>\s*0/);
});

test('unfinished English policy drafts are kept off public policy pages',()=>{
  const server=read('src/server.js');
  const start=server.indexOf('async function resolvePolicy(');
  const end=server.indexOf('async function policySetForSettings()',start);
  assert.ok(start>=0&&end>start);
  const block=server.slice(start,end);
  assert.match(block,/fallbackMinimum=field==='terms'/);
  assert.match(block,/length>=fallbackMinimum\?String\(rawFallback\):''/);
  assert.match(block,/length>=40/);
});


test('currency saves with products and coupons while historical order snapshots protect single-currency reports',()=>{
  const server=read('src/server.js');
  const settings=read('views/admin/settings.ejs');
  const db=read('src/db.js');
  const routeStart=server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{");
  const routeEnd=server.indexOf("\n\napp.use((req,res)=>res.status(404).render('error'",routeStart);
  const route=server.slice(routeStart,routeEnd);
  assert.match(server,/const currencyCouponCount=Number\(couponsCount\?\.c\|\|0\)/);
  assert.match(server,/currencyOrdersCount=currencyOrderCurrencies\.reduce\(\(sum,row\)=>sum\+row\.count,0\)/);
  assert.doesNotMatch(server,/const currencyLocked=/,'historical order count must not disable the currency selector');
  assert.match(route,/currencyChangeNeedsReview=currencyProductsCount>0\|\|currencyCouponsCount>0/);
  assert.doesNotMatch(route,/&&body\.confirmCurrencyChangeWithProducts!==['"]on['"]/,'currency change must not be blocked by an extra acknowledgement when products exist');
  assert.match(route,/const shippingFeeCents=moneyCents\(effectiveShippingFeeInput,currency\)/,'fee is parsed after target currency is determined');
  assert.match(route,/const effectiveShippingFeeInput=currency!==oldCurrency\?'0':\(submittedShippingFee.value\|\|'0'\)/,'old-currency delivery fees reset server-side');
  assert.match(route,/saveStoreSettingsWithCurrency/);
  assert.match(route,/allowAmountRescale:true/,'currency changes with existing product data must save in one transaction');
  assert.doesNotMatch(settings,/name="confirmCurrencyChangeWithProducts"/,'currency-impact warning must not create a hidden Save blocker');
  assert.match(route,/currencyChangedWithAmounts=currency!==oldCurrency&&\(currencyProductsCount>0\|\|currencyCouponsCount>0\)/);
  assert.match(settings,/name="currency" data-store-currency-select/);
  assert.doesNotMatch(settings,/currencyLocked/);
  assert.doesNotMatch(settings, /currencyChangeBlockedByOrders\?'disabled aria-disabled="true"'/, 'currency selector stays enabled to correct a legacy currency mismatch');
  assert.match(settings,/data-has-currency-data/);
  assert.match(settings,/fixed coupon values and coupon minimum-order amounts/);
  assert.match(settings,/You can save the new currency even when products or money-based coupons already exist/);
  assert.match(settings,/Existing order currencies:/);
  assert.match(settings,/Store currency must match every historical order currency/);
  assert.match(db,/CURRENCY_CHANGE_HAS_ORDERS/);
  assert.match(settings,/Existing order currencies:/);
  assert.match(db,/rescaleMinorUnitAmount/);
  assert.match(db,/UPDATE coupons SET value=\?,min_subtotal_cents=\? WHERE id=\?/);
  assert.doesNotMatch(db,/CURRENCY_LOCKED/);
  assert.match(db,/CURRENCY_CONFIRM_REQUIRED/);
});


test('settings Save remains reachable and reports dirty/saving states without duplicate submissions',()=>{
  const view=read('views/admin/settings.ejs');
  const ux=read('public/js/admin-settings-ux.js');
  const css=read('test/fixtures/legacy-css/design-v13.css');
  assert.match(view,/data-settings-form/);
  assert.match(view,/data-save-button/);
  assert.match(view,/admin-settings-ux\.js\?v=2027-r25/);
  assert.match(ux,/Unsaved changes/);
  assert.match(ux,/Saving…/);
  assert.match(ux,/if \(submitting\)/);
  assert.match(ux,/beforeunload/);
  assert.match(css,/\.settings-save-dock \{ position: sticky/);
  assert.match(css,/@media \(max-width: 640px\)/);
});
