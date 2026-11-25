import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

test('French final checkout button explicitly states the payment obligation',()=>{
  const view=read('views/checkout.ejs');
  assert.match(view, /locale==='fr'\?'Commande avec obligation de paiement'/);
  assert.match(view, /name="_csrf"/);
  assert.match(view, /name="idempotencyKey"/);
  assert.match(view, /action="\/checkout"/);
});
test('Mollie classic webhook re-reads provider payment, not client-supplied payment status',()=>{
  const server=read('src/server.js');
  const route=server.slice(server.indexOf("app.post('/payments/mollie/webhook'"),server.indexOf("app.get('/checkout'",server.indexOf("app.post('/payments/mollie/webhook'")));
  assert.match(route,/getMolliePayment\(paymentId/);
  assert.match(route,/validateMolliePaymentForOrder\(/);
  assert.doesNotMatch(route,/req\.body\.(?:status|amount|currency)/);
  assert.match(read('src/services/payment-providers.js'), /fr:'fr_BE'/);
});
test('NL and FR cookie consent choices have equal-weight buttons and localized labels',()=>{
  const footer=read('views/partials/footer.ejs');
  assert.match(footer,/class="btn btn-light" data-cookie-reject/);
  assert.match(footer,/class="btn btn-light" data-cookie-accept/);
  for(const label of ['Alles weigeren','Alles accepteren','Tout refuser','Tout accepter','Enregistrer mes choix'])assert.ok(footer.includes(label),`Missing consent copy: ${label}`);
  assert.match(footer,/id="cookie-analytics" data-cookie-analytics>/);
  assert.match(footer,/id="cookie-marketing" data-cookie-marketing>/);
});
test('Every literal static assets/css/js URL in templates and styles resolves in public',()=>{
  const files=[];
  const walk=d=>{for(const item of fs.readdirSync(path.join(root,d),{withFileTypes:true})){
    const relative=path.join(d,item.name);
    if(item.isDirectory())walk(relative);
    else if(/\.(?:ejs|css|js)$/.test(item.name))files.push(relative);
  }};
  walk('views');walk('public');
  const missing=[];
  for(const file of files){
    const content=read(file);
    for(const match of content.matchAll(/["'](\/(?:assets|css|js)\/[\w./-]+)["']/g)){
      if(!fs.existsSync(path.join(root,'public',match[1])))missing.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing,[]);
});
test('Navigation back control uses safe explicit same-origin URLs, never history.back',()=>{
  const back=read('views/partials/back-button.ejs');
  assert.match(back, /backDestination/);
  assert.match(back, /\/\^\\\/\(\?!\\\/\)/);
  assert.doesNotMatch(back,/history\.back\(/);
  assert.match(read('views/cart.ejs'),/fallback: '\/shop'/);
  assert.match(read('views/checkout.ejs'),/fallback: '\/cart'/);
});
