import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {once} from 'node:events';

const fixture=name=>fs.readFileSync(new URL(`./fixtures/${name}`,import.meta.url));
let store,server,base,manager;
const originalFetch=globalThis.fetch;

before(async()=>{
  Object.assign(process.env,{NODE_ENV:'test',CLOUDFLARE_WORKER:'0',TEST_IMAGE_STORAGE_IN_DATABASE:'1',SEED_DEMO_DATA:'false',RATE_LIMIT_BACKEND:'memory-single-instance',TRUST_PROXY:'0'});
  for(const key of ['RESEND_API_KEY','EMAIL_FROM','MANAGER_EMAIL','MANAGER_PASSWORD','MOLLIE_API_KEY','AI_API_KEY'])delete process.env[key];
  globalThis.fetch=(input,options)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if(url.hostname!=='127.0.0.1')throw Error('FIX03_EXTERNAL_NETWORK_DISABLED');
    return originalFetch(input,options);
  };
  store=await import('../src/db.js');
  const {DUMMY_PASSWORD_HASH}=await import('../src/password-hashing.js');
  const id=await store.createUser('manager@fix03-upload.example.test',DUMMY_PASSWORD_HASH,'manager','Synthetic Upload Manager');
  await store.default.execute({sql:'UPDATE users SET mfa_enabled=1 WHERE id=?',args:[id]});
  const sid=await store.createSession(id),csrf=crypto.randomBytes(24).toString('base64url');await store.setSessionCsrf(sid,csrf);manager={sid,csrf};
  const {default:app}=await import('../src/server.js');server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  if(store)await store.default.close();globalThis.fetch=originalFetch;
});

async function state() {
  const assets=(await store.default.execute('SELECT path,content_type,length(data) AS bytes FROM uploaded_assets ORDER BY path')).rows.map(row=>({...row}));
  const quota=(await store.default.execute('SELECT used_bytes FROM asset_storage_quota WHERE id=1')).rows[0].used_bytes;
  return {assets,quota,logo:await store.getSetting('appearance_logo','')};
}
async function upload(bytes,mime) {
  const body=new FormData();
  for(const [key,value] of Object.entries({_csrf:manager.csrf,brandPrimary:'#244C40',brandAccent:'#D8B68A',font:'inter',freeShippingMinimum:'0'}))body.set(key,value);
  body.set('shopLogo',new Blob([bytes],{type:mime}),'synthetic-image');
  const response=await fetch(base+'/admin/appearance',{method:'POST',headers:{cookie:`sid=${manager.sid}`},body,redirect:'manual'});
  await response.arrayBuffer();return response;
}

for(const [filename,mime,extension] of [['r19-sample.png','image/png','png'],['r19-progressive.jpg','image/jpeg','jpg'],['r19-alpha.webp','image/webp','webp']]) {
  test(`SEC003 actual Manager upload accepts ${filename} and stores the original complete image`,async()=>{
    const bytes=fixture(filename),response=await upload(bytes,mime);
    assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/admin/appearance?saved=1');
    const current=await state();assert.match(current.logo,new RegExp(`^/uploads/[a-f0-9]{32}\\.${extension}$`));
    const asset=(await store.default.execute({sql:'SELECT data,content_type FROM uploaded_assets WHERE path=?',args:[current.logo]})).rows[0];
    assert.equal(asset.content_type,mime);assert.deepEqual(Buffer.from(asset.data),bytes);
    assert.equal(current.assets.length,1);assert.equal(Number(current.quota),bytes.length);
  });
}

const invalidImages=[
  ['33-byte PNG header only','image/png',()=>fixture('r19-sample.png').subarray(0,33)],
  ['PNG corrupted chunk','image/png',()=>{const bytes=fixture('r19-sample.png');bytes[bytes.length-5]^=1;return bytes;}],
  ['JPEG missing scan/end','image/jpeg',()=>fixture('r19-sample.jpg').subarray(0,300)],
  ['WebP extended header without frame','image/webp',()=>{const bytes=Buffer.from(fixture('r19-alpha.webp').subarray(0,30));bytes.writeUInt32LE(22,4);return bytes;}]
];
for(const [name,mime,bytes] of invalidImages) {
  test(`SEC003 actual Manager upload rejects ${name} without changing logo, media or quota`,async()=>{
    const previous=await state(),response=await upload(bytes(),mime);
    assert.equal(response.status,400);assert.deepEqual(await state(),previous);
  });
}
