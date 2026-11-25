import test from 'node:test';
import assert from 'node:assert/strict';
import * as emailService from '../src/services/email.js';
import { emailEnabled, sendPasswordResetCodeEmail } from '../src/services/email.js';
import fs from 'node:fs';

function restore(name,value){ if(value===undefined) delete process.env[name]; else process.env[name]=value; }

test('email integration stays disabled until a key and valid sender are configured', () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM};
  try {
    delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    assert.equal(emailEnabled(),false);
    process.env.RESEND_API_KEY='re_test'; process.env.EMAIL_FROM='Shop <recovery@example.com>';
    assert.equal(emailEnabled(),true);
    process.env.EMAIL_FROM='Shop <not-an-email>';
    assert.equal(emailEnabled(),false);
  } finally { restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});


test('unconfigured Resend skips reset email without calling the provider', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM,fetch:global.fetch};
  try {
    delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    let calls=0;
    global.fetch=async()=>{calls+=1;throw new Error('provider must not be called');};
    const result=await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'012345'});
    assert.deepEqual(result,{sent:false,skipped:true});
    assert.equal(calls,0);
  } finally { global.fetch=prev.fetch; restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});

test('six-digit password recovery email validates the code, escapes store content and uses idempotent Resend delivery', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM,fetch:global.fetch};
  try {
    process.env.RESEND_API_KEY='re_test'; process.env.EMAIL_FROM='Shop <recovery@example.com>';
    let capturedUrl, captured;
    global.fetch=async(url,options)=>{capturedUrl=url;captured=options;return {ok:true,json:async()=>({id:'code_test_123'})};};
    const result=await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'012345',storeName:'Shop <svg onload=x>'});
    assert.equal(result.sent,true);
    assert.equal(capturedUrl,'https://api.resend.com/emails');
    assert.equal(captured.redirect,'error','Never forward bearer credentials along redirects');
    assert.match(captured.headers['Idempotency-Key'],/^password-reset-code-/);
    const body=JSON.parse(captured.body);
    assert.equal(body.to[0],'buyer@example.com');
    assert.match(body.html,/012345/);
    assert.doesNotMatch(body.html,/<svg onload=x>/);
    assert.match(body.html,/&lt;svg onload=x&gt;/);
    assert.match(body.text,/expires in 10 minutes/);
    let called=false;
    global.fetch=async()=>{called=true;throw new Error('network should not be reached');};
    await assert.rejects(()=>sendPasswordResetCodeEmail({email:'buyer@example.com',code:'abc123'}),/PASSWORD_RESET_CODE_INVALID/);
    assert.equal(called,false);
  } finally { global.fetch=prev.fetch; restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});

test('password recovery email uses the selected language and correct RTL direction', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM,fetch:global.fetch};
  try {
    process.env.RESEND_API_KEY='re_test'; process.env.EMAIL_FROM='Shop <recovery@example.com>';
    let captured;
    global.fetch=async(_url,options)=>{captured=options;return {ok:true,json:async()=>({id:'locale_test'})};};
    await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'012345',locale:'ckb'});
    const kurdish=JSON.parse(captured.body);
    assert.match(kurdish.subject,/کۆدی/);
    assert.match(kurdish.html,/<html lang="ckb" dir="rtl">/);
    assert.match(kurdish.text,/012345/);
    await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'654321',locale:'ar'});
    const arabic=JSON.parse(captured.body);
    assert.match(arabic.subject,/رمز/);
    assert.match(arabic.html,/<html lang="ar" dir="rtl">/);
    await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'222222',locale:'fr'});
    assert.match(JSON.parse(captured.body).subject,/réinitialisation du mot de passe/i,'French recovery must be translated');
    assert.match(JSON.parse(captured.body).html,/<html lang="fr" dir="ltr">/);
    await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'333333',locale:'zz'});
    assert.match(JSON.parse(captured.body).subject,/password reset code/i,'unknown locales safely fall back to English');
  } finally { global.fetch=prev.fetch; restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});


