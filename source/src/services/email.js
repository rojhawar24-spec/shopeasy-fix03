import { currencyMinorUnitFactor, currencyMinorUnitDigits } from '../security.js';
import { createHash } from 'node:crypto';
import { parseBankTransferSnapshot } from './bank-transfer.js';
function validMailbox(value) {
  const s=String(value||'').trim();
  if(/[\r\n]/.test(s)) return false;
  return /^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(s) || /^[^<>]{1,120}<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(s);
}

function enabled() {
  const key=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.EMAIL_FROM||'').trim();
  return Boolean(key && validMailbox(from));
}

function esc(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Transactional email copy lives server-side; the browser-only storefront i18n
// bundle cannot be imported here because it depends on document/window.
function normalizeEmailLocale(locale) {
  const candidate=String(locale||'en').trim().toLowerCase().split('-')[0];
  return ['nl','en','ckb','ar','fr'].includes(candidate)?candidate:'en';
}

export function emailEnabled() { return enabled(); }

async function digest(value) {
  const {createHash}=await import('node:crypto');
  return createHash('sha256').update(value).digest('hex').slice(0,32);
}

export async function sendPasswordResetCodeEmail({email,code,storeName='ShopEasy',locale='en'}) {
  if(!enabled()) return {sent:false,skipped:true};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||''))) throw new Error('EMAIL_INVALID_RECIPIENT');
  if(!/^\d{6}$/.test(String(code||''))) throw new Error('PASSWORD_RESET_CODE_INVALID');
  const name=String(storeName||'ShopEasy').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'ShopEasy', safeStore=esc(name), safeCode=esc(code);
  const language=normalizeEmailLocale(locale);
  const copy={
    fr:{dir:'ltr',security:'Sécurité du compte',title:'Votre code de vérification',intro:`Utilisez ce code pour réinitialiser le mot de passe de votre compte ${safeStore} :`,expiry:'Ce code expire dans 10 minutes et peut être essayé cinq fois au maximum. Si vous n’en avez pas fait la demande, ignorez cet e-mail. Ne communiquez ce code à personne.',subject:`Code de réinitialisation du mot de passe ${name}`,text:`Votre code pour réinitialiser le mot de passe ${name} est ${code}. Il expire dans 10 minutes et peut être essayé cinq fois au maximum. Ne partagez jamais ce code.`},
    nl:{dir:'ltr',security:'Accountbeveiliging',title:'Je verificatiecode',intro:`Gebruik deze code om het wachtwoord van je ${safeStore}-account opnieuw in te stellen:`,expiry:'Deze code verloopt na 10 minuten en kan maximaal vijf keer worden geprobeerd. Heb je deze code niet aangevraagd, negeer deze e-mail dan. Deel de code met niemand.',subject:`Wachtwoordherstelcode voor ${name}`,text:`Je wachtwoordherstelcode voor ${name} is ${code}. De code verloopt na 10 minuten en kan maximaal vijf keer worden geprobeerd. Deel de code met niemand.`},
    en:{dir:'ltr',security:'Account security',title:'Your verification code',intro:`Use this code to reset the password for your ${safeStore} account:`,expiry:'This code expires in 10 minutes and can be tried no more than five times. If you did not request it, ignore this email. Never share this code.',subject:`Your ${name} password reset code`,text:`Your ${name} password reset code is ${code}. It expires in 10 minutes and can be tried no more than five times. Never share this code.`},
    ckb:{dir:'rtl',security:'پاراستنی هەژمار',title:'کۆدی پشتڕاستکردنەوەی تۆ',intro:`ئەم کۆدە بەکاربهێنە بۆ گۆڕینی وشەی نهێنی هەژماری ${safeStore}:`,expiry:'ئەم کۆدە دوای ١٠ خولەک بەسەر دەچێت و تەنها پێنج جار دەتوانرێت تاقی بکرێتەوە. ئەگەر داوات نەکردووە، ئەم ئیمەیڵە پشتگوێ بخە. کۆدەکە بە کەس مەدە.',subject:`کۆدی گۆڕینی وشەی نهێنی ${name}`,text:`کۆدی گۆڕینی وشەی نهێنی ${name}: ${code}. دوای ١٠ خولەک بەسەر دەچێت و تەنها پێنج جار دەتوانرێت تاقی بکرێتەوە. کۆدەکە بە کەس مەدە.`},
    ar:{dir:'rtl',security:'أمان الحساب',title:'رمز التحقق الخاص بك',intro:`استخدم هذا الرمز لإعادة تعيين كلمة مرور حساب ${safeStore}:`,expiry:'تنتهي صلاحية هذا الرمز خلال 10 دقائق، ويمكن إدخاله خمس مرات كحد أقصى. إذا لم تطلب ذلك، فتجاهل هذه الرسالة. لا تشارك الرمز مع أي شخص.',subject:`رمز إعادة تعيين كلمة مرور ${name}`,text:`رمز إعادة تعيين كلمة مرور ${name} هو ${code}. تنتهي صلاحيته خلال 10 دقائق، ويمكن إدخاله خمس مرات كحد أقصى. لا تشارك الرمز مع أي شخص.`}
  }[language];
  const html=`<!doctype html><html lang="${language}" dir="${copy.dir}"><body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#101828;direction:${copy.dir}"><main style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#16785b;font-weight:bold">${copy.security}</p><h1 style="font-size:26px">${copy.title}</h1><p>${copy.intro}</p><p dir="ltr" style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f3f4f6;border-radius:10px;padding:18px;text-align:center">${safeCode}</p><p>${copy.expiry}</p></main></body></html>`;
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`password-reset-code-${await digest(String(email).toLowerCase()+':'+String(code))}`},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[String(email).trim().toLowerCase()],subject:copy.subject,html,text:copy.text}),signal:controller.signal});
    if(!response.ok) throw new Error('PASSWORD_RESET_EMAIL_FAILED');
    const result=await response.json().catch(()=>({})); return {sent:true,id:result?.id||null};
  } catch(error) { if(error?.name==='AbortError') throw new Error('PASSWORD_RESET_EMAIL_TIMEOUT'); if(error?.message?.startsWith('PASSWORD_RESET_EMAIL_')) throw error; throw new Error('PASSWORD_RESET_EMAIL_FAILED'); } finally { clearTimeout(timer); }
}

