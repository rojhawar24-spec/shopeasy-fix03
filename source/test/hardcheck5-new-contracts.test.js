import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('public legal pages exist, disclose real stored merchant fields and never invent VAT numbers', () => {
  const server=read('src/server.js');
  const footer=read('views/partials/footer.ejs');
  const imprint=read('views/imprint.ejs');
  const withdrawal=read('views/withdrawal-form.ejs');
  assert.match(server,/app\.get\('\/imprint'/);
  assert.match(server,/app\.get\('\/withdrawal-form'/);
  assert.match(server,/res\.locals\.vatNumber=vatNumber/);
  assert.match(footer,/\<% if\(vatNumber\)/);
  assert.match(imprint,/\<% if\(enterpriseNumber\)/);
  assert.match(imprint,/\<% if\(vatNumber\)/);
  assert.match(imprint,/\<%= vatNumber %>/);
  assert.match(withdrawal,/14-day withdrawal period/);
  assert.doesNotMatch(footer,/licenseInfo\?\.licensorName\}\>©/);
});

test('optional features have explicit manager fields, separate DB flags and disabled-route protection', () => {
  const server=read('src/server.js');
  const settings=read('views/admin/settings.ejs');
  for(const feature of ['Stories','Wishlist','Autocomplete']) {
    assert.match(settings,new RegExp(`name="feature${feature}Enabled"`));
    assert.match(server,new RegExp(`feature${feature}Enabled`));
  }
  assert.match(settings,/name="optionalFeaturesSubmitted" value="1"/);
  assert.match(server,/body\.optionalFeaturesSubmitted==='1'/);
  assert.match(server,/feature_stories_enabled:'?\w/);
  assert.match(server,/feature_wishlist_enabled:'?\w/);
  assert.match(server,/feature_autocomplete_enabled:'?\w/);
  assert.match(server,/if\(!res\.locals\.featureStoriesEnabled\)return res\.status\(404\)/);
  assert.match(server,/if\(!res\.locals\.featureWishlistEnabled\)return res\.status\(404\)/);
  assert.match(server,/if\(!res\.locals\.featureAutocompleteEnabled\)return res\.status\(404\)/);
});

test('disabling wishlist does not remove authenticated Account navigation or core catalogue search', () => {
  const header=read('views/partials/header.ejs');
  const footer=read('views/partials/footer.ejs');
  assert.match(header,/if \(isLoggedIn\) \{ %><% if\(featureWishlistEnabled\)/);
  assert.match(header,/<a href="\/account"><%= locale==='fr'\?'Compte':'Account' %><\/a><% \} else \{ %><a href="\/login"><%= locale==='fr'\?'Se connecter':'Sign in' %>/);
  assert.match(header, /<%= locale==='fr'\?'Favoris':'Saved' %>/);
  assert.match(footer,/<a href="\/order-lookup" class="<%= path\.startsWith/);
  assert.match(header,/form class="search" action="\/shop"/);
});

test('CI runs npm ci, audit, syntax, build and full tests on pinned Node 24', () => {
  const ci=read('.github/workflows/ci.yml');
  for (const text of ["node-version: '24.22.2'",'npm ci --no-fund','npm audit --omit=dev --audit-level=high','npm run check','npm run audit:static','npm run build:cloudflare','npm test']) {
    assert.ok(ci.includes(text),`missing CI step: ${text}`);
  }
});
