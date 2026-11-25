#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
assert.equal(pkg.version,lock.version,'package-lock root version must match package.json');
assert.equal(lock.packages[''].version,pkg.version,'package-lock package root version must match package.json');
assert.equal(lock.packages[''].engines.node,pkg.engines.node,'package-lock Node engine must match package.json');
// Fail closed until the patched upload dependency is pinned with registry-generated SRI.
// Release packaging validates this existing locked digest and uses npm ci in a
// private staged copy; it never repairs dependency metadata in the source tree.
assert.equal(pkg.dependencies.multer,'2.5.0','current release must pin the patched Multer 2.5.0 release');
assert.equal(lock.packages[''].dependencies.multer,'2.5.0','lock root must match the patched Multer pin');
const multerLock=lock.packages['node_modules/multer'];
assert.ok(multerLock,'Multer must have a package-lock entry');
assert.equal(multerLock.version,'2.5.0','Multer lock entry must use 2.5.0');
assert.equal(multerLock.resolved,'https://registry.npmjs.org/multer/-/multer-2.5.0.tgz','Multer must resolve from the official npm registry');
assert.match(multerLock.integrity||'',/^sha512-[A-Za-z0-9+/]+={0,2}$/,'Multer 2.5.0 must have an npm-generated SHA-512 integrity value before release');
let multerIntegrityBytes;
try { multerIntegrityBytes=Buffer.from(multerLock.integrity.slice(7),'base64'); } catch { multerIntegrityBytes=Buffer.alloc(0); }
assert.equal(multerIntegrityBytes.length,64,'Multer integrity must decode to a complete 64-byte SHA-512 digest');
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
// Local development may have a real .env. It must be ignored by Git; the shipped
// archive is checked separately and must never contain it.
if (fs.existsSync(path.join(root,'.env'))) assert.match(gitignore,/^\.env$/m,'Local .env must be ignored by Git');

if (fs.existsSync(path.join(root,'.cloudflare-build'))) {
  // Existing generated output is validated below only when present; source ZIPs may omit it.
}
assert.equal(fs.existsSync(path.join(root,'cloudflare-worker-entry.mjs')),true,'Cloudflare root entry must exist');
const wrangler=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
assert.equal(wrangler.main,'./cloudflare-worker-entry.mjs','Wrangler must use the root entrypoint');
assert.ok(wrangler.durable_objects?.bindings?.some(binding=>binding.name==='SHOP_RATE_LIMITER'&&binding.class_name==='ShopEasyRateLimiter'),'Cloudflare shared rate-limit Durable Object binding must exist');
assert.deepEqual(wrangler.exports?.ShopEasyRateLimiter,{type:'durable-object',storage:'sqlite'},'Rate limiter must use a SQLite-backed Durable Object export');
assert.ok(fs.existsSync(path.join(root,'src','rate-limit-durable-object.js')),'Shared rate-limit Durable Object class must exist');
const stagingWrangler=JSON.parse(fs.readFileSync(path.join(root,'wrangler.staging.jsonc'),'utf8'));
assert.equal(stagingWrangler.name,'shopeasy-store-starter-staging','Staging Worker must have a separate name');
assert.equal(stagingWrangler.main,'./cloudflare-worker-entry.mjs','Staging must use the same reviewed entrypoint');
assert.ok(stagingWrangler.durable_objects?.bindings?.some(binding=>binding.name==='SHOP_RATE_LIMITER'&&binding.class_name==='ShopEasyRateLimiter'),'Staging must bind the shared limiter separately');
assert.deepEqual(stagingWrangler.exports?.ShopEasyRateLimiter,{type:'durable-object',storage:'sqlite'},'Staging must export the SQLite-backed limiter');
const productionFiles=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else productionFiles.push(f);}}
for(const dir of ['src','views']) walk(path.join(root,dir));
walk(path.join(root,'public','js'));
const text=productionFiles.filter(f=>/\.(js|mjs|ejs|css)$/i.test(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n');
assert.doesNotMatch(text,/\bdebugger\s*;/,'debugger statement detected in production code');
assert.doesNotMatch(text,/[\r\n]\s*(TODO|FIXME|HACK)\b/i,'development marker detected in production code');
assert.doesNotMatch(text,/\balert\s*\(/,'alert() detected in production code');
assert.doesNotMatch(text,/console\.log\s*\(/,'console.log detected in production code');
// Do not scan the entire working tree for shipped-state markers: a developer may have
// local .env/data/node_modules after npm ci. Those are excluded from release archives
// and are verified by the archive-level release policy instead.
console.log(`Release preflight passed: ${pkg.version}; ${productionFiles.length} production files scanned.`);
