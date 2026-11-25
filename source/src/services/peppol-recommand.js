/** Recommand Peppol access-point adapter. Uses the documented JSON invoice API.
 * Company onboarding, verification and API credentials occur outside ShopEasy.
 * Never infer Belgian VAT or create invoices automatically from web orders.
 */
import crypto from 'node:crypto';
import { isValidIban } from './bank-transfer.js';
const HOST='https://app.recommand.eu';
const MAX_RESPONSE_BYTES=200_000;

async function readResponseTextLimited(response) {
  const declaredLength=Number(response.headers?.get?.('content-length'));
  if(Number.isFinite(declaredLength)&&declaredLength>MAX_RESPONSE_BYTES) {
    await response.body?.cancel?.().catch(()=>{});
    throw new Error('PEPPOL_RESPONSE_TOO_LARGE');
  }
  if(!response.body?.getReader) {
    // Lightweight adapters and test doubles may expose only text(). Native fetch
    // responses use the streaming path below, which stops before buffering excess.
    const text=await response.text();
    if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('PEPPOL_RESPONSE_TOO_LARGE');
    return text;
  }
  const reader=response.body.getReader();
  const chunks=[];
  let total=0;
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(()=>{});
        throw new Error('PEPPOL_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  const bytes=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try {return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch {throw new Error('PEPPOL_INVALID_RESPONSE');}
}
// Peppol scheme 0208: Belgian enterprise numbers use two MOD-97 check digits.
// This is a format/checksum test, NOT confirmation of the legal entity or its VAT status.
export function isValidBelgianEnterpriseNumber(value) {
  if (typeof value !== 'string' || !/^[01]\d{9}$/.test(value)) return false;
  const remainder=Number(value.slice(0,8)) % 97;
  return Number(value.slice(8)) === 97 - remainder;
}
export function validatePeppolInvoiceForm(fields={}) {
  const v=key=>String(fields[key]??'').trim();
  const invoiceNumber=v('invoiceNumber'),issueDate=v('issueDate'),dueDate=v('dueDate');
  const buyerVat=v('buyerVatNumber').replace(/\s/g,'').toUpperCase();
  const recipient=v('recipient').replace(/\s/g,'');
  const vatRate=v('vatRate'),quantity=v('quantity'),price=v('netPriceAmount');
  const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
  if(!/^INV-[A-Za-z0-9][A-Za-z0-9-]{2,44}$/.test(invoiceNumber))throw new Error('INVALID_INVOICE_NUMBER');
  if(!validDate(issueDate)||!validDate(dueDate)||dueDate<issueDate)throw new Error('INVALID_INVOICE_DATE');
  if(!recipient.startsWith('0208:')||!isValidBelgianEnterpriseNumber(recipient.slice(5)))throw new Error('INVALID_PEPPOL_RECIPIENT');
  if(!buyerVat.startsWith('BE')||!isValidBelgianEnterpriseNumber(buyerVat.slice(2))||buyerVat.slice(2)!==recipient.slice(5))throw new Error('BUYER_ID_MISMATCH');
  if(!v('buyerName')||v('buyerName').length>160||!v('buyerStreet')||v('buyerStreet').length>200||!v('buyerCity')||v('buyerCity').length>100||!/^\d{4}$/.test(v('buyerPostalZone')))throw new Error('INVALID_BUYER_DETAILS');
  if(!v('itemName')||v('itemName').length>180||!/^\d{1,3}(?:\.\d{1,2})?$/.test(quantity)||Number(quantity)<=0||!/^(?:0|[1-9]\d{0,6})\.\d{2}$/.test(price)||Number(price)<=0||!['0','6','12','21'].includes(vatRate))throw new Error('INVALID_LINE');
  if(!isValidIban(v('iban')))throw new Error('INVALID_IBAN');
  return {recipient,documentType:'invoice',document:{invoiceNumber,issueDate,dueDate,currency:'EUR',buyer:{name:v('buyerName'),street:v('buyerStreet'),city:v('buyerCity'),postalZone:v('buyerPostalZone'),country:'BE',vatNumber:buyerVat},paymentMeans:[{iban:v('iban').replace(/\s/g,'').toUpperCase()}],lines:[{name:v('itemName'),quantity:Number(quantity).toFixed(2),unitCode:'C62',netPriceAmount:Number(price).toFixed(2),vat:{category:vatRate==='0'?'Z':'S',percentage:Number(vatRate).toFixed(2)}}]}};
}
export function peppolPayloadHash(payload){return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
export async function requestRecommand({companyId,key,secret,payload,send=false,fetchImpl=fetch}={}) {
  if(!/^[-_A-Za-z0-9]{4,100}$/.test(String(companyId||''))||!String(key||'').startsWith('key_')||String(secret||'').length<10)throw new Error('PEPPOL_CREDENTIALS_MISSING');
  if(!payload||payload.documentType!=='invoice')throw new Error('INVALID_DOCUMENT');
  const endpoint=`${HOST}/api/v1/${encodeURIComponent(companyId)}/${send?'send':'generate'}`;
  // A redirect must not forward invoice/customer/bank data to another endpoint.
  const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',headers:{'Authorization':'Basic '+Buffer.from(`${key}:${secret}`).toString('base64'),'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  if(response.redirected||(response.status>=300&&response.status<400))throw new Error('PEPPOL_REDIRECT_REJECTED');
  const text=await readResponseTextLimited(response);
  let data;try{data=JSON.parse(text)}catch{throw new Error('PEPPOL_INVALID_RESPONSE')}
  if(!response.ok||data?.success!==true)return {ok:false,httpStatus:response.status,errors:data?.errors||null};
  return {ok:true,reference:String(data?.document?.id||data?.documentId||data?.id||'').slice(0,160),deliveryStatus:String(data?.deliveryStatus||'submitted').slice(0,60),generatedXml:send?null:(typeof data?.xml==='string'?data.xml:null)};
}
