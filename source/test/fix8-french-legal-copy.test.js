import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('FIX8: French cookie-policy content exists rather than silently falling back to English', () => {
  const source = read('views/cookies.ejs');
  assert.match(source, /fr:\{description:'Informations sur les cookies/);
  for (const label of ['Politique des cookies','Cookies nécessaires','Préférence linguistique','Mesure d’audience et publicité','Modifier vos préférences']) assert.ok(source.includes(label));
});

test('FIX8: French legal-policy fallback is clearly explained in French', () => {
  const source = read('views/policy.ejs');
  assert.match(source, /locale==='fr'\?'Veuillez lire attentivement/);
  assert.match(source, /else if\(locale==='fr'\)/);
  assert.match(source, /traduction française vérifiée/);
});

test('FIX8: French order-payment banner translates cash/card and bank-transfer availability', () => {
  const source = read('views/partials/header.ejs');
  assert.match(source, /Paiement à la livraison ou par carte/);
  assert.match(source, /Virement bancaire/);
});


test('FIX8: French cookie route sets a French browser title', () => {
  assert.match(read('src/server.js'), /locale==='fr'\?'Politique des cookies'/);
});
