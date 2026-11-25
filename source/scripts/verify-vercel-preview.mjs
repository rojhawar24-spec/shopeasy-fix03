// Production release remains deliberately blocked. Vercel preview only.
if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview' || process.env.SHOP_DB_BACKEND !== 'postgres-preview' || process.env.RATE_LIMIT_BACKEND !== 'postgres-shared' || !process.env.SHOP_POSTGRES_URL) {
  console.error('ShopEasy preview requires the protected Vercel/Supabase configuration.');
  process.exit(1);
}
console.info('ShopEasy protected preview configuration present.');

import { X509Certificate } from 'node:crypto';
import { writeFileSync } from 'node:fs';
// Fetch only the provider's public CA, verify its independently published SHA-256
// fingerprint, then include it in the deployment. Never download or log credentials.
const expected = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
let pem;
for (const url of ['https://supabase.com/downloads/prod-ca-2021.crt','https://supabase.com/prod-ca-2021.crt']) {
  try {
    const response=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(12000)});
    if(!response.ok || !new URL(response.url).hostname.endsWith('supabase.com')) continue;
    const content=await response.text();
    if(content.length>20000 || !content.startsWith('-----BEGIN CERTIFICATE-----'))continue;
    const cert=new X509Certificate(content);
    if(cert.ca && cert.fingerprint256.replace(/:/g,'').toLowerCase()===expected){pem=content;break;}
  } catch {}
}
if(!pem) throw new Error('Could not verify the official Supabase CA. TLS validation remains mandatory.');
writeFileSync(new URL('../postgres/supabase-ca.pem',import.meta.url),pem);
console.info('Verified Supabase CA certificate included.');
