import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('preview caching covers only fixed public CSS/JS assets, not private routes',()=>{
  const config=JSON.parse(read('vercel.json'));
  assert.ok(config.headers.length>=10);
  for(const entry of config.headers){
    assert.match(entry.source,/^\/(?:css|js)\/[a-z0-9.-]+\.(?:css|js)$/i);
    assert.ok(entry.headers.some(h=>h.key==='Cache-Control'&&h.value==='public, max-age=3600, must-revalidate'));
  }
  const server=read('src/server.js');
  assert.match(server,/private, no-store, max-age=0/);
  assert.match(server,/req\.query\.appearance===revision/);
  assert.match(server,/versioned\?'private, max-age=86400':'private, no-store'/);
  assert.ok(server.indexOf("if(isPostgresPreview) app.get('/theme/shop.css'")<server.indexOf('app.use(attachAuth)'));
});
test('preview cache busting and product editor script scoping are present',()=>{
  const header=read('views/partials/header.ejs'),footer=read('views/partials/footer.ejs');
  assert.match(header,/assetRevision/);
  assert.match(header,/themeRevision\(appearance\)/);
  assert.match(footer,/assetRevision/);
  assert.ok(footer.includes('(?:new|save|[0-9]+'));
  assert.ok(footer.includes('product-image-preview.js'));
});
