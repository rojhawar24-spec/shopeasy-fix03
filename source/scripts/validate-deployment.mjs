import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {isStrongEnoughPassword} from '../src/security.js';

export function validateDeployment(environmentText,caddyText) {
  const duplicate=new Set(),seen=new Set();
  for(const line of environmentText.split(/\r?\n/)) {
    const name=line.match(/^\s*(?:export\s+)?([a-z_][a-z0-9_]*)\s*=/i)?.[1];
    if(name){if(seen.has(name))duplicate.add(name);seen.add(name);}
  }
  if(duplicate.size)throw new Error('Deployment configuration contains duplicate keys.');
  const values=dotenv.parse(environmentText);
  for(const [name,value]of Object.entries({NODE_ENV:'production',PORT:'3000',DATABASE_URL:'file:./data/shop.db',RATE_LIMIT_BACKEND:'memory-single-instance',CLOUDFLARE_WORKER:'0',TRUST_PROXY:'1'})) {
    if(values[name]!==value)throw new Error(`Deployment requires ${name}=${value}.`);
  }
  if(['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','SHOP_DATABASE_URL'].some(name=>values[name]))throw new Error('This deployment uses one local SQLite database; remote aliases must be unset.');
  let origin;
  try{origin=new URL(values.BASE_URL);}catch{throw new Error('BASE_URL must be a public HTTPS origin.');}
  if(origin.protocol!=='https:'||origin.port||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||net.isIP(origin.hostname)||!origin.hostname.includes('.')||/\.(?:local|localhost)$/.test(origin.hostname))throw new Error('BASE_URL must be a public HTTPS origin without an IP, port, path or credentials.');
  if(!/^[0-9a-f]{64}$/i.test(values.MFA_ENCRYPTION_KEY||''))throw new Error('MFA_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
  if((values.RESEND_API_KEY||values.EMAIL_FROM)&&String(values.RESET_CODE_SECRET||'').length<24)throw new Error('Email/password recovery requires RESET_CODE_SECRET with at least 24 characters.');
  if(values.MANAGER_EMAIL||values.MANAGER_PASSWORD) {
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.MANAGER_EMAIL||'')||!isStrongEnoughPassword(values.MANAGER_PASSWORD))throw new Error('Initial Manager credentials must both satisfy the current account policy; omit both after bootstrap if no longer needed.');
  }
  const active=caddyText.split(/\r?\n/).map(line=>line.replace(/\s+#.*$/,'').trim()).filter(line=>line&&!line.startsWith('#'));
  // Deliberately support the small shipped configuration. Other directives can
  // disable automatic HTTPS or add HTTP sites even when `caddy validate` passes.
  const withoutEncoding=active.filter(line=>line!=='encode zstd gzip');
  if(active.length-withoutEncoding.length>1||withoutEncoding.length!==3||withoutEncoding[0].toLowerCase()!==`${origin.hostname.toLowerCase()} {`||withoutEncoding[1]!=='reverse_proxy 127.0.0.1:3000'||withoutEncoding[2]!=='}')throw new Error('Caddy must use the single documented HTTPS site for BASE_URL and proxy to 127.0.0.1:3000; extra blocks/directives need separate review.');
  return {baseUrl:origin.origin};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    const [app,caddy]=process.argv.slice(2);if(!app||!caddy)throw new Error('Usage: node scripts/validate-deployment.mjs APP_DIR CADDY_CONFIG');
    const result=validateDeployment(fs.readFileSync(path.join(app,'.env'),'utf8'),fs.readFileSync(caddy,'utf8'));console.log(result.baseUrl);
  }catch(error){console.error(`Deployment configuration rejected: ${error.message}`);process.exitCode=1;}
}