/**
 * Sends a single order lifecycle message. Calling code must claim the matching
 * order/event key in the database first; Resend's idempotency key is a second guard.
 * Status messages stay disabled unless the operator explicitly enables them.
 */
export async function prepareOrderNotificationEmail({order,eventType='confirmation',items=[],storeName='ShopEasy',locale='en',trackingUrl=''}) {
  if(!enabled()) return {sent:false,skipped:true};
  if(!order || !Number.isSafeInteger(Number(order.id)) || Number(order.id)<1) throw new Error('ORDER_EMAIL_INVALID_ORDER');
  if(!['confirmation','status'].includes(eventType)) throw new Error('ORDER_EMAIL_INVALID_EVENT');
  const recipient=String(order.email||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('ORDER_EMAIL_INVALID_RECIPIENT');
  const status=String(order.status||'pending');
  if(!['pending','paid','processing','shipped','completed','cancelled'].includes(status)) throw new Error('ORDER_EMAIL_INVALID_STATUS');
  const name=String(storeName||'ShopEasy').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'ShopEasy';
  const safeStore=esc(name), orderNumber=Number(order.id), language=normalizeEmailLocale(locale);
  const translations={
    fr:{dir:'ltr',heading:eventType==='confirmation'?'Nous avons reçu votre commande':'Votre commande a été mise à jour',eyebrow:'SUIVI DE COMMANDE',order:'Commande',status:'Statut actuel',items:'Vos articles',total:'Montant total',payment:'Mode de paiement',cod:'Paiement à la livraison',card:'Paiement en ligne par carte',bankTransfer:'Virement bancaire',bankDetails:'Coordonnées bancaires',bankName:'Banque',accountHolder:'Titulaire du compte',account:'IBAN / compte',bic:'BIC / SWIFT',bankReference:'Référence du virement',bankInstructions:'Instructions de paiement',bankUnpaid:'La commande reste impayée jusqu’à la vérification du virement par la boutique.',option:'Option',option2:'Option 2',reference:'Conservez ce numéro de commande pour toute question.',tracking:'Suivre la commande',footer:'Cet e-mail concerne une commande passée dans cette boutique.',subjects:{confirmation:`Commande n°${orderNumber} reçue · ${name}`,status:`Mise à jour de la commande n°${orderNumber} · ${name}`},statusNames:{pending:'Reçue · en attente de confirmation',paid:'Paiement enregistré',processing:'Acceptée · en cours de préparation',shipped:'Expédiée',completed:'Livrée',cancelled:'Annulée'}},
    nl:{dir:'ltr',heading:eventType==='confirmation'?'We hebben je bestelling ontvangen':'Je bestelling is bijgewerkt',eyebrow:'BESTELLINGSUPDATE',order:'Bestelling',status:'Huidige status',items:'Je artikelen',total:'Totaalbedrag',payment:'Betaalmethode',cod:'Contant bij levering',card:'Online kaartbetaling',bankTransfer:'Bankoverschrijving',bankDetails:'Betaalgegevens',bankName:'Bank',accountHolder:'Rekeninghouder',account:'IBAN / rekeningnummer',bic:'BIC / SWIFT',bankReference:'Betalingsreferentie',bankInstructions:'Betaalinstructies',bankUnpaid:'Je bestelling blijft onbetaald totdat de winkel de overschrijving heeft gecontroleerd.',option:'Optie',option2:'Optie 2',reference:'Bewaar dit bestelnummer voor vragen.',tracking:'Bekijk de bestelstatus',footer:'Dit is een bericht over een bestelling bij deze winkel.',subjects:{confirmation:`Bestelling #${orderNumber} ontvangen · ${name}`,status:`Update over bestelling #${orderNumber} · ${name}`},statusNames:{pending:'Ontvangen · wacht op bevestiging van de winkel',paid:'Betaling geregistreerd',processing:'Bevestigd · bestelling wordt klaargemaakt',shipped:'Verzonden · onderweg',completed:'Afgeleverd',cancelled:'Geannuleerd'}},
    en:{dir:'ltr',heading:eventType==='confirmation'?'We have received your order':'Your order has an update',eyebrow:'ORDER UPDATE',order:'Order',status:'Current status',items:'Your items',total:'Order total',payment:'Payment method',cod:'Cash on delivery',card:'Online card payment',bankTransfer:'Bank transfer',bankDetails:'Bank payment details',bankName:'Bank',accountHolder:'Account holder',account:'IBAN / account',bic:'BIC / SWIFT',bankReference:'Payment reference',bankInstructions:'Payment instructions',bankUnpaid:'The order remains unpaid until the store manually verifies the incoming transfer.',option:'Option',option2:'Option 2',reference:'Keep this order number for support.',tracking:'View order status',footer:'This is a transactional message about an order placed with this store.',subjects:{confirmation:`Order #${orderNumber} received · ${name}`,status:`Order #${orderNumber} update · ${name}`},statusNames:{pending:'Received · awaiting store acceptance',paid:'Payment recorded',processing:'Accepted · preparing your order',shipped:'Shipped · on the way',completed:'Delivered',cancelled:'Cancelled'}},
    ckb:{dir:'rtl',heading:eventType==='confirmation'?'داواکارییەکەت گەیشت':'دۆخی داواکارییەکەت نوێ کرایەوە',eyebrow:'نوێکردنەوەی داواکاری',order:'ژمارەی داواکاری',status:'دۆخی ئێستا',items:'کاڵاکان',total:'کۆی گشتی',payment:'شێوازی پارەدان',cod:'پارەدان لە کاتی گەیاندن',card:'پارەدانی کارتی ئۆنلاین',bankTransfer:'گواستنەوەی بانکی',bankDetails:'زانیاری پارەدانی بانکی',bankName:'بانک',accountHolder:'خاوەنی هەژمار',account:'IBAN / ژمارەی هەژمار',bic:'BIC / SWIFT',bankReference:'ژمارەی تایبەتی پارەدان',bankInstructions:'ڕێنمایی پارەدان',bankUnpaid:'داواکارییەکەت تا کاتێک فرۆشگا گواستنەوەکە پشتڕاست دەکاتەوە، پارەدراو نابێت.',option:'هەڵبژاردە',option2:'هەڵبژاردە ٢',reference:'بۆ پشتیوانی ئەم ژمارەیە هەڵبگرە.',tracking:'بینینی دۆخی داواکاری',footer:'ئەم پەیامە تایبەتە بە داواکارییەک کە لەم فرۆشگایە تۆمار کراوە.',subjects:{confirmation:`داواکاری #${orderNumber} گەیشت · ${name}`,status:`نوێکردنەوەی داواکاری #${orderNumber} · ${name}`},statusNames:{pending:'وەرگیرا · چاوەڕوانی پەسەندکردنی فرۆشگا',paid:'پارەدان تۆمار کرا',processing:'پەسەندکرا · ئامادە دەکرێت',shipped:'نێردراوە · لە ڕێگادایە',completed:'گەیێندراوە',cancelled:'هەڵوەشێنراوەتەوە'}},
    ar:{dir:'rtl',heading:eventType==='confirmation'?'تم استلام طلبك':'تم تحديث حالة طلبك',eyebrow:'تحديث الطلب',order:'رقم الطلب',status:'الحالة الحالية',items:'المنتجات',total:'إجمالي الطلب',payment:'طريقة الدفع',cod:'الدفع عند الاستلام',card:'الدفع بالبطاقة عبر الإنترنت',bankTransfer:'تحويل مصرفي',bankDetails:'بيانات التحويل المصرفي',bankName:'البنك',accountHolder:'صاحب الحساب',account:'IBAN / رقم الحساب',bic:'BIC / SWIFT',bankReference:'مرجع الدفع',bankInstructions:'تعليمات الدفع',bankUnpaid:'سيظل طلبك غير مدفوع حتى يتحقق المتجر من وصول التحويل.',option:'الخيار',option2:'الخيار ٢',reference:'احتفظ برقم الطلب للتواصل مع المتجر.',tracking:'عرض حالة الطلب',footer:'هذه رسالة تتعلق بطلب تم تقديمه إلى هذا المتجر.',subjects:{confirmation:`تم استلام الطلب #${orderNumber} · ${name}`,status:`تحديث الطلب #${orderNumber} · ${name}`},statusNames:{pending:'تم الاستلام · بانتظار قبول المتجر',paid:'تم تسجيل الدفع',processing:'تم القبول · قيد التجهيز',shipped:'تم الشحن · في الطريق',completed:'تم التسليم',cancelled:'ملغى'}}
  }[language];
  const safeStatus=esc(translations.statusNames[status]||status);
  const currency=String(order.currency||'EUR').toUpperCase();
  const formatAmount=value=>{
    const amount=Number(value);
    if(!Number.isFinite(amount))return String(value??'');
    try{const digits=currencyMinorUnitDigits(currency);return new Intl.NumberFormat(language==='fr'?'fr-BE':language==='nl'?'nl-BE':language==='ckb'?'ckb-IQ':language==='ar'?'ar':'en-GB',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(amount/currencyMinorUnitFactor(currency));}
    catch{return `${(amount/currencyMinorUnitFactor(currency)).toFixed(currencyMinorUnitDigits(currency))} ${currency}`;}
  };
  const lineItems=(Array.isArray(items)?items:[]).slice(0,100).map(item=>{
    const variant=[item.variant_value?`${item.variant_name||translations.option}: ${item.variant_value}`:'',item.variant_value_2?`${item.variant_name_2||translations.option2}: ${item.variant_value_2}`:''].filter(Boolean).join(' · ');
    const label=esc(String(item.product_name||'Item').slice(0,180));
    const meta=variant?`<div style="font-size:12px;color:#667085;margin-top:3px">${esc(variant)}</div>`:'';
    const qty=Math.min(100000,Math.max(1,Number(item.quantity)||1));
    const amount=esc(formatAmount(item.total_cents));
    return `<tr><td style="padding:12px 0;border-bottom:1px solid #eaecf0">${label}${meta}<div style="font-size:12px;color:#667085;margin-top:3px">× ${qty}</div></td><td style="padding:12px 0;border-bottom:1px solid #eaecf0;text-align:right;white-space:nowrap">${amount}</td></tr>`;
  }).join('');
  const safeTracking=(()=>{try{const url=new URL(String(trackingUrl||''));return ['https:','http:'].includes(url.protocol)?url.toString():'';}catch{return '';}})();
  const paymentMethod=order.payment_provider==='cash_on_delivery'?translations.cod:order.payment_provider==='mollie'?translations.card:order.payment_provider==='bank_transfer'?translations.bankTransfer:String(order.payment_provider||translations.cod);
  const bankSnapshot=order.payment_provider==='bank_transfer'&&status==='pending'?parseBankTransferSnapshot(order.payment_instructions_snapshot):null;
  const bankTransferHtml=bankSnapshot?`<section style="margin-top:20px;padding:18px;border:1px solid #d8e5df;border-radius:12px;background:#f7faf8"><h2 style="font-size:17px;margin:0 0 12px">${esc(translations.bankDetails)}</h2><p>${esc(translations.bankName)}: <strong>${esc(bankSnapshot.bankName)}</strong></p><p>${esc(translations.accountHolder)}: <strong>${esc(bankSnapshot.accountHolder)}</strong></p><p>${esc(translations.account)}: <code>${esc(bankSnapshot.account)}</code></p>${bankSnapshot.bic?`<p>${esc(translations.bic)}: <code>${esc(bankSnapshot.bic)}</code></p>`:''}<p>${esc(translations.bankReference)}: <strong><code>${esc(bankSnapshot.reference)}</code></strong></p><p>${esc(translations.total)}: <strong>${esc(formatAmount(order.total_cents))}</strong></p>${bankSnapshot.instructions?`<p>${esc(translations.bankInstructions)}: ${esc(bankSnapshot.instructions)}</p>`:''}</section>`:'';
  const bankTransferText=bankSnapshot?`\n${translations.bankDetails}\n${translations.bankName}: ${bankSnapshot.bankName}\n${translations.accountHolder}: ${bankSnapshot.accountHolder}\n${translations.account}: ${bankSnapshot.account}\n${bankSnapshot.bic?`${translations.bic}: ${bankSnapshot.bic}\n`:''}${translations.bankReference}: ${bankSnapshot.reference}\n${translations.total}: ${formatAmount(order.total_cents)}\n${bankSnapshot.instructions?`${translations.bankInstructions}: ${bankSnapshot.instructions}\n`:''}${translations.bankUnpaid}`:'';
  const tracking=safeTracking?`<p style="margin:24px 0"><a href="${esc(safeTracking)}" style="display:inline-block;background:#164e3d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">${esc(translations.tracking)}</a></p>`:'';
  const html=`<!doctype html><html lang="${language}" dir="${translations.dir}"><body style="margin:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#101828;direction:${translations.dir}"><main style="max-width:600px;margin:28px auto;padding:28px;background:#fff;border:1px solid #e4e7ec;border-radius:16px"><p style="font-size:11px;letter-spacing:.1em;color:#28644f;font-weight:bold">${esc(translations.eyebrow)}</p><h1 style="font-size:26px;line-height:1.3;margin:8px 0 22px">${esc(translations.heading)}</h1><div style="background:#f7faf8;border:1px solid #e0e8e3;border-radius:12px;padding:18px"><div style="font-size:12px;color:#667085">${esc(translations.order)}</div><div style="font-size:24px;font-weight:bold;margin:4px 0 16px">#${orderNumber}</div><div style="font-size:12px;color:#667085">${esc(translations.status)}</div><div style="font-size:15px;font-weight:bold;margin-top:5px">${safeStatus}</div></div><h2 style="font-size:17px;margin-top:26px">${esc(translations.items)}</h2><table style="width:100%;border-collapse:collapse">${lineItems}</table><div style="display:flex;justify-content:space-between;gap:16px;padding-top:18px;font-size:16px"><strong>${esc(translations.total)}</strong><strong>${esc(formatAmount(order.total_cents))}</strong></div><p style="font-size:13px;color:#475467;margin-top:18px">${esc(translations.payment)}: <strong>${esc(paymentMethod)}</strong></p>${bankTransferHtml}${tracking}<p style="font-size:12px;color:#667085;line-height:1.6;margin-top:24px">${esc(translations.reference)} ${esc(translations.footer)}</p><hr style="border:0;border-top:1px solid #eaecf0;margin:22px 0"><p style="font-size:12px;color:#667085;margin:0">${safeStore}</p></main></body></html>`;
  const plainLines=(Array.isArray(items)?items:[]).slice(0,100).map(item=>`- ${String(item.product_name||'Item').slice(0,180)}${item.variant_value?` (${item.variant_name||translations.option}: ${item.variant_value}${item.variant_value_2?`, ${item.variant_name_2||translations.option2}: ${item.variant_value_2}`:''})`:''} x ${Math.min(100000,Math.max(1,Number(item.quantity)||1))}`).join('\n');
  const text=`${translations.heading}\n${translations.order}: #${orderNumber}\n${translations.status}: ${translations.statusNames[status]}\n${translations.items}:\n${plainLines}\n${translations.total}: ${formatAmount(order.total_cents)}\n${translations.payment}: ${paymentMethod}${bankTransferText}\n${safeTracking?`${translations.tracking}: ${safeTracking}\n`:''}\n${translations.reference}\n${translations.footer}`;
  const eventKey=eventType==='confirmation'?'confirmation':`status:${status}`;
  return {
    payload:JSON.stringify({from:process.env.EMAIL_FROM,to:[recipient],subject:translations.subjects[eventType],html,text}),
    providerFingerprint:orderEmailProviderFingerprint(),
    idempotencyKey:`shopeasy-order-${await digest(`${orderNumber}:${eventKey}`)}`
  };
}

export function orderEmailProviderFingerprint() {
  const key=String(process.env.RESEND_API_KEY||'').trim();
  return key?createHash('sha256').update(`resend:${key}`).digest('hex'):'';
}

// The delivery ledger supplies the original serialized body and provider key.
// Rebuilding the body on retry could conflict after a status, language or store
// name change, even when the idempotency key itself stays unchanged.
export async function sendPreparedOrderNotificationEmail({payload,providerFingerprint,idempotencyKey}={}) {
  if(!enabled())return {sent:false,skipped:true};
  if(!providerFingerprint||providerFingerprint!==orderEmailProviderFingerprint())throw new Error('ORDER_EMAIL_CREDENTIAL_CHANGED');
  if(typeof payload!=='string'||payload.length>2*1024*1024||!(/^[A-Za-z0-9:._-]{1,256}$/).test(String(idempotencyKey||'')))throw new Error('ORDER_EMAIL_INVALID_PAYLOAD');
  let body;
  try{body=JSON.parse(payload);}catch{throw new Error('ORDER_EMAIL_INVALID_PAYLOAD');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='from,html,subject,text,to'||!validMailbox(body.from)||!Array.isArray(body.to)||body.to.length!==1||!(/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/).test(body.to[0])||typeof body.subject!=='string'||!body.subject||body.subject.length>300||typeof body.html!=='string'||typeof body.text!=='string')throw new Error('ORDER_EMAIL_INVALID_PAYLOAD');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),6000);
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${String(process.env.RESEND_API_KEY).trim()}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:payload,signal:controller.signal});
    if(!response.ok)throw new Error('ORDER_EMAIL_SEND_FAILED');
    const result=await response.json().catch(()=>({}));return {sent:true,id:result?.id||null};
  } catch(error) {if(error?.name==='AbortError')throw new Error('ORDER_EMAIL_TIMEOUT');if(error?.message?.startsWith('ORDER_EMAIL_'))throw error;throw new Error('ORDER_EMAIL_SEND_FAILED');} finally {clearTimeout(timer);}
}

