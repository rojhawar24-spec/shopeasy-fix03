// Verification runs only in a new private copy; original source and local state stay untouched.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {releaseFiles,hashFiles,writeChecksumManifest,isolatedEnvironment} from './release-files.mjs';
import {createZip,extractZip} from './release-archive.mjs';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let temporary,partial,outputDirectory,publishedArchive;
const results=[];
const start=new Date().toISOString();
let status='RUNNING';
let archiveEvidence;
let outputCreated=false;
const credentials=Object.entries(process.env).filter(([name,value])=>value.length>7 && /SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY/i.test(name)).map(([,value])=>value);
function redact(text) {
  let result=String(text);for(const value of credentials)result=result.split(value).join('[REDACTED]');
  return result.replace(/((?:__Host-)?sid=)[^\s;<>"']+/gi,'$1[REDACTED]').replace(/([?&](?:token|guestAccessToken)=)[^\s&<>"']+/gi,'$1[REDACTED]').replace(/(https?:\/\/)[^/\s@]+@/gi,'$1[REDACTED]@');
}
function run(name,program,args,cwd,environment) {
  const started=new Date().toISOString();
  let executable=program,argumentsList=args;
  if(process.platform==='win32'&&program==='npm.cmd') {
    if(!args.every(argument=>/^[a-z0-9:_./=-]+$/i.test(argument)))throw new Error('Unsupported npm command argument.');
    executable=environment.ComSpec||environment.COMSPEC||'cmd.exe';
    argumentsList=['/d','/s','/c',`npm.cmd ${args.join(' ')}`];
  }
  const result=spawnSync(executable,argumentsList,{cwd,env:environment,encoding:'utf8',maxBuffer:32*1024*1024,windowsHide:true});
  const output=redact((result.stdout||'')+(result.stderr||''));
  const entry={name,command:[program,...args],started,finished:new Date().toISOString(),exit_code:result.status,signal:result.signal,output};
  results.push(entry);
  writeLog();
  console.log(`${result.status===0?'VERIFIED':result.status===null?'NOT TESTED':'FAILED'}: ${name}; exit ${result.status ?? 'unavailable'}.`);
  if(result.error || result.status!==0)throw new Error(`${name} did not complete successfully; see the private verification-log.json. No release archive is accepted.`);
  return output;
}
function writeLog() {
  if(outputCreated)fs.writeFileSync(path.join(outputDirectory,'verification-log.json'),JSON.stringify({label:status,started:start,results,archive:archiveEvidence},null,2)+'\n',{mode:0o600});
}
try {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--output')throw new Error('Usage: node scripts/verify-and-package.mjs --output DIRECTORY_OUTSIDE_SOURCE');
  const [major,minor,patch]=process.versions.node.split('.').map(Number);
  if(major!==24 || minor<22 || (minor===22&&patch<2))throw new Error('Use Node.js >=24.22.2 <25.');
  outputDirectory=path.resolve(args[1]);
  if(outputDirectory===source||outputDirectory.startsWith(source+path.sep))throw new Error('Output must be outside the source directory.');
  if(fs.existsSync(outputDirectory))throw new Error('Output directory already exists; choose a new empty path.');
  // Collect first. Any private state or symlink makes a fresh source extraction necessary.
  const files=releaseFiles(source),before=hashFiles(source,files);
  if(!files.includes('package-lock.json')||!files.includes('SHA256SUMS.txt'))throw new Error('A complete source release with a checksum manifest is required.');
  fs.mkdirSync(outputDirectory,{recursive:true,mode:0o700});
  outputCreated=true;
  temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'shopeasy-release-check-'));fs.chmodSync(temporary,0o700);
  const stage=path.join(temporary,'source');fs.mkdirSync(stage,{mode:0o700});
  for(const relative of files){const target=path.join(stage,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,relative),target);}
  const environment=isolatedEnvironment(process.env,temporary);
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  run('Input archive integrity',process.execPath,['scripts/verify-release-files.mjs'],stage,environment);
  run('Fresh locked install',npm,['ci','--ignore-scripts','--no-audit','--no-fund'],stage,environment);
  for(const script of ['check','lint','typecheck:core','audit:static','preflight:release'])run(script,npm,['run',script],stage,environment);
  run('Templates',process.execPath,['scripts/template-audit.mjs'],stage,environment);
  run('Optional Cloudflare source build (not deployment)',npm,['run','build:cloudflare'],stage,environment);
  run('Complete test suite',npm,['test'],stage,environment);
  run('All dependency advisories',npm,['audit','--audit-level=low','--json'],stage,environment);
  run('Production dependency advisories',npm,['audit','--omit=dev','--audit-level=low','--json'],stage,environment);
  run('Exact installed third-party notices',npm,['run','licenses:generate'],stage,environment);
  const packageInfo=JSON.parse(fs.readFileSync(path.join(stage,'package.json'),'utf8'));
  const report={label:'VERIFIED',version:packageInfo.version,started:start,finished:new Date().toISOString(),node:process.version,platform:process.platform,
    checks:results.map(({name,command,exit_code})=>({name,command,exit_code})),
    limitations:{windows_powershell_5_1:'NOT TESTED unless separately executed there',live_providers_and_production_deployment:'NOT TESTED',full_wcag_asvs_assessment:'NOT TESTED',ownership_and_resale_grant:'UNKNOWN — see LICENSE.txt and RIGHTS-CLEARANCE-REGISTER.md'},
    archive_evidence:'Final checksums, actual ZIP enumeration, re-extraction integrity and ZIP SHA-256 are recorded in the external verification-log.json and CONTENTS.json after this report is generated.',
    meaning:'These automated technical checks are not a legal clearance, zero-bug claim, provider certification or complete production security audit.'};
  for(const directory of ['node_modules','.cloudflare-build','.wrangler'])fs.rmSync(path.join(stage,directory),{recursive:true,force:true});
  fs.writeFileSync(path.join(stage,'FINAL-VERIFICATION-REPORT.json'),JSON.stringify(report,null,2)+'\n');
  writeChecksumManifest(stage);
  run('Final staged archive integrity',process.execPath,['scripts/verify-release-files.mjs'],stage,environment);
  const after=hashFiles(source,releaseFiles(source));
  if(before.size!==after.size||[...before].some(([name,hash])=>after.get(name)!==hash))throw new Error('Source changed during verification; release rejected.');
  const archiveName=`ShopEasy-${packageInfo.version}-technical-checks.zip`;
  partial=path.join(outputDirectory,archiveName+'.partial');
  const contents=createZip(stage,releaseFiles(stage),partial);
  const extracted=path.join(temporary,'extracted');extractZip(partial,extracted);
  run('Actual ZIP re-extraction integrity',process.execPath,['scripts/verify-release-files.mjs'],extracted,environment);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(partial)).digest('hex');
  const destination=path.join(outputDirectory,archiveName);fs.renameSync(partial,destination);partial=null;publishedArchive=destination;
  fs.writeFileSync(destination+'.sha256',`${hash}  ${archiveName}\n`,{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(outputDirectory,'CONTENTS.json'),JSON.stringify({label:'VERIFIED',archive:archiveName,sha256:hash,files:contents},null,2)+'\n',{flag:'wx',mode:0o600});
  archiveEvidence={archive:archiveName,sha256:hash,regular_files:contents.length,reextracted_integrity:'VERIFIED'};
  status='VERIFIED';writeLog();
  console.log(`VERIFIED: ${contents.length} actual ZIP files; SHA-256 ${hash}`);
  console.log('UNKNOWN: commercial rights clearance. NOT TESTED: live deployment/providers and full manual accessibility/security review.');
}catch(error){
  status='FAILED';
  if(publishedArchive){for(const filename of [publishedArchive,publishedArchive+'.sha256',path.join(outputDirectory,'CONTENTS.json')])fs.rmSync(filename,{force:true});}
  writeLog();console.error(`Release stopped: ${redact(error.message)}`);process.exitCode=1;
}
finally {
  if(partial)fs.rmSync(partial,{force:true});
  if(temporary)fs.rmSync(temporary,{recursive:true,force:true});
}
