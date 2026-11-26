// Public catalog and protected preview share the same fail-closed database checks; live sales remain disabled.
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { getMfaEncryptionKey } from '../src/mfa.js';
if(process.env.VERCEL !== '1' || !['preview','production'].includes(process.env.VERCEL_ENV) || process.env.SHOP_DB_BACKEND !== 'postgres-preview' || process.env.RATE_LIMIT_BACKEND !== 'postgres-shared' || !process.env.SHOP_POSTGRES_URL) throw new Error('ShopEasy requires its verified PostgreSQL configuration');
const cert=new X509Certificate(readFileSync(new URL('../postgres/supabase-ca.pem',import.meta.url)));
const fingerprint=cert.fingerprint256.replace(/:/g,'').toLowerCase();
if(!cert.ca || fingerprint!=='807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa' || Date.parse(cert.validFrom)>Date.now() || Date.parse(cert.validTo)<=Date.now()) throw new Error('Supabase CA validation failed');
// Fail the build for an absent or malformed manager encryption key; never print it.
getMfaEncryptionKey().fill(0);
console.info('Vercel target, pinned Supabase CA and MFA key format verified.');
