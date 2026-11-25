// Every npm test run owns its temporary database/profile directory. No .env is read.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedEnvironment } from './release-files.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shopeasy-test-run-'));
fs.chmodSync(directory,0o700);
fs.writeFileSync(path.join(directory,'.owned-test-run'),'Disposable test files only.\n',{mode:0o600});
let child;
const stop=signal=>{if(child&&!child.killed)child.kill(signal);};
const onInterrupt=()=>stop('SIGINT'),onTerminate=()=>stop('SIGTERM');
try {
  const selected=process.argv.slice(2);
  const files=selected.length?selected:fs.readdirSync(path.join(root,'test')).filter(name=>name.endsWith('.test.js')).sort().map(name=>'test/'+name);
  if(!files.length||files.some(name=>!/^test\/[A-Za-z0-9_.-]+\.test\.js$/.test(name)||!fs.statSync(path.join(root,name)).isFile()))throw new Error('Select shipped test/*.test.js files only.');
  const environment=isolatedEnvironment(process.env,directory);
  environment.SHOPEASY_TEST_ROOT=directory;
  const preload=pathToFileURL(path.join(root,'scripts/test-environment.mjs')).href;
  child=spawn(process.execPath,['--import',preload,'--test',...files],{cwd:root,env:environment,stdio:'inherit',windowsHide:true});
  process.once('SIGINT',onInterrupt);process.once('SIGTERM',onTerminate);
  const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  process.exitCode=result.code??(result.signal==='SIGINT'?130:1);
}catch(error){console.error(`Isolated test run stopped: ${error.message}`);process.exitCode=1;}
finally {
  process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);
  fs.rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});
}
