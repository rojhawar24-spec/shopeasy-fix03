// Keep the Vercel build command below the platform's 256-character limit.
// Fail closed on configuration, syntax or regression failures.
import './verify-vercel-preview.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
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
