import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ejs from 'ejs';
import { customerText } from '../src/customer-page-copy.js';

function render(view, data={}, locale='en') {
  const source=fs.readFileSync(new URL(`../views/${view}.ejs`,import.meta.url),'utf8');
  return ejs.render(source, {
    include:()=>'', locale, customerText:(value,parameters)=>customerText(locale,value,parameters),
    csrf:'test-form-token', storeTimeZone:'UTC',
    formatDateTimeDisplay:value=>value, formatRelativeTime:()=>'',
    formatPrice:value=>String(value), safeImageUrl:value=>value, ...data
  });
}

test('password recovery preserves checkout intent in Back navigation and both submitted forms',()=>{
  const next='/checkout?from=bag&step=payment';
  let backTarget;
  const html=render('forgot-password',{
    next,sent:true,error:null,email:'customer@example.test',
    include:(view,parameters)=>{if(view==='partials/back-button')backTarget=parameters.fallback;return '';}
  });
  assert.equal(backTarget,`/login?next=${encodeURIComponent(next)}`);
  assert.equal((html.match(/name="next" value="\/checkout\?from=bag&amp;step=payment"/g)||[]).length,2);
  assert.equal((html.match(/name="_csrf" value="test-form-token"/g)||[]).length,2);
  assert.match(html,/autocomplete="one-time-code"/);
});

test('account panels have balanced div containers for customer and manager variants',()=>{
  for(const role of ['customer','manager']) {
    const html=render('account',{user:{email:'person@example.test',role},total:0,orders:[],hasPrev:false,hasNext:false});
    assert.equal((html.match(/<div(?:\s|>)/g)||[]).length,(html.match(/<\/div>/g)||[]).length);
  }
});

test('password change success is announced as a localized status without exposing password values',()=>{
  const html=render('account-security',{changed:true,error:null},'ckb');
  assert.match(html,/class="alert success-alert" role="status">/);
  assert.ok(!html.includes('Password changed. Other active sessions were signed out.'));
  assert.equal((html.match(/type="password"/g)||[]).length,3);
  assert.ok(!/<input[^>]+type="password"[^>]+value=/i.test(html));
});

test('paid gift-card order remains open for fulfilment and has truthful first-stage guidance',()=>{
  const html=render('order',{
    order:{id:7,status:'paid',created_at:'2026-11-10',items:[],shipping_name:'Customer',shipping_cents:0,total_cents:1200,currency:'EUR',payment_provider:'gift_card'},
    cancelResult:'',orderHistory:[],returns:[]
  });
  assert.match(html,/Payment received; awaiting store confirmation\./);
  assert.match(html,/Gift card/);
  assert.ok(!html.includes('Order closed'));
  assert.match(html,/class="timeline-step done current"/);
});

test('new paid-order guidance is translated on the server and seller content remains literal',()=>{
  const guidance='Payment received; awaiting store confirmation.';
  for(const locale of ['nl','fr','ar','ckb']) {
    assert.notEqual(customerText(locale,guidance),guidance);
    assert.notEqual(customerText(locale,'Gift card'),'Gift card');
    assert.equal(customerText(locale,'Roj’s {name} collection',{name:'replacement'}),'Roj’s {name} collection');
  }
});


test('merchant policy bodies are escaped and protected from browser interface translation',()=>{
  const body='Your password has been reset. Sign in with your new password. <script>unsafe()</script>';
  const html=render('policy',{title:'Privacy',heading:'Confidentialité',body,policyFallback:true},'fr');
  assert.match(html,/<article[\s\S]*?class="panel policy-copy"[\s\S]*?data-no-translate/);
  assert.ok(html.includes('Your password has been reset. Sign in with your new password.'));
  assert.ok(html.includes('&lt;script&gt;unsafe()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>unsafe()'));
  assert.ok(html.includes('affiché en anglais'));
});


test('French Contact and FAQ render complete native copy before scripts run',()=>{
  const contact=render('contact',{supportEmail:'help@example.test',businessPhone:'',businessAddress:''},'fr');
  assert.ok(contact.includes('Comment pouvons-nous vous aider ?'));
  assert.ok(contact.includes('codes de récupération par e-mail'));
  assert.ok(!contact.includes('How can we help?'));
  const faq=render('faq',{},'fr');
  assert.ok(faq.includes('Questions et réponses.'));
  assert.ok(faq.includes('Cette page ne déclenche jamais de paiement.'));
  assert.ok(faq.includes('Seul l’acheteur doit accéder aux détails de sa commande.'));
  assert.equal((faq.match(/<summary>/g)||[]).length,6);
  assert.ok(!faq.includes('Questions, answered.'));
});

test('return-history names retain their seller identity instead of becoming interface labels',()=>{
  const html=render('order',{
    order:{id:7,status:'paid',created_at:'2026-11-10',items:[],shipping_name:'Customer',shipping_cents:0,total_cents:1200,currency:'EUR',payment_provider:'gift_card'},
    cancelResult:'',orderHistory:[],returns:[{id:1,request_type:'refund',product_name:'Featured',variant_name:'Size',variant_value:'Large',quantity:1,status:'approved',updated_at:'2026-11-11'}]
  },'fr');
  assert.match(html,/<td data-no-translate>Featured<small/);
  assert.ok(!html.includes('À la une'));
});
