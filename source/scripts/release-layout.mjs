import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export function switchRelease(appDirectory,releaseDirectory) {
  if(!fs.lstatSync(appDirectory).isDirectory() || fs.lstatSync(appDirectory).isSymbolicLink())throw new Error('Application root must be a real directory.');
  if(!fs.lstatSync(releaseDirectory).isDirectory() || fs.lstatSync(releaseDirectory).isSymbolicLink())throw new Error('Release must be a real directory.');
  const app=fs.realpathSync(appDirectory),release=fs.realpathSync(releaseDirectory),releases=path.join(app,'releases');
  if(path.dirname(release)!==releases || path.basename(release).startsWith('.'))throw new Error('Release must be a finalized direct child of releases/.');
  const current=path.join(app,'current');
  let previous=null;
  let currentEntry;
  try{currentEntry=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(currentEntry) {
    if(!fs.lstatSync(current).isSymbolicLink())throw new Error('current must be a symbolic link.');
    previous=fs.realpathSync(current);
    if(path.dirname(previous)!==releases)throw new Error('Existing current link escapes releases/.');
  }
  const temporary=path.join(app,`.current-${crypto.randomBytes(8).toString('hex')}`);
  fs.symlinkSync(path.relative(app,release),temporary,'dir');
  try{fs.renameSync(temporary,current);}catch(error){fs.rmSync(temporary,{force:true});throw error;}
  return previous;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const [app,release]=process.argv.slice(2);if(!app||!release)throw new Error('Usage: node scripts/release-layout.mjs APP_DIR RELEASE_DIR');const previous=switchRelease(app,release);console.log(previous||'');}
  catch(error){console.error(`Release switch rejected: ${error.message}`);process.exitCode=1;}
}
