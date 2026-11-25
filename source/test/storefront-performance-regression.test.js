import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('catalogue pagination reads one extra row in the same query',()=>{
 const s=read('src/server.js');
 for(const route of ["app.get('/category/:slug'","app.get('/shop',"]){
  const start=s.indexOf(route);const end=s.indexOf("app.get(",start+8);
  const code=s.slice(start,end);
  assert.match(code,/limit:pageSize\+1,offset/);
  assert.match(code,/pageRows\.slice\(0,pageSize\)/);
  assert.match(code,/hasNext=pageRows\.length>pageSize/);
  assert.equal((code.match(/listProducts\(/g)||[]).length,1);
  assert.equal((code.match(/listCategories\(/g)||[]).length,1);
 }
});
test('homepage and product data fetches overlap without caching private data',()=>{
 const s=read('src/server.js');
 assert.match(s,/featuredProducts,latestProducts,categories,heroSettings\]=await Promise\.all/);
 assert.match(s,/managerProduct,reviewData\]=await Promise\.all/);
 assert.match(s,/const \[reviews,reviewStats,canReview\]=reviewData/);
 assert.match(s,/private, no-store, max-age=0/);
});
test('constant transaction setup retains local search path and UTC',()=>{
 assert.ok(read('postgres/adapter.mjs').includes("SET LOCAL search_path = pg_catalog, shopeasy, extensions; SET LOCAL TIME ZONE 'UTC'"));
});