// Compatibility entry point; application lifecycle delivery claims use the
// prepare/send pair above so retries are tied to an immutable ledger payload.
export async function sendOrderNotificationEmail(options) {
  const prepared=await prepareOrderNotificationEmail(options);
  return prepared?.payload?sendPreparedOrderNotificationEmail(prepared):prepared;
}


async function sendSimpleTransactionalEmail({to,subject,html,text,idempotencyKey}) {
  if(!enabled())return {sent:false,skipped:true};
  const recipient=String(to||'').trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw new Error('EMAIL_INVALID_RECIPIENT');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':String(idempotencyKey||`shopeasy-${await digest(recipient+':'+subject)}`)},body:JSON.stringify({from:process.env.EMAIL_FROM,to:[recipient],subject,html,text}),signal:controller.signal});
    if(!response.ok)throw new Error('TRANSACTIONAL_EMAIL_FAILED');
    return {sent:true,id:(await response.json().catch(()=>({})))?.id||null};
  }catch(error){if(error?.name==='AbortError')throw new Error('TRANSACTIONAL_EMAIL_TIMEOUT');if(error?.message?.startsWith('TRANSACTIONAL_EMAIL_'))throw error;throw new Error('TRANSACTIONAL_EMAIL_FAILED');}finally{clearTimeout(timer);}
}
export async function sendEmailVerificationEmail({email,token,verifyUrl,storeName='ShopEasy',locale='en'}) {
  if(!enabled())return {sent:false,skipped:true};
  const name=esc(String(storeName||'ShopEasy').replace(/[\r\n\t]/g,' ').slice(0,100));
  let safeUrl='';try{const u=new URL(String(verifyUrl||''));const localDevelopment=['development','test'].includes(String(process.env.NODE_ENV||'').trim().toLowerCase());const secureInProduction=localDevelopment||u.protocol==='https:';const localHost=['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(u.hostname.toLowerCase())||u.hostname.toLowerCase().endsWith('.localhost');if(['https:','http:'].includes(u.protocol)&&secureInProduction&&!u.username&&!u.password&&!localHost&&u.pathname==='/verify-email'&&!u.hash)safeUrl=u.toString();}catch{}
  if(!safeUrl||!token)throw new Error('EMAIL_VERIFICATION_INVALID_LINK');
  const lang=normalizeEmailLocale(locale);
  const direction=['ckb','ar'].includes(lang)?'rtl':'ltr';
  const copy={
    fr:{subject:`Confirmez votre adresse e-mail pour ${name}`,title:'Confirmez votre adresse e-mail',text:'Ouvrez le lien et saisissez le mot de passe choisi lors de votre inscription. Si vous n’avez pas créé ce compte, ignorez cet e-mail. Ce lien expire après 24 heures et ne peut être utilisé qu’une seule fois.'},
    nl:{subject:`Bevestig je e-mailadres voor ${name}`,title:'Bevestig je e-mailadres',text:'Open de link en voer het wachtwoord in dat je bij de registratie koos. Heb je dit account niet zelf aangemaakt, negeer deze e-mail. De link is 24 uur geldig en kan één keer worden gebruikt.'},
    en:{subject:`Verify your email for ${name}`,title:'Verify your email address',text:'Open the link and enter the password you chose when registering. If you did not create this account, ignore this email. This link expires in 24 hours and can only be used once.'},
    ckb:{subject:`ئیمەیڵەکەت بۆ ${name} پشتڕاست بکەرەوە`,title:'پشتڕاستکردنەوەی ئیمەیڵ',text:'بەستەرەکە بکەرەوە و ئەو وشەی نهێنییە بنووسە کە لە کاتی تۆماربوون هەڵتبژاردووە. ئەگەر خۆت ئەم هەژمارەت دروست نەکردووە، ئەم ئیمەیڵە پشتگوێ بخە. دوای ٢٤ کاتژمێر بەسەر دەچێت و تەنها یەک جار بەکاردێت.'},
    ar:{subject:`تحقق من بريدك الإلكتروني لدى ${name}`,title:'تحقق من بريدك الإلكتروني',text:'افتح الرابط وأدخل كلمة المرور التي اخترتها عند التسجيل. إذا لم تنشئ هذا الحساب بنفسك، فتجاهل هذه الرسالة. تنتهي صلاحية الرابط خلال 24 ساعة ويمكن استخدامه مرة واحدة.'}
  }[lang];
  return sendSimpleTransactionalEmail({to:email,subject:copy.subject,html:`<!doctype html><html lang="${lang}" dir="${direction}"><body><main><h1>${esc(copy.title)}</h1><p>${esc(copy.text)}</p><p><a href="${esc(safeUrl)}">${esc(copy.title)}</a></p></main></body></html>`,text:`${copy.title}\n${copy.text}\n${safeUrl}`,idempotencyKey:`shopeasy-email-verification-${await digest(String(token))}`});
}
export async function sendReturnRequestEmail({email,orderId,requestId,status='requested',storeName='ShopEasy',locale='en'}) {
  if(!enabled())return {sent:false,skipped:true};
  const lang=normalizeEmailLocale(locale), name=esc(String(storeName||'ShopEasy').replace(/[\r\n\t]/g,' ').slice(0,100));
  const direction=['ckb','ar'].includes(lang)?'rtl':'ltr';
  const words={
    fr:{requested:'Nous avons reçu votre demande de retour.',approved:'Votre demande de retour a été acceptée.',rejected:'Votre demande de retour a été refusée.',orderLabel:'Commande',requestLabel:'Demande de retour'},
    nl:{requested:'We hebben je retouraanvraag ontvangen.',approved:'Je retouraanvraag is goedgekeurd.',rejected:'Je retouraanvraag is afgewezen.',orderLabel:'Bestelling',requestLabel:'Retouraanvraag'},
    en:{requested:'We received your return request.',approved:'Your return request has been approved.',rejected:'Your return request was declined.',orderLabel:'Order',requestLabel:'Request'},
    ckb:{requested:'داواکاریی گەڕاندنەوەت وەرگیرا.',approved:'داواکاریی گەڕاندنەوەت پەسەند کرا.',rejected:'داواکاریی گەڕاندنەوەت ڕەت کرایەوە.',orderLabel:'داواکاری',requestLabel:'داواکاریی گەڕاندنەوە'},
    ar:{requested:'تم استلام طلب الإرجاع.',approved:'تمت الموافقة على طلب الإرجاع.',rejected:'تم رفض طلب الإرجاع.',orderLabel:'الطلب',requestLabel:'طلب الإرجاع'}
  }[lang];
  const message=words[status]||words.requested;
  const reference=`${words.orderLabel} #${Number(orderId)} · ${words.requestLabel} #${Number(requestId)}`;
  return sendSimpleTransactionalEmail({to:email,subject:`${message} · ${name}`,html:`<!doctype html><html lang="${lang}" dir="${direction}"><body><main><h1>${esc(message)}</h1><p>${esc(reference)}</p></main></body></html>`,text:`${message}\n${reference}`,idempotencyKey:`shopeasy-return-${Number(requestId)}-${status}`});
}

/** Double-opt-in transactional confirmation/availability messages only.
 * Newsletter campaigns are not sent by this function.
 */
export async function sendEngagementEmail({email,kind,actionUrl,storeName='ShopEasy',productName='',locale='en'}={}) {
  if(!enabled())return {sent:false,skipped:true};
  if(!['newsletter-confirm','stock-confirm','stock-available'].includes(kind))throw new Error('ENGAGEMENT_EMAIL_KIND');
  const recipient=String(email??'').trim().toLowerCase();
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient))throw new Error('ENGAGEMENT_EMAIL_ADDRESS');
  let url;
  try {url=new URL(String(actionUrl));} catch {throw new Error('ENGAGEMENT_EMAIL_URL');}
  if(url.protocol!=='https:' && !(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('ENGAGEMENT_EMAIL_URL');
  const safeName=String(storeName||'ShopEasy').slice(0,100);
  const copy={
    'newsletter-confirm':{nl:['Bevestig je nieuwsbriefinschrijving','Je vroeg om nieuws van de winkel. Bevestig je keuze met de knop hieronder. Zonder bevestiging ontvang je geen nieuwsbrief.','Inschrijving bevestigen'],fr:['Confirmez votre inscription','Vous avez demandé de recevoir les actualités de la boutique. Confirmez votre choix pour vous inscrire.','Confirmer'],en:['Confirm your newsletter subscription','You requested store updates. Confirm your choice to subscribe. No newsletter will be sent before confirmation.','Confirm subscription'],ckb:['بەشداری لە هەواڵنامە پشتڕاست بکەرەوە','تۆ داوات کردووە هەواڵی فرۆشگا وەربگریت. تکایە پشتڕاستی بکەرەوە.','پشتڕاستکردنەوە'],ar:['تأكيد الاشتراك بالنشرة','لقد طلبت تلقي أخبار المتجر. يرجى تأكيد الاشتراك.','تأكيد الاشتراك']},
    'stock-confirm':{nl:['Bevestig je voorraadmelding','Bevestig dat je een e-mail wilt ontvangen wanneer dit product weer beschikbaar is.','Melding bevestigen'],fr:['Confirmez votre alerte de stock','Confirmez votre demande de notification de retour en stock.','Confirmer'],en:['Confirm your back-in-stock alert','Confirm that you want one email when this product is back in stock.','Confirm alert'],ckb:['ئاگادارکردنەوەی بەردەستبوون پشتڕاست بکەرەوە','پشتڕاست بکەرەوە کە دەتەوێت کاتێک بەرهەمەکە گەڕایەوە ئاگادار بکرێیتەوە.','پشتڕاستکردنەوە'],ar:['تأكيد تنبيه التوفر','أكد أنك تريد رسالة عندما يتوفر المنتج من جديد.','تأكيد التنبيه']},
    'stock-available':{nl:['Weer op voorraad','Een product waarvoor je je hebt aangemeld, is weer beschikbaar. De voorraad kan veranderen.','Bekijk het product'],fr:['De nouveau en stock','Un produit que vous suivez est à nouveau disponible. Le stock peut varier.','Voir le produit'],en:['Back in stock','A product you asked about is available again. Availability may change.','View product'],ckb:['دووبارە بەردەستە','ئەو بەرهەمەی داوات کردبوو دووبارە بەردەستە. ڕەنگە بڕەکە بگۆڕێت.','بینینی بەرهەم'],ar:['متوفر مجددًا','المنتج الذي طلبت التنبيه بشأنه متوفر مجددًا. قد تتغير الكمية.','عرض المنتج']}
  }[kind];
  const language=['nl','fr','ckb','ar'].includes(locale)?locale:'en';
  const [heading,description,cta]=copy[language];
  const headingText=`${heading} · ${safeName}`;
  const notice=String(productName||'').slice(0,150);
  const html=`<!doctype html><html lang="${language}" dir="${['ckb','ar'].includes(language)?'rtl':'ltr'}"><body style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:30px auto;padding:16px;color:#182035"><h1>${esc(heading)}</h1>${notice?`<p><strong>${esc(notice)}</strong></p>`:''}<p>${esc(description)}</p><p><a href="${esc(url.toString())}" style="display:inline-block;background:#3124a5;color:white;padding:12px 20px;border-radius:8px">${esc(cta)}</a></p><p style="font-size:13px">If you did not request this, ignore this email.</p></body></html>`;
  return sendSimpleTransactionalEmail({to:recipient,subject:headingText,html,text:`${headingText}\n${notice}\n${description}\n${url.toString()}\nIf you did not request this, ignore this email.`,idempotencyKey:`shopeasy-engagement-${kind}-${await digest(recipient+url.toString())}`});
}

export async function sendNewsletterCampaignEmail({email,subject,body,unsubscribeUrl,storeName='ShopEasy',campaignId}={}){
  if(!enabled())return {sent:false,skipped:true};
  const recipient=String(email||'').trim().toLowerCase(),heading=String(subject||'').trim(),content=String(body||'').trim();
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)||heading.length<5||heading.length>140||content.length<20||content.length>5000||!Number.isSafeInteger(Number(campaignId)))throw new Error('NEWSLETTER_CAMPAIGN_INVALID');
  let link;try{link=new URL(String(unsubscribeUrl));}catch{throw new Error('NEWSLETTER_UNSUBSCRIBE_URL');}
  if(link.protocol!=='https:' && !(process.env.NODE_ENV!=='production' && link.protocol==='http:' && ['localhost','127.0.0.1'].includes(link.hostname)))throw new Error('NEWSLETTER_UNSUBSCRIBE_URL');
  const safeBody=esc(content).replace(/\n/g,'<br>'),safeSubject=esc(heading);
  const html=`<!doctype html><html lang="en"><body style="font-family:system-ui,Arial,sans-serif;max-width:600px;margin:30px auto;padding:16px;color:#1b2030"><h1>${safeSubject}</h1><p>${safeBody}</p><hr><p style="font-size:13px">${esc(storeName)} · You subscribed to store updates. <a href="${esc(link.toString())}">Unsubscribe</a></p></body></html>`;
  return sendSimpleTransactionalEmail({to:recipient,subject:heading,html,text:`${heading}\n\n${content}\n\nTo unsubscribe: ${link.toString()}`,idempotencyKey:`shopeasy-newsletter-${campaignId}-${await digest(recipient)}`});
}