test('transactional emails support Dutch, English, Sorani and Arabic with safe locale handling', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM,fetch:global.fetch};
  try {
    process.env.RESEND_API_KEY='re_test'; process.env.EMAIL_FROM='Shop <recovery@example.com>';
    const sent=[];
    global.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:`email_${sent.length}`})};};
    const cases=[
      ['nl', /Wachtwoordherstelcode/i, /<html lang="nl" dir="ltr">/, /Bestelling #22 ontvangen/i, /We hebben je bestelling ontvangen/],
      ['en', /password reset code/i, /<html lang="en" dir="ltr">/, /Order #22 received/i, /We have received your order/],
      ['ckb', /کۆدی/, /<html lang="ckb" dir="rtl">/, /داواکاری #22 گەیشت/, /داواکارییەکەت گەیشت/],
      ['ar', /رمز/, /<html lang="ar" dir="rtl">/, /تم استلام الطلب #22/, /تم استلام طلبك/]
    ];
    for (const [locale,resetSubjectPattern,htmlPattern,orderSubjectPattern,orderBodyPattern] of cases) {
      await sendPasswordResetCodeEmail({email:'buyer@example.com',code:'012345',locale});
      const reset=sent.at(-1);
      assert.match(reset.subject,resetSubjectPattern,`reset subject for ${locale}`);
      assert.match(reset.html,htmlPattern,`reset direction for ${locale}`);
      await emailService.sendOrderNotificationEmail({locale,eventType:'confirmation',order:{id:22,status:'pending',email:'buyer@example.com',currency:'EUR',total_cents:1250,payment_provider:'cash_on_delivery'},items:[{product_name:'Sample item',quantity:1,total_cents:1250}]});
      const order=sent.at(-1);
      assert.match(order.subject,orderSubjectPattern,`order subject for ${locale}`);
      assert.match(order.html,htmlPattern,`order direction for ${locale}`);
      assert.match(order.text,orderBodyPattern,`order body for ${locale}`);
    }
    await emailService.sendEmailVerificationEmail({email:'buyer@example.com',token:'test-token',verifyUrl:'https://shop.example/verify-email?token=test-token',storeName:'ShopEasy',locale:'nl'});
    const verification=sent.at(-1);
    assert.match(verification.html, /<html lang="nl" dir="ltr">/);
    assert.match(verification.subject, /Bevestig je e-mailadres/i);
    await emailService.sendReturnRequestEmail({email:'buyer@example.com',orderId:22,requestId:7,status:'requested',storeName:'ShopEasy',locale:'nl'});
    const returned=sent.at(-1);
    assert.match(returned.html, /<html lang="nl" dir="ltr">/);
    assert.match(returned.html, /Bestelling #22 · Retouraanvraag #7/);
    assert.match(returned.text, /Bestelling #22 · Retouraanvraag #7/);
    await emailService.sendEmailVerificationEmail({email:'buyer@example.com',token:'test-token-ar',verifyUrl:'https://shop.example/verify-email?token=test-token-ar',storeName:'ShopEasy',locale:'ar'});
    assert.match(sent.at(-1).html, /<html lang="ar" dir="rtl">/);
    await emailService.sendReturnRequestEmail({email:'buyer@example.com',orderId:22,requestId:8,status:'requested',storeName:'ShopEasy',locale:'ckb'});
    assert.match(sent.at(-1).html, /<html lang="ckb" dir="rtl">/);
  } finally { global.fetch=prev.fetch; restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});

test('pending bank-transfer confirmation email includes exact instructions in all locales and escapes HTML', async () => {
  const prev={key:process.env.RESEND_API_KEY,from:process.env.EMAIL_FROM,fetch:global.fetch};
  try {
    process.env.RESEND_API_KEY='re_test';
    process.env.EMAIL_FROM='Shop <orders@example.com>';
    const sent=[];
    global.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:`bank_email_${sent.length}`})};};
    const snapshot={
      bankName:'Example <img src=x onerror=alert(1)> Bank',
      accountHolder:'ShopEasy Test BV',
      account:'BE68539007547034',
      bic:'GEBABEBB',
      instructions:'Use the exact reference.',
      reference:'SHOP-42'
    };
    const cases=[
      ['nl',/Bankoverschrijving/,/Betalingsreferentie/,/blijft onbetaald tot/],
      ['en',/Bank transfer/,/Payment reference/,/The order remains unpaid/],
      ['ckb',/گواستنەوەی بانکی/,/ژمارەی تایبەتی پارەدان/,/پارەدراو نابێت/],
      ['ar',/گواستنەوەی بانکی|تحويل مصرفي/,/مرجع الدفع/,/غير مدفوع/]
    ];
    for (const [locale,paymentPattern,referencePattern,unpaidPattern] of cases) {
      await emailService.sendOrderNotificationEmail({
        locale,eventType:'confirmation',
        order:{id:42,status:'pending',email:'buyer@example.com',currency:'EUR',total_cents:1234,payment_provider:'bank_transfer',payment_instructions_snapshot:JSON.stringify(snapshot)},
        items:[{product_name:'Sample item',quantity:1,total_cents:1234}]
      });
      const payload=sent.at(-1);
      assert.match(payload.html,paymentPattern,`payment method in ${locale} email`);
      assert.match(payload.html,referencePattern,`reference label in ${locale} email`);
      assert.match(payload.text,unpaidPattern,`unpaid notice in ${locale} plain-text email`);
      assert.match(payload.html,/&lt;img src=x onerror=alert\(1\)&gt;/,'bank display values must be HTML escaped');
      assert.doesNotMatch(payload.html,/<img src=x onerror=alert\(1\)>/,'bank display values must never become executable HTML');
      assert.match(payload.text,/SHOP-42/);
      assert.match(payload.text,/12[,.]34|١٢٫٣٤/,'formatted amount must be present in locale digits');
    }
  } finally { global.fetch=prev.fetch; restore('RESEND_API_KEY',prev.key); restore('EMAIL_FROM',prev.from); }
});

test('production warns without exposing secrets when Resend or reset-code secret is missing', () => {
  const server=fs.readFileSync('src/server.js','utf8');
  assert.match(server,/process\.env\.NODE_ENV !== 'test' && !emailEnabled\(\)[\s\S]*console\.warn\('\[email\] Resend is disabled/);
  assert.match(server,/RESET_CODE_SECRET contains at least 24 characters/);
  assert.match(server,/function emailLocaleFor\([\s\S]*process\.env\.EMAIL_LOCALE/);
  const env=fs.readFileSync('.env.example','utf8');
  assert.match(env,/^EMAIL_LOCALE=$/m);
});

test('password recovery remains six-digit-only and order emails are a separate explicit opt-in', () => {
  assert.equal(typeof emailService.sendPasswordResetCodeEmail, 'function');
  assert.equal(typeof emailService.sendOrderNotificationEmail, 'function');
  assert.equal(emailService.sendPasswordResetEmail, undefined);
  const env=fs.readFileSync('.env.example','utf8');
  assert.match(env,/ORDER_CONFIRMATION_EMAILS=0/);
  assert.match(env,/ORDER_STATUS_EMAILS=0/);
  const server=fs.readFileSync('src/server.js','utf8');
  assert.doesNotMatch(server, /app\.(?:get|post)\(['"]\/reset-password/);
  assert.match(server, /app\.post\(['"]\/forgot-password/);
});
