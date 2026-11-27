import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ACTIVE=['app.css','design-tokens.css','retail-2027.css','editorial-2027.css','research-polish-2027.css'];

// The old "one CSS file" contract was superseded by the 2027 layered design.
// Verify each referenced static asset exists, is unique, and preserves cascade order.
export function assertRuntimeStyles() {
  const header=read('views/partials/header.ejs');
  const preview=read('PREVIEW.html');
  const manager=read('PREVIEW-MANAGER.html');
  const runtime=[...header.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(runtime.length,3,'two compiled static assets and one dynamic theme preserve the five-source cascade');
  assert.equal(new Set(runtime).size,runtime.length,'no duplicate stylesheet URLs');
  const manifest=JSON.parse(read('generated/design-css-manifest.json'));
  const expectedSources=ACTIVE.map(name=>`public/css/${name}`);
  assert.deepEqual(manifest.bundles.flatMap(bundle=>bundle.sources.map(source=>source.path)),expectedSources,'all five readable sources must remain in original cascade order');
  for(const filename of ACTIVE)assert.ok(fs.statSync(path.join(root,'public/css',filename)).size>250,`${filename} source must be retained`);
  const expected=['/css/design-foundation.min.css','/theme/shop.css','/css/design-polish.min.css'];
  assert.deepEqual(runtime.map(url=>url.split('?')[0]),expected,'the dynamic Manager theme must remain between foundation and polish');
  for(const filename of ['design-foundation.min.css','design-polish.min.css']){
    assert.ok(fs.statSync(path.join(root,'public/css',filename)).size>250,'compiled styles must exist');
    for(const [label,html]of[['storefront preview',preview],['Manager preview',manager]])assert.ok(html.includes(`./public/css/${filename}?v=`),`${label} must include current compiled CSS`);
  }
  assert.match(header,/data-design-version="research-2027"/);
  assert.match(header,/shopeasy-design-version" content="editorial-2027"/);
  assert.doesNotMatch(header,/design-v(?:10|15|17)\.css|style\.css/);
  return {header,preview,manager};
}

export function assertSharedAppCacheVersion() {
  const {header,preview,manager}=assertRuntimeStyles();
  const get=(str,prefix)=>str.split(`${prefix}design-foundation.min.css?v=`)[1]?.split('"')[0];
  const runtimeRaw=get(header,'/css/');
  // The server adds a commit-specific suffix; standalone HTML has no runtime commit.
  const runtime=runtimeRaw?.replace("<%= typeof assetRevision === 'string' ? assetRevision : '' %>",'');
  assert.ok(runtimeRaw===runtime||runtimeRaw===runtime+"<%= typeof assetRevision === 'string' ? assetRevision : '' %>",'runtime cache suffix must use the validated asset revision');
  const storefront=get(preview,'./public/css/');
  const managerCache=get(manager,'./public/css/');
  assert.ok(runtime && runtime.length>5,'runtime must use a nonempty version token');
  assert.equal(storefront,runtime,'storefront preview must use the same current app.css cache key');
  assert.equal(managerCache,runtime,'Manager preview must use the same current app.css cache key');
}

export function assertLocaleScripts() {
  const footer=read('views/partials/footer.ejs');
  for(const locale of ['ar','ckb','nl','fr','kmr']) {
    assert.ok(footer.includes(`i18n-${locale}.js?v=`),`${locale} translation runtime must be cache-busted`);
    assert.ok(fs.statSync(path.join(root,'public/js',`i18n-${locale}.js`)).size>100,`${locale} translation runtime must exist`);
  }
  assert.match(footer,/image-fallback\.js\?v=/);
  assert.match(footer,/retail-2027\.js\?v=/);
}

export function assertCurrentDesignAccessibility() {
  const css=ACTIVE.map(name=>read(`public/css/${name}`)).join('\n');
  assert.match(css,/:focus-visible/,'keyboard users need a visible focus style');
  assert.match(css,/prefers-reduced-motion/,'animations must respect reduced motion');
  assert.match(css,/html\[dir=["']rtl["']\]|:dir\(rtl\)/,'RTL must have explicit layout rules');
  assert.match(css,/@media[^{}]*max-width/,'narrow layouts must be supported');
  assert.match(read('views/partials/header.ejs'),/data-theme-toggle/,'theme toggle must remain wired');
}

export function assertOrderFlowCopy(){
  const checkout=read('views/checkout.ejs');const cart=read('views/cart.ejs');const product=read('views/product.ejs');
  assert.match(checkout,/action="\/checkout"/,'checkout POST destination must exist');
  assert.match(checkout,/name="_csrf"/,'checkout form must retain CSRF token');
  assert.match(checkout,/data-submit-once/,'checkout submit must block accidental double click');
  assert.match(cart,/Order summary/,'cart must show a clear order summary');
  assert.match(cart,/formatPrice/,'cart amounts must be server-rendered');
  assert.match(product,/shipping-returns/,'product page needs delivery/returns information');
  assert.doesNotMatch(checkout,/Internal Server Error|SQLITE_BUSY|stack trace/i);
  assert.doesNotMatch(cart,/Internal Server Error|SQLITE_BUSY|stack trace/i);
}
