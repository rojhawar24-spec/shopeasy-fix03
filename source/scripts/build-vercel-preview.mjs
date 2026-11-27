// Keep the Vercel build command below the platform's 256-character limit.
// Fail closed on configuration, syntax or regression failures.
import './verify-vercel-preview.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
// Fetch a pinned OFL-licensed webfont package at build time, never in the browser.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const fontTmp=mkdtempSync(join(tmpdir(),'shopeasy-font-'));
try {
  const packed=spawnSync('npm',['pack','@fontsource-variable/noto-sans-arabic@5.3.0','--ignore-scripts','--json','--registry=https://registry.npmjs.org','--pack-destination',fontTmp],{cwd,encoding:'utf8',timeout:90000,maxBuffer:2*1024*1024});
  if(packed.error||packed.status!==0)throw new Error('Pinned Noto Sans Arabic package could not be fetched');
  const metadata=JSON.parse(packed.stdout)[0];
  if(metadata.name!=='@fontsource-variable/noto-sans-arabic'||metadata.version!=='5.3.0'||!/^[-a-zA-Z0-9.]+\.tgz$/.test(metadata.filename))throw new Error('Unexpected font package');
  const archive=join(fontTmp,metadata.filename);
  const extract=member=>{
    const result=spawnSync('tar',['-xOf',archive,member],{maxBuffer:2*1024*1024,timeout:15000});
    if(result.error||result.status!==0)throw new Error('Missing font asset: '+member);
    return result.stdout;
  };
  const font=extract('package/files/noto-sans-arabic-arabic-wght-normal.woff2');
  if(font.length<10000||font.subarray(0,4).toString('ascii')!=='wOF2')throw new Error('Invalid Arabic webfont');
  const license=extract('package/LICENSE');
  if(!license.toString('utf8').includes('SIL OPEN FONT LICENSE'))throw new Error('Missing OFL license');
  const out=join(cwd,'public','fonts');mkdirSync(out,{recursive:true});
  writeFileSync(join(out,'noto-sans-arabic-5.3.0.woff2'),font);
  writeFileSync(join(out,'noto-sans-arabic-OFL.txt'),license);
  console.info('Pinned Noto Sans Arabic WOFF2 and license prepared.');
} finally {rmSync(fontTmp,{recursive:true,force:true});}

const checks=[
  ['--check','src/server.js'],
  ['--check','src/shared-rate-limiter.js'],
  ['--test','postgres/bridge.test.mjs','postgres/settings-batcher.test.mjs','test/preview-performance-assets.test.js','test/product-photo-preview-regression.test.js','test/storefront-performance-regression.test.js','test/fast-search-regression.test.js']
];
for(const args of checks){
  const result=spawnSync(process.execPath,args,{cwd,stdio:'inherit',shell:false});
  if(result.error || result.status!==0) throw new Error('Preview build regression check failed: '+args[0]);
}
console.info('Preview performance and upload regression checks passed.');
