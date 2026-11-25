// Run only against a new extracted release, as an account without access to store state.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isolatedEnvironment} from './release-files.mjs';

export const deploymentChecks = [
  ['node', ['scripts/verify-release-files.mjs']],
  ['npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']],
  ...['check','lint','typecheck:core','audit:static','preflight:release'].map(script=>['npm',['run',script]]),
  ['node', ['scripts/template-audit.mjs']],
  ['npm', ['run','build:cloudflare']],
  ['npm', ['test']],
  ['npm', ['audit','--audit-level=low']],
  ['npm', ['audit','--omit=dev','--audit-level=low']],
  ['npm', ['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund']],
  ['node', ['scripts/check-test-dependencies.mjs']]
];

export function prepareDeployment(directory, {run = spawnSync} = {}) {
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  if(fs.realpathSync(directory)!==fs.realpathSync(source))throw new Error('Prepare must run from its own newly extracted release.');
  const [major,minor,patch]=process.versions.node.split('.').map(Number);
  if(major!==24||minor<22||(minor===22&&patch<2))throw new Error('Use Node.js >=24.22.2 <25.');
  if(process.getuid?.()===0)throw new Error('Dependency preparation must run as the separate build account, never root.');
  const scratch=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shopeasy-deployment-check-'));
  try {
    const env=isolatedEnvironment(process.env,scratch);
    for(const [program,args]of deploymentChecks) {
      const executable=program==='node'?process.execPath:program;
      const result=run(executable,args,{cwd:directory,env,stdio:'inherit'});
      if(result.error||result.status!==0)throw new Error(`Release preparation failed at ${program} ${args.join(' ')}. No release pointer was changed.`);
    }
    for(const name of ['.cloudflare-build','.wrangler'])fs.rmSync(path.join(directory,name),{recursive:true,force:true});
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{if(process.argv.length!==3)throw new Error('Usage: node scripts/prepare-deployment.mjs EXTRACTED_RELEASE');prepareDeployment(process.argv[2]);}
  catch(error){console.error(`Release preparation rejected: ${error.message}`);process.exitCode=1;}
}
