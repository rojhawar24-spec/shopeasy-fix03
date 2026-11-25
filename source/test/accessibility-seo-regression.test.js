import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

test('content images expose meaningful alt text and stable dimensions',()=>{
  for(const file of ['views/product.ejs','views/shop.ejs','views/home.ejs','views/wishlist.ejs','views/stories.ejs','views/cart.ejs','views/admin/stories.ejs','views/admin/products.ejs']){
    const html=read(file);
    const images=[];
    let searchFrom=0;
    while(true){
      const start=html.toLowerCase().indexOf('<img',searchFrom);
      if(start<0) break;
      let end=start+4;
      while(end<html.length){
        if(html[end]==='>' && html[end-1] !== '%'){ end++; break; }
        end++;
      }
      assert.ok(end<=html.length,`${file}: unterminated img tag`);
      images.push(html.slice(start,end));
      searchFrom=end;
    }
    for(const img of images){
      assert.match(img,/\balt\s*=\s*['"]/i,`${file}: image missing alt`);
      assert.match(img,/\bwidth\s*=\s*['"]/i,`${file}: image missing width`);
      assert.match(img,/\bheight\s*=\s*['"]/i,`${file}: image missing height`);
    }
  }
});

test('product JSON-LD uses the same validated canonical-base helper as the page URL',()=>{
  const server=read('src/server.js');
  assert.match(server,/const base=siteBase\(req\);/);
  assert.match(server,/function siteBase\(req\) \{[\s\S]*?return resolvePublicBaseUrl\(\{/);
  const startup = read('src/startup-config.js');
  assert.match(startup,/const protocolAllowed = requireHttps \? url\.protocol === 'https:'/);
  assert.match(startup,/requestHost/);
});


test('shop template defensively handles missing optional category locals', () => {
  const html = read('views/shop.ejs');
  assert.match(html, /const _categoryInfo = typeof categoryInfo !== 'undefined'/);
  assert.match(html, /const _categoryPath = typeof categoryPath !== 'undefined'/);
  assert.match(html, /const _childCategories = typeof childCategories !== 'undefined'/);
  assert.match(html, /if\(_categoryInfo && _categoryPath\.length>1\)/);
  assert.match(html, /if\(_categoryInfo && \(_categoryInfo\.image_url \|\| _childCategories\.length\)\)/);
  assert.doesNotMatch(html, /<%= categoryInfo\?\.name %>/);
});

test('shop route supplies explicit defaults through the central render helper', () => {
  const server = read('src/server.js');
  const start = server.indexOf('function render(res,view,data={})');
  const end = server.indexOf('\nfunction localRedirect', start);
  assert.ok(start >= 0 && end > start, 'central render helper should exist');
  const helper = server.slice(start, end);
  assert.match(helper, /categoryInfo:null/);
  assert.match(helper, /categoryPath:\[\]/);
  assert.match(helper, /childCategories:\[\]/);
  const shopStart = server.indexOf("app.get('/shop'");
  const apiStart = server.indexOf("app.get('/api/search'", shopStart);
  assert.ok(shopStart >= 0 && apiStart > shopStart, 'shop route should exist');
  const shopRoute = server.slice(shopStart, apiStart);
  assert.match(shopRoute, /categoryInfo:null/);
  assert.match(shopRoute, /childCategories:\[\]/);
  assert.match(shopRoute, /categoryPath:\[\]/);
});

test('central render helper preserves live request/session locals', () => {
  const server = read('src/server.js');
  const start = server.indexOf('function render(res,view,data={})');
  const end = server.indexOf('\nfunction localRedirect', start);
  assert.ok(start >= 0 && end > start, 'central render helper should exist');
  const source = server.slice(start, end);
  for (const forbidden of ["currency:'EUR'", "locale:'en'", "csrf:''", 'isLoggedIn:false', 'user:null', 'wishlistCount:0', 'cartCount:0']) {
    assert.equal(source.includes(forbidden), false, `render helper must not override ${forbidden}`);
  }
  assert.match(source, /\.\.res\.locals\s*\}/, 'live res.locals must have final precedence');
});
