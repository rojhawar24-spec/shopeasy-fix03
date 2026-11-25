import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../',import.meta.url);
const read = file => fs.readFileSync(new URL(file,root),'utf8');
test('Manager can disable recommendations without modifying inventory or orders',()=>{
 const server=read('src/server.js'),settings=read('views/admin/settings.ejs'),product=read('views/product.ejs');
 assert.match(settings,/name="featureRelatedProductsEnabled"/);
 assert.match(server,/feature_related_products_enabled:body\.featureRelatedProductsEnabled==='on'\?'1':'0'/);
 assert.match(server,/res\.locals\.featureRelatedProductsEnabled=featureRelatedProductsSetting!=='0'/);
 assert.match(product,/if\(featureRelatedProductsEnabled&&Array\.isArray\(relatedProducts\)/);
 assert.match(server,/res\.locals\.featureRelatedProductsEnabled\?listProducts\(/);
});
