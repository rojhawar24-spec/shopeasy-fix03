import test from 'node:test';
import assert from 'node:assert/strict';
import {generateGiftCardCode,giftCardHash,giftCardCanCover,validGiftCardCode} from '../src/gift-cards.js';
import {normalizeBundleRules,calculateBundleDiscount} from '../src/bundle-promotions.js';
import {validatePeppolInvoiceForm,requestRecommand,peppolPayloadHash} from '../src/services/peppol-recommand.js';

const validForm={invoiceNumber:'INV-2026-001', issueDate:'2026-11-01',dueDate:'2026-12-01',recipient:'0208:0123456848',buyerVatNumber:'BE0123456848',buyerName:'Atelier Test',buyerStreet:'Rue 1',buyerCity:'Brussels',buyerPostalZone:'1000',itemName:'Consulting',quantity:'2.00',netPriceAmount:'100.00',vatRate:'21',iban:'BE68539007547034'};

test('random gift code is long and never a repeat',()=>{
 const codes=new Set(Array.from({length:300},generateGiftCardCode));
 assert.equal(codes.size,300);
 for(const c of codes){assert.equal(validGiftCardCode(c),true);assert.match(giftCardHash(c),/^[a-f\d]{64}$/);assert.equal(giftCardHash(c),giftCardHash(c.toLowerCase()));assert.notEqual(giftCardHash(c),c);}
});
test('gift card requires exact matching currency and sufficient full balance',()=>{
 const card={active:1,currency:'EUR',balance_cents:5000,expires_at:null};
 assert.equal(giftCardCanCover(card,{amount:5000,currency:'EUR'}),true);
 for(const value of [0,-1,5001,Infinity,NaN,0.2]) assert.equal(giftCardCanCover(card,{amount:value,currency:'EUR'}),false);
 assert.equal(giftCardCanCover(card,{amount:1000,currency:'USD'}),false);
 assert.equal(giftCardCanCover({...card,active:0},{amount:1000,currency:'EUR'}),false);
 assert.equal(giftCardCanCover({...card,expires_at:'2020-01-01T00:00:00Z'},{amount:1000,currency:'EUR'}),false);
});
test('invalid and overlapping bundle rules fail closed',()=>{
 const valid=normalizeBundleRules([{productIds:[12,34],discountPercent:20},{productIds:[12,56],discountPercent:40},{productIds:[12,12],discountPercent:50},{productIds:[78,90],discountPercent:51}]);
 assert.deepEqual(valid,[{productIds:[12,34],discountPercent:20}]);
 assert.deepEqual(normalizeBundleRules('invalid-json'),[]);
 assert.deepEqual(normalizeBundleRules({}),[]);
});
test('discounts are in integer minor units, quantity-aware and limited',()=>{
 const rules=[{productIds:[1,2],discountPercent:20}];
 assert.equal(calculateBundleDiscount([{productId:1,price:2000,quantity:3},{productId:2,price:1000,quantity:2}],rules).discountCents,400);
 assert.equal(calculateBundleDiscount([{productId:1,price:2000,quantity:1},{productId:2,price:1000,quantity:3}],rules).discountCents,200);
 assert.equal(calculateBundleDiscount([{productId:1,price:0,quantity:1},{productId:2,price:1000,quantity:1}],rules).discountCents,0);
 assert.equal(calculateBundleDiscount([{productId:1,price:2000,quantity:1}],rules).discountCents,0);
 assert.throws(()=>calculateBundleDiscount([{productId:1,price:1.3,quantity:1}],rules),/INVALID_BUNDLE/);
});
test('Peppol API JSON form validates identity, date and amounts',()=>{
 const payload=validatePeppolInvoiceForm(validForm);
 assert.equal(payload.recipient,'0208:0123456848');
 assert.equal(payload.document.lines[0].vat.percentage,'21.00');
 assert.match(peppolPayloadHash(payload),/^[0-9a-f]{64}$/);
 for(const [field,value] of [['recipient','https://evil.example'],['buyerVatNumber','BE0123456849'],['invoiceNumber','INV-$'],['issueDate','2026-02-30'],['dueDate','2026-10-01'],['vatRate','100'],['quantity','-1'],['netPriceAmount','1e9'],['iban','bad'],['buyerPostalZone','00000']]){
  assert.throws(()=>validatePeppolInvoiceForm({...validForm,[field]:value}),undefined,`${field} must be rejected`);
 }
});
test('Peppol adapter uses pinned HTTPS host and basic authentication; supports dry-run',async()=>{
 let calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify({success:true,deliveryStatus:'delivered',documentId:'doc-42'})};};
 const creds={companyId:'comp_1000',key:'key_test',secret:'secret_test123',payload:validatePeppolInvoiceForm(validForm),fetchImpl};
 const preview=await requestRecommand(creds);
 assert.equal(preview.ok,true);
 assert.equal(calls[0].url,'https://app.recommand.eu/api/v1/comp_1000/generate');
 assert.equal(calls[0].options.method,'POST');
 assert.match(calls[0].options.headers.Authorization,/^Basic /);
 assert.equal(JSON.parse(calls[0].options.body).documentType,'invoice');
 const submitted=await requestRecommand({...creds,send:true});
 assert.equal(submitted.reference,'doc-42');
 assert.equal(calls[1].url,'https://app.recommand.eu/api/v1/comp_1000/send');
});
test('Peppol non-success and unauthorized responses are not reported as accepted',async()=>{
 const cfg={companyId:'comp_1000',key:'key_test',secret:'secret_test123',payload:validatePeppolInvoiceForm(validForm)};
 const r=await requestRecommand({...cfg,send:true,fetchImpl:async()=>({ok:false,status:422,text:async()=>JSON.stringify({success:false,errors:{invoice:'invalid'}})})});
 assert.equal(r.ok,false);
 await assert.rejects(requestRecommand({...cfg,companyId:'../../evil',fetchImpl:async()=>{throw Error('must not call')} }),/PEPPOL_CREDENTIALS/);
 await assert.rejects(requestRecommand({...cfg,fetchImpl:async()=>({ok:true,status:200,text:async()=>'<html>ok</html>'})}),/PEPPOL_INVALID_RESPONSE/);
});


test('Peppol submissions require explicit approval even for a self-declared playground', async () => {
  const source=(await import('node:fs')).readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(source,/process\.env\.PEPPOL_SEND_APPROVED!=='1'/);
  assert.match(source,/process\.env\.PEPPOL_PRODUCTION_SEND_APPROVED!=='1'/);
  const env=(await import('node:fs')).readFileSync(new URL('../.env.example',import.meta.url),'utf8');
  assert.match(env,/PEPPOL_SEND_APPROVED=0/);
  assert.match(env,/PEPPOL_PRODUCTION_SEND_APPROVED=0/);
});
