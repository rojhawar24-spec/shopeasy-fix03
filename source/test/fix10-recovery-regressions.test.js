import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildIndexableSeoLinks, indexedLocaleFromQuery, sitemapLocalePaths } from '../src/seo-locales.js';
import { normalizeBankTransferConfig, buildBankTransferSnapshot } from '../src/services/bank-transfer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(path.join(root,f),'utf8');

test('FIX10 French-only store is indexable, gets a canonical and a sitemap entry', () => {
  const paths=sitemapLocalePaths(['/','/shop','/product/café'],['fr'],'fr');
  assert.deepEqual(paths,['/','/shop','/product/café']);
  const seo=buildIndexableSeoLinks({baseUrl:'https://example.org/',pathname:'/shop',locale:'fr',enabledLocales:['fr'],defaultLocale:'fr'});
  assert.equal(seo.canonical,'https://example.org/shop');
  assert.deepEqual(seo.alternates,[{hreflang:'fr',href:'https://example.org/shop'},{hreflang:'x-default',href:'https://example.org/shop'}]);
  assert.equal(indexedLocaleFromQuery('fr',['fr'],'/shop'),'fr');
  assert.doesNotMatch(read('views/partials/header.ejs'),/locale\s*===?\s*['"]fr['"]\s*\|\|\s*isAdminRoute/);
  assert.doesNotMatch(read('views/partials/header.ejs'),/seoNoIndex[^\n]*\|\|\s*locale\s*===?\s*['"]fr['"]/);
});

test('FIX10 French stays correct for multilingual product canonicals, hreflang and pagination', () => {
  const seo=buildIndexableSeoLinks({baseUrl:'https://example.org/',pathname:'/shop',locale:'fr',enabledLocales:['nl','fr','en'],defaultLocale:'nl',pageNumber:3});
  assert.equal(seo.canonical,'https://example.org/shop?lang=fr&page=3');
  assert.deepEqual(seo.alternates.map(a=>a.hreflang), ['nl','fr','en','x-default']);
  assert.ok(seo.alternates.some(a=>a.href==='https://example.org/shop?lang=fr&page=3'));
  assert.deepEqual(sitemapLocalePaths(['/'],['nl','fr'],'nl'),['/','/?lang=fr']);
});

test('FIX10 never marks French noindex merely for being French', () => {
  const header=read('views/partials/header.ejs');
  assert.doesNotMatch(header,/\|\|\s*locale===['"]fr['"]\s*\|\|/);
  assert.match(header,/seoNoIndex/);
  assert.match(header,/privatePrefixes\.some/);
});

test('FIX10 rejects fake non-IBAN account identifiers while supporting plausible local accounts', () => {
  const base={enabled:true,bankName:'Example bank',accountHolder:'Example Ltd'};
  for(const bad of ['ABCDE','HELLOWORLD','ABC/XYZ','12345','1234567','abc123','BE00000000000000','BE68 5390 0754 7035']){
    const config=normalizeBankTransferConfig({...base,account:bad});
    assert.equal(config.ready,false,`bad account became ready: ${bad}`);
    assert.throws(()=>buildBankTransferSnapshot({...base,account:bad},123),/BANK_TRANSFER_NOT_CONFIGURED/);
  }
  assert.equal(normalizeBankTransferConfig({...base,account:'1234567890'}).ready,true);
  assert.equal(normalizeBankTransferConfig({...base,account:'BE68 5390 0754 7034'}).ready,true);
  assert.equal(normalizeBankTransferConfig({...base,account:'GB82 WEST 1234 5698 7654 32'}).ready,true);
});

test('FIX10 preview documents contain no dead relative links', async () => {
  for(const f of ['PREVIEW.html','PREVIEW-MANAGER.html','PREVIEW-SHOP-R6.html','PREVIEW-PRODUCT-R6.html','PREVIEW-CART-R7.html','PREVIEW-CHECKOUT-R7.html','PREVIEW-ORDER-R7.html']) {
    const html=read(f);
    for(const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){
      const href=match[1].split('?')[0].split('#')[0];
      if(!href || !href.startsWith('./'))continue;
      const full=path.resolve(root,href);
      assert.ok(full.startsWith(root+path.sep),`path escape in ${f}`);
      assert.doesNotThrow(()=>readFileSync(full),`${f} links missing ${href}`);
    }
  }
});

test('FIX10 French server-rendered AI notices do not silently default to English',()=>{
  assert.match(read('views/admin/settings.ejs'),/else if\(locale==='fr'\)/);
  assert.match(read('views/partials/header.ejs'),/locale==='fr'\?'Recherche assistée par IA/);
});

test('FIX10 rate limiter package and lockfile pin patched version with verified integrity',()=>{
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.dependencies['express-rate-limit'],'8.7.5');
  const entry=lock.packages['node_modules/express-rate-limit'];
  assert.equal(entry.version,'8.7.5');
  assert.equal(entry.integrity,'sha512-wi+v38cx2EqD0JnhE/e74o5tFqKWUOAPFJIgyEiqJ8v2MNpoOAA3kI2hXYOI+YM+HE5yqbdAlVxm2GqOIeYOgA==');
  assert.equal(lock.packages[''].dependencies['express-rate-limit'],'8.7.5');
});
