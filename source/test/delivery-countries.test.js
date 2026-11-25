import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { matchDeliveryCountry, normalizeDeliveryCountries } from '../src/security.js';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('delivery country configuration normalizes spacing and removes case-insensitive duplicates', () => {
  assert.deepEqual(normalizeDeliveryCountries(' Iraq  \nBelgium\n iraq \nUnited Arab Emirates '), ['Iraq', 'Belgium', 'United Arab Emirates']);
});

test('delivery country configuration rejects malformed, generic, oversized and more than 250 entries', () => {
  assert.equal(normalizeDeliveryCountries('Other'), null);
  assert.equal(normalizeDeliveryCountries('Belgium\nBad\nX'), null);
  assert.equal(normalizeDeliveryCountries('B'.repeat(81)), null);
  const allMarkets = Array.from({length:250},(_,i)=>`Country ${String.fromCharCode(97+Math.floor(i/26))}${String.fromCharCode(97+(i%26))}`);
  assert.equal(normalizeDeliveryCountries(allMarkets.join('\n')).length, 250, 'up to 250 country entries should be accepted');
  assert.equal(normalizeDeliveryCountries([...allMarkets, 'Country zz-extra'].join('\n')), null, 'more than 250 country entries must be rejected');
  assert.deepEqual(normalizeDeliveryCountries('\n  \n'), []);
});

test('checkout matches configured country case-insensitively but rejects countries outside the allow-list', () => {
  const countries = ['Iraq', 'United Arab Emirates'];
  assert.equal(matchDeliveryCountry(' iraQ ', countries), 'Iraq');
  assert.equal(matchDeliveryCountry('United  Arab Emirates', countries), 'United Arab Emirates');
  assert.equal(matchDeliveryCountry('Belgium', countries), null);
  assert.equal(matchDeliveryCountry('//evil.example', countries), null);
});

test('launch readiness, manager settings and checkout all enforce the delivery-country configuration', () => {
  const server = read('../src/server.js');
  const settings = read('../views/admin/settings.ejs');
  const checkout = read('../views/checkout.ejs');
  assert.match(server, /deliveryCountriesConfigured/);
  assert.match(server, /sellableProductCount/);
  assert.match(server, /delivery_countries:effectiveDeliveryCountries\.join/);
  assert.match(server, /matchDeliveryCountry\(submittedCountry,launch\.deliveryCountries\)/);
  assert.match(server, /does not currently deliver to that country/);
  assert.match(settings, /name="deliveryCountries"/);
  assert.match(settings, /At least one delivery country/);
  assert.match(checkout, /name="shippingCountry" required autocomplete="country-name"/);
  assert.match(checkout, /countries listed by this store/);
});


test('manager country validation supports global shipping coverage and settings route saves other draft fields if the submitted list is malformed', () => {
  const server = read('../src/server.js');
  const settings = read('../views/admin/settings.ejs');
  const routeStart = server.indexOf("app.post('/admin/settings',requireManager,async(req,res)=>{");
  const routeEnd = server.indexOf("\n\napp.use((req,res)=>res.status(404).render('error'", routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.doesNotMatch(route, /shippingFeeValid&&\s*submittedShippingFee\.valid&&deliveryCountriesValid&&/, 'invalid country list alone must not block saving every other valid setting');
  assert.match(route, /const effectiveDeliveryCountries=deliveryCountriesValid\?normalizedDeliveryCountries:\(normalizeDeliveryCountries\(storedCountriesSetting\)\|\|\[\]\)/);
  assert.match(route, /deliveryCountriesWarning=1/);
  assert.match(settings, /Settings saved, delivery countries not changed/);
  assert.match(settings, /up to 250 valid country names, one per line/i);
});
