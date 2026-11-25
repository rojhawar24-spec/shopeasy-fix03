import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';

const iconTemplate = fs.readFileSync(new URL('../views/partials/ui-icon.ejs', import.meta.url), 'utf8');
const giftTemplate = fs.readFileSync(new URL('../views/admin/gift-cards.ejs', import.meta.url), 'utf8');
const base = {include: () => '', user: {role: 'manager'}, error: '', refunded: false, createdCode: '', csrf: 'test-only', enabled: true, formatPrice: value => String(value)};

test('decorative UI icons render no visible-text character or accessible-name override', () => {
  for (const iconName of ['menu', 'search', 'arrow', 'plus', 'minus', 'moon', 'sun']) {
    const markup = ejs.render(iconTemplate, {iconName});
    assert.match(markup, /<svg[^>]+aria-hidden="true"[^>]+focusable="false"/);
    assert.match(markup, /<path d="[^"]+"\/>/);
    assert.equal(markup.replace(/<[^>]+>/g, '').trim(), '', 'button labels remain with their visible text or semantic parent label');
    assert.doesNotMatch(markup, /aria-label=|<title>/);
  }
});

test('icon rendering rejects inherited/unknown names and escapes optional CSS classes', () => {
  for (const iconName of ['__proto__', 'constructor', 'toString', 'unknown']) {
    assert.throws(() => ejs.render(iconTemplate, {iconName}), /Unknown UI icon/);
  }
  const markup = ejs.render(iconTemplate, {iconName: 'search', iconClass: '" onload="unexpected'});
  assert.match(markup, /class="ui-icon &#34; onload=&#34;unexpected"/);
  assert.doesNotMatch(markup, /\s+onload="unexpected/);
});

test('empty gift-card listings have a localized state and populated listings retain scoped data headers', () => {
  for (const locale of ['en', 'nl', 'fr', 'ckb', 'ar']) {
    const empty = ejs.render(giftTemplate, {...base, locale, cards: []});
    assert.match(empty, /<p class="empty-state" role="status">[^<]+<\/p>/);
    assert.doesNotMatch(empty, /<table\b/);
    const populated = ejs.render(giftTemplate, {...base, locale, cards: [{id: 17, currency: 'GBP', original_amount_cents: 5000, balance_cents: 3500, active: true}]});
    assert.equal([...populated.matchAll(/<th scope="col">/g)].length, 5);
    assert.match(populated, /<caption class="sr-only">Cards · last 100<\/caption>/);
    assert.match(populated, /<td>17<\/td><td>GBP<\/td><td>5000<\/td><td>3500<\/td><td>Active<\/td>/);
  }
});
