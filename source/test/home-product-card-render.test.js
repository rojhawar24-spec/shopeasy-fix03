import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import { pageText } from '../src/home-login-copy.js';

const template = fs.readFileSync(new URL('../views/partials/product-card.ejs', import.meta.url), 'utf8');
function renderCard(locale, overrides = {}) {
  return ejs.render(template, {
    p: { id:1, name:'Featured', slug:'fixture', image_url:'/assets/product-placeholder.svg',
      price_cents:1999, available_stock:3, variant_count:1, featured:1,
      category_name:'Roj’s collection', ...overrides },
    app:{ locals:{ discountPercent:()=>0, effectivePrice:product=>product.price_cents } },
    safeImageUrl:url=>url, formatPrice:value=>(value/100).toFixed(2), currency:'EUR',
    appearance:{ quickView:true, compare:true }, isLoggedIn:true,
    featureWishlistEnabled:true, wishlistIds:new Set(),
    pageText:(value, parameters)=>pageText(locale,value,parameters)
  });
}

test('populated Home card has translated actions and stock before scripts run while retaining the product name', () => {
  const html=renderCard('fr');
  assert.match(html, /Aperçu rapide/);
  assert.match(html, /Plus que 3 disponibles/);
  assert.match(html, /1 option/);
  assert.match(html, /En stock/);
  assert.match(html, /Choisir les options/);
  const action=html.match(/<a class="btn btn-dark btn-small product-main-cta"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(action,'the product action must remain a real link');
  assert.match(action[1],/Choisir les options/);
  assert.match(action[1],/<span data-no-translate>Featured<\/span>/);
  assert.doesNotMatch(action[0],/aria-label=/,'native action text and product context must not be replaced by a mismatched label');
  assert.match(html, /<h3 data-no-translate><a[^>]*>Featured<\/a>/);
});

test('unavailable product retains the view action and never advertises a purchasable option', () => {
  const html=renderCard('nl',{available_stock:0});
  assert.match(html, /Uitverkocht/);
  assert.match(html, /Niet beschikbaar/);
  assert.match(html, /Bekijk product/);
  assert.doesNotMatch(html, /Nog maar|Opties kiezen/);
});

test('seller text is escaped in translated accessible labels and visible product content', () => {
  const name='Roj <img src=x onerror=alert(1)> {count} $&';
  const html=renderCard('fr',{name});
  assert.match(html,/aria-label="[^"]*Roj &lt;img/);
  assert.ok(html.includes('<span data-no-translate>Roj &lt;img'));
  assert.ok(html.includes('{count} $&amp;'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('{name}'));
});
