import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function dutchRuntime() {
  class ElementMock {
    constructor() { this.attributes = new Map(); }
    matches() { return false; }
    closest() { return null; }
    hasAttribute(name) { return this.attributes.has(name); }
    getAttribute(name) { return this.attributes.get(name); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    querySelectorAll() { return []; }
  }
  const window = {};
  const document = { documentElement: { lang: 'nl-BE' }, body: new ElementMock(), createTreeWalker() { return { nextNode() { return false; } }; } };
  vm.runInNewContext(read('public/js/i18n-nl.js'), { window, document, Element: ElementMock, NodeFilter: { SHOW_TEXT: 4 } });
  return window.ShopEasyI18n;
}

test('cookie policy has complete, dedicated Belgian Dutch copy and disclosure', () => {
  const source = read('views/cookies.ejs');
  for (const phrase of [
    'Informatie over noodzakelijke cookies en cookievoorkeuren.', 'Cookiebeleid',
    'Noodzakelijke cookies', 'Taalvoorkeur', 'Opslag van voorkeuren',
    'Analyse en advertenties', 'Je voorkeuren wijzigen',
    'Een toekomstige optionele dienst mag pas worden geladen na geldige toestemming',
    'De winkeleigenaar blijft verantwoordelijk voor correcte informatie'
  ]) assert.ok(source.includes(phrase), `missing Dutch cookie copy: ${phrase}`);
  assert.match(source, /cookieCopy\[locale\]\|\|cookieCopy\.en/);
});

test('policy fallback and missing policy content are disclosed in Dutch', () => {
  const source = read('views/policy.ejs');
  assert.match(source, /locale==='nl'[\s\S]*Dit beleid wordt momenteel in het Engels getoond/);
  assert.match(source, /locale==='nl'\?'Lees deze informatie zorgvuldig door/);
  assert.match(source, /locale==='nl'\?'Deze informatie is nog niet toegevoegd\.'/);
});

test('order view has Dutch status, cancellation, returns and tax text', () => {
  const source = read('views/order.ejs');
  assert.match(source, /nl:\{pending:'Wacht op bevestiging',processing:'Geaccepteerd · wordt klaargemaakt'/);
  assert.match(source, /locale==='nl'\?'Je annuleringsverzoek is naar de winkel gestuurd ter beoordeling\.'/);
  assert.match(source, /nl:\{title:'Retouren, omruilingen en terugbetalingen'/);
  assert.match(source, /Belasting inbegrepen in de prijzen/);
  assert.match(source, /Je beveiligingscontrole is verlopen/);
});

test('success view contains complete Dutch order lifecycle and payment-provider copy', () => {
  const source = read('views/success.ejs');
  const required = ['Bestelstatus','BESTELLING GEANNULEERD','Bestelling ontvangen.','Betaal alleen contant wanneer de bestelling wordt geleverd.','Retouren en terugbetalingen','Je annuleringsverzoek is naar de winkel gestuurd ter beoordeling.','Doorgaan naar beveiligde kaartbetaling'];
  for (const phrase of required) assert.ok(source.includes(phrase), `missing Dutch success copy: ${phrase}`);
  assert.match(source, /nl:\{paid:'Je kaartbetaling is bevestigd door de betalingsprovider\.'/);
  assert.match(source, /providerCopy\[locale\]/);
});

test('account and shared header include Dutch role, navigation and announcement text', () => {
  const account = read('views/account.ejs');
  const header = read('views/partials/header.ejs');
  for (const phrase of ['Welkom terug.','Je Manager-account heeft volledige toegang','Je Admin-account heeft beperkte','Je gegevens','Je bestellingen','Nog geen bestellingen.']) assert.ok(account.includes(phrase), `missing Dutch account copy: ${phrase}`);
  for (const phrase of ['Contant of met kaart betalen','Contant betalen bij levering','Duidelijke prijzen']) assert.ok(header.includes(phrase), `missing Dutch header copy: ${phrase}`);
});

test('high-importance order and account runtime phrases do not fall back to English', () => {
  const i18n = dutchRuntime();
  const phrases = [
    'Order cancelled','The order will not be delivered.','Track your order','Order received',
    'Store is preparing it','Delivery is on the way','Order completed','ORDER CONTENTS',
    'Items subtotal','Automatic product discounts','Coupon discount','Delivery fee','Tax added',
    'Delivery details','Delivery address','Cash on delivery','Payment method recorded on the original order',
    'Order note','Need to cancel?','You may cancel while the store is still reviewing the order.',
    'Cancel this order?','Reason (optional)','I no longer need this item.','Cancel order',
    'Request cancellation','Your cancellation request is waiting for the store\'s decision.',
    'The store has accepted the order. You can still send a cancellation request for review.',
    'Delivery in progress','Your order is already out for delivery. Contact the store using the contact details on its policy page.',
    'Shipping & returns','Need a return?','Order closed','This order is no longer editable.',
    'Order status history','Every recorded status change appears here, including cancellation.',
    'No return or refund requests have been made for this order.','Choose an item','Damaged item',
    'Wrong item received','Not as described','Changed my mind','Additional details (optional)',
    'Return requests become available when the store marks the order delivered.'
  ];
  const untranslated = phrases.filter(phrase => i18n.translate(phrase) === phrase && phrase !== 'Status');
  assert.deepEqual(untranslated, []);
  assert.equal(i18n.translate('Country A\nCountry B'), 'Land A\nLand B');
});

test('Dutch cart and checkout disclose stock, coupon, tax and delivery outcomes', () => {
  const cart = read('views/cart.ejs');
  const checkout = read('views/checkout.ejs');
  const product = read('views/product.ejs');
  for (const phrase of [
    'Deze productoptie is niet meer beschikbaar.', 'De voorraad is gewijzigd voordat we je winkelmandje konden bijwerken.',
    'Kortingscode niet toegepast.', 'Je bestelling voldoet niet aan het minimale bestelbedrag voor deze code.',
    'Je vorige kortingscode voldoet niet meer aan het minimale bestelbedrag', 'per stuk na '
  ]) assert.ok(cart.includes(phrase), `missing Dutch cart text: ${phrase}`);
  for (const phrase of [
    'Het door de winkel ingestelde belastingtarief van ', 'De belasting wordt bij het totaal van de bestelling opgeteld.',
    'De winkel heeft belastingregels ingesteld.', 'Dit is de instelling van de winkel en geen bevestiging van wettelijke naleving.'
  ]) assert.ok(checkout.includes(phrase), `missing Dutch checkout tax text: ${phrase}`);
  for (const phrase of [
    'De bezorgkosten voor jouw locatie zijn momenteel niet beschikbaar.',
    'Berekend voor jouw bezorgadres en getoond voordat je de bestelling bevestigt.',
    'Deze winkel heeft momenteel gratis bezorging ingesteld.'
  ]) assert.ok(product.includes(phrase), `missing Dutch product delivery text: ${phrase}`);
});

test('Dutch Manager copy explains product pricing, refunds and provider reconciliation', () => {
  const productForm = read('views/admin/product-form.ejs');
  const returns = read('views/admin/returns.ejs');
  const cash = read('views/admin/order-cash.ejs');
  const order = read('views/admin/order.ejs');
  assert.match(productForm, /Voer de normale prijs van één artikel in vóór kortingen/);
  assert.match(productForm, /Inkoopprijs voor één artikel in/);
  assert.match(productForm, /De historische inkoopprijs wordt bij de bestelling bewaard/);
  assert.match(returns, /Terugbetaling geregistreerd/);
  assert.match(returns, /Controleer de daadwerkelijke overschrijving afzonderlijk/);
  assert.match(returns, /'Vervangend artikel verzonden'/);
  assert.match(cash, /Beslis vóór verzending/);
  assert.match(cash, /Het vorige annuleringsverzoek is afgewezen op/);
  assert.match(order, /Mollie meldt momenteel/);
});
