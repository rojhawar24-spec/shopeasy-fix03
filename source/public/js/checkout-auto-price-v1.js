(()=>{'use strict';
const form=document.querySelector('form[data-auto-price="1"]');
if(!form)return;
const button=form.querySelector('.checkout-place-order'),label=button?.querySelector('.checkout-place-label'),amount=button?.querySelector('.checkout-place-total'),status=document.getElementById('checkout-price-status'),quote=form.elements.pricingQuoteId;
if(!button||!label||!amount||!status||!quote)return;
const fields=['shippingCountry','shippingCity','shippingPostalCode'].map(n=>form.elements[n]);
const locale=(document.documentElement.lang||'en').split('-')[0];
const retry=form.querySelector('[data-checkout-price-retry]');
const words={kmr:['بهایێ گەهاندنێ و باج دهێنە حیسابکرن…','وەلات و باژێرێ خۆ بنڤیسە.','حیسابکرنا بها بەردەست نینە. تکایە دووبارە هەول بدە.','کۆیێ گشتی یێ دووماهیێ'],nl:['Bezorgkosten en btw berekenen…','Vul je land en stad in.','Prijsberekening mislukt. Probeer opnieuw.','Definitieve totaalprijs'],ckb:['حیسابکردنی باج و گەیاندن…','وڵات و شار بنووسە.','حیسابکردن سەرکەوتوو نەبوو.','کۆی گشتی کۆتایی'],fr:['Calcul de la livraison et des taxes…','Indiquez le pays et la ville.','Calcul indisponible. Réessayez.','Total définitif'],ar:['جارٍ حساب التوصيل والضريبة…','أدخل البلد والمدينة.','تعذر الحساب. حاول مجدداً.','الإجمالي النهائي']}[locale]||['Calculating delivery and tax…','Enter your country and city.','Pricing unavailable. Please try again.','Final total'];
let timer,version=0,queue=Promise.resolve(),validUntil=0;
const key=()=>fields.map(f=>f.value.trim()).join('\u001f');
const summary=document.querySelector('.checkout-summary-v5');
const finalLabel=label.dataset.finalLabel;
const priceNote=document.querySelector('.checkout-price-note span');
if(!summary)return;
function invalidate(){quote.value='';validUntil=0;button.disabled=true;label.textContent=words[0];amount.textContent='';summary.querySelectorAll('[data-checkout-estimate]').forEach(el=>el.hidden=false);}
function schedule(){
 clearTimeout(timer);const current=++version;invalidate();if(retry)retry.hidden=true;
 if(!fields[0].value.trim()||!fields[1].value.trim()){status.textContent=words[1];return;}
 status.textContent=words[0];
 timer=setTimeout(()=>{queue=queue.catch(()=>{}).then(async()=>{
  if(current!==version)return;
  const snapshot=key(),body=new URLSearchParams();
  fields.forEach(f=>body.set(f.name,f.value));body.set('_csrf',form.elements._csrf.value);
  try{
   const res=await fetch('/checkout-price',{method:'POST',body,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('quote');
   const data=await res.json();
   if(current!==version||snapshot!==key())return;
   if(!data.quoteId||!data.total)throw Error('quote');
   const subtotalRow=summary.querySelector('[data-checkout-subtotal]');if(subtotalRow)subtotalRow.querySelector('strong').textContent=data.subtotal;
   const totalRow=summary.querySelector('.summary-row.total');
   const shippingRow=summary.querySelector('[data-checkout-shipping]');
   const taxRow=summary.querySelector('[data-checkout-tax]');
   if(shippingRow){shippingRow.querySelector('strong').textContent=data.shipping;shippingRow.querySelector('span').textContent=shippingRow.dataset.label;}
   if(taxRow){taxRow.hidden=data.taxRate===null;taxRow.querySelector('span').textContent=(data.taxIncluded?taxRow.dataset.included:taxRow.dataset.added)+' ('+data.taxRate+'%)';taxRow.querySelector('strong').textContent=data.tax;}
   if(totalRow){totalRow.querySelector('span').textContent=words[3];totalRow.querySelector('strong').textContent=data.total;}
   summary.querySelectorAll('[data-checkout-estimate]').forEach(el=>el.hidden=true);
   if(priceNote)priceNote.textContent=(data.taxRate===null?'':(data.taxIncluded?'VAT included: ':'VAT added: ')+data.taxRate+'% · ')+words[3]+': '+data.total;
   label.textContent=finalLabel;amount.textContent=data.total;quote.value=data.quoteId;validUntil=Date.now()+14*60*1000;
   status.textContent=words[3]+': '+data.total;button.disabled=false;
  }catch(e){if(current===version){status.textContent=words[2];button.disabled=true;if(retry)retry.hidden=false;}}
 });},350);
}
fields.forEach(f=>{f.addEventListener('input',schedule);f.addEventListener('change',schedule);});
form.addEventListener('submit',e=>{if(!quote.value||Date.now()>=validUntil){e.preventDefault();e.stopImmediatePropagation();schedule();}},true);
retry?.addEventListener('click',schedule);
window.addEventListener('pageshow',schedule);
schedule();
})();