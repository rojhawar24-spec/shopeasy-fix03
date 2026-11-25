import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseCartProductId, parseCartVariantId, parseCartQuantity } from '../src/cart-form-inputs.js';

const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const handlerSource = server.slice(server.indexOf("app.post('/wishlist/toggle'"), server.indexOf("app.get('/cart'", server.indexOf("app.post('/wishlist/toggle'")));

function makeHarness(body, sessionCart = []) {
  const record = { queries: [], saves: [], redirects: [], json: [], errors: [] };
  const routes = new Map();
  const product = { id: 7, slug: 'test-item', name: 'Test Item', active: 1, available_stock: 10 };
  const globals = {
    app: { post: (path, ...handlers) => routes.set(path, handlers.at(-1)) },
    cartLimiter: () => {}, requireAuth: () => {},
    parseCartProductId, parseCartVariantId, parseCartQuantity,
    cleanText: value => String(value ?? '').trim(),
    getProductById: async id => { record.queries.push(id); return id === 7 ? product : null; },
    listProductVariants: async () => [],
    saveSessionCart: async (_session, cart) => record.saves.push(structuredClone(cart)),
    mutateSessionCart: async (_session, mutation) => {
      const cart=mutation(structuredClone(sessionCart));
      if(JSON.stringify(cart)!==JSON.stringify(sessionCart))record.saves.push(structuredClone(cart));
      return {cart,cart_revision:1,changed:true};
    },
    toggleWishlist: async (_session,id) => { record.queries.push(id); return {wishlist:id===7?[7]:[],saved:id===7,count:id===7?1:0,changed:id===7,...(id===7?{}:{reason:'product-unavailable'})}; },
    cartAddReturnPath: (_req, slug) => `/product/${slug}?added=1`,
    localRedirect: (_req, res, path) => res.redirect(303, path),
  };
  vm.runInNewContext(handlerSource, globals, { filename: 'src/server.js', timeout: 1000 });
  const req = { body, session: { cart: structuredClone(sessionCart), wishlist: [] }, sessionId: 'safe-session' };
  const res = {
    locals: { featureWishlistEnabled: true },
    redirect: (code, url) => { record.redirects.push([code,url]); return res; },
    status: code => { record.status = code; return res; },
    render: (name, data) => { record.errors.push([name, data]); return res; },
    json: value => { record.json.push(value); return res; },
  };
  return { record, req, res, routes, invoke: path => routes.get(path)(req,res) };
}

test('R20 executable cart-add rejects forged array IDs before any database access', async () => {
  for (const bad of [['7'], '7e0', {}, '0x7']) {
    const h=makeHarness({productId:bad,quantity:'1'});
    await h.invoke('/cart/add');
    assert.equal(h.record.queries.length,0);
    assert.deepEqual(h.record.redirects,[ [303,'/shop?cartError=unavailable'] ]);
    assert.equal(h.record.saves.length,0);
  }
});

test('R20 executable cart-add preserves ordinary customer purchase and quantity feedback', async () => {
  const h=makeHarness({productId:'7',quantity:'2',variantId:''});
  await h.invoke('/cart/add');
  assert.deepEqual(JSON.parse(JSON.stringify(h.req.session.cart)),[{productId:7,quantity:2}]);
  assert.deepEqual(h.record.saves,[[{productId:7,quantity:2}]]);
  assert.deepEqual(h.record.redirects,[[303,'/product/test-item?added=1']]);
  const huge=makeHarness({productId:'7',quantity:'100'});
  await huge.invoke('/cart/add');
  assert.deepEqual(huge.record.redirects,[[303,'/product/test-item?cartError=quantity']]);
  assert.equal(huge.record.saves.length,0);
});

test('R20 executable cart-add cannot turn an array variant into a real option', async () => {
  const h=makeHarness({productId:'7',quantity:'1',variantId:['1']});
  await h.invoke('/cart/add');
  assert.equal(h.record.queries.length,0);
  assert.deepEqual(h.record.redirects,[[303,'/shop?cartError=unavailable']]);
});

test('R20 executable cart-update retains zero-to-remove flow and refuses excessive quantities', async () => {
  const cart=[{productId:7,quantity:3}];
  const over=makeHarness({productId:'7',quantity:'100'},cart);
  await over.invoke('/cart/update');
  assert.deepEqual(over.record.redirects,[[303,'/cart?cartError=quantity']]);
  assert.equal(over.record.saves.length,0);
  const remove=makeHarness({productId:'7',quantity:'0'},cart);
  await remove.invoke('/cart/update');
  assert.deepEqual(remove.req.session.cart,[]);
  assert.deepEqual(remove.record.saves,[[]]);
  assert.deepEqual(remove.record.redirects,[[303,'/cart']]);
});

test('R20 executable cart-remove ignores malformed IDs instead of deleting products', async () => {
  const h=makeHarness({productId:['7'],variantId:''},[{productId:7,quantity:3}]);
  await h.invoke('/cart/remove');
  assert.equal(h.record.saves.length,0);
  assert.equal(h.req.session.cart.length,1);
});

test('R20 executable wishlist rejects invalid IDs before DB and accepts normal IDs', async () => {
  const bad=makeHarness({productId:['7']});
  await bad.invoke('/wishlist/toggle');
  assert.equal(bad.record.queries.length,0);
  assert.equal(bad.record.status,404);
  const okay=makeHarness({productId:'7'});
  await okay.invoke('/wishlist/toggle');
  assert.deepEqual(okay.req.session.wishlist,[7]);
  assert.equal(okay.record.json[0].saved,true);
});
