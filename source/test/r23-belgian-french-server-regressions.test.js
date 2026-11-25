import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { deliversToBelgium, effectiveLaunchMode, evaluateLaunchReadiness,
  launchGateMessage, minimumCustomerTermsLength } from '../src/launch-gate.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const simplified = {
  mode:'simplified_cod', storeName:'Example Store', supportEmail:'owner@example.com',
  policies:{terms:'These terms apply to the customer purchase.'}, shippingConfigured:true,
  deliveryCountriesConfigured:true, sellableProductCount:1, currencyReviewComplete:true
};
const compliant = {
  ...simplified, legalName:'Example Company', businessAddress:'Street 1, Brussels',
  businessPhone:'+32 2 555 0101', enterpriseNumber:'0123.456.789',
  pricesIncludeTax:true, policies:true
};

test('Belgium country spelling variants force standard setup independent of selected mode', () => {
  for (const country of ['BE','be','Belgium','BELGIUM','België','Belgie','Belgique','Belgien','Belgio','Bélgica','Belgica']) {
    assert.equal(deliversToBelgium([country]),true, `Belgium spelling ${country}`);
    assert.equal(effectiveLaunchMode('simplified_cod',[country]),'standard');
    assert.equal(evaluateLaunchReadiness({...simplified,deliveryCountries:[country]}),false);
    assert.equal(minimumCustomerTermsLength('simplified_cod',[country]),40);
    assert.match(launchGateMessage('simplified_cod',[country]),/business identity/);
  }
});

test('België included alongside other shipping countries cannot bypass strict business checks', () => {
  const countries=['Netherlands','BELGIË','France'];
  assert.equal(evaluateLaunchReadiness({...simplified,deliveryCountries:countries}),false);
  assert.equal(evaluateLaunchReadiness({...compliant,deliveryCountries:countries}),true);
  for (const field of ['legalName','businessAddress','businessPhone','enterpriseNumber','supportEmail']) {
    assert.equal(evaluateLaunchReadiness({...compliant,[field]:'',deliveryCountries:countries}),false,`missing ${field}`);
  }
  assert.equal(evaluateLaunchReadiness({...compliant,pricesIncludeTax:false,deliveryCountries:countries}),false);
  assert.equal(evaluateLaunchReadiness({...compliant,policies:false,deliveryCountries:countries}),false);
  assert.equal(evaluateLaunchReadiness({...compliant,currencyReviewComplete:false,deliveryCountries:countries}),false);
});

test('simplified local COD remains possible in non-Belgian markets, but cannot skip contacts/terms/products', () => {
  for (const country of ['Iraq','Syria','Netherlands','France']) {
    assert.equal(deliversToBelgium([country]),false);
    assert.equal(effectiveLaunchMode('simplified_cod',[country]),'simplified_cod');
    assert.equal(evaluateLaunchReadiness({...simplified,deliveryCountries:[country]}),true);
    assert.equal(evaluateLaunchReadiness({...simplified,supportEmail:'',deliveryCountries:[country]}),false);
    assert.equal(evaluateLaunchReadiness({...simplified,policies:{terms:'short'},deliveryCountries:[country]}),false);
    assert.equal(evaluateLaunchReadiness({...simplified,policies:null,deliveryCountries:[country]}),false);
    assert.equal(evaluateLaunchReadiness({...simplified,sellableProductCount:0,deliveryCountries:[country]}),false);
    assert.equal(minimumCustomerTermsLength('simplified_cod',[country]),20);
  }
});

test('untrusted malformed delivery country arrays never falsely trigger Belgian detection', () => {
  for (const value of [null,undefined,{},'Belgium',[],[123],[{}],[''],['Belgium.example']]) {
    assert.equal(deliversToBelgium(value),false);
  }
});

test('server readiness checks the effective mode before deciding which policies to pass', () => {
  const server=read('src/server.js');
  assert.match(server,/const setupMode=effectiveLaunchMode\(configuredMode,deliveryCountries\)/);
  assert.match(server,/const readinessInputs=\{mode:setupMode,deliveryCountries,storeName/);
  assert.match(server,/evaluateLaunchReadiness\(readinessInputs\)&&pricingRulesValid/);
  assert.match(server,/configurationReady=evaluateLaunchReadiness\(\{\.\.\.readinessInputs,sellableProductCount:1\}\)&&pricingRulesValid/);
  assert.match(server,/policies:setupMode===MARKET_SETUP_MODES\.STANDARD \? Object\.values\(policyChecks\)\.every\(Boolean\)/);
  assert.match(server,/marketSetupMode:setupMode/);
  const settings=read('views/admin/settings.ejs');
  assert.match(settings,/Belgium delivery requires Standard checkout readiness/);
  const js=read('public/js/app.js');
  assert.match(js,/marketDeliveryCountries\?\.addEventListener\('input', updateMarketSetupPreview\)/);
});

test('French category/shop heading renders in French before browser JavaScript runs', () => {
  const shop=read('views/shop.ejs');
  const expression=shop.match(/<h1(?: data-no-translate)?><%= ([\s\S]*?) %><\/h1>/)?.[1];
  assert.ok(expression,'actual shop heading expression exists');
  const evaluate=new Function('_categoryInfo','locale',`return (${expression});`);
  assert.equal(evaluate(null,'fr'),'Découvrez tous les produits.');
  assert.equal(evaluate(null,'nl'),'Bekijk alle producten.');
  assert.equal(evaluate(null,'en'),'Shop everything.');
  assert.equal(evaluate({name:'Lampes'},'fr'),'Lampes');
  assert.match(shop,/Recherchez par nom ou description, parcourez les catégories/);
});

test('French shop and footer server dictionaries cover important visible controls without JavaScript', () => {
  const shop=read('views/shop.ejs');
  const footer=read('views/partials/footer.ejs');
  const shopObject=shop.match(/const shopFrench = (\{[\s\S]*?\});\nconst shopText/)?.[1];
  const footerObject=footer.match(/const footerFrench = (\{[\s\S]*?\}); const footerText/)?.[1];
  assert.ok(shopObject && footerObject);
  const shopFr=runInNewContext(`(${shopObject})`);
  const footerFr=runInNewContext(`(${footerObject})`);
  for (const key of ['Category','Sort','Featured','Added to your bag','No products found.','View bag','Remove sorting']) {
    assert.notEqual(shopFr[key],undefined,key);
    assert.notEqual(shopFr[key],key,key);
  }
  for (const key of ['All products','Terms','Privacy','Track an order','Account','Cart preview','Payment options shown at checkout.']) {
    assert.notEqual(footerFr[key],undefined,key);
    assert.notEqual(footerFr[key],key,key);
  }
  assert.match(shop,/shopText\('No products found\.'\)/);
  assert.match(footer,/footerText\('Track an order'\)/);
});
