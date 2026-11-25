import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const excludedDirectories = new Set(['node_modules', '.git', '.cloudflare-build', '.wrangler', '__pycache__']);
const privateDirectories = new Set(['data', 'backups', '.venv', 'venv', '.qa-venv', '.qa-tools', 'history']);
const privateFiles = /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.netrc|\.pypirc|.*\.(?:pem|p12|pfx|key|sqlite|sqlite3|db|db-wal|db-shm|bak|enc|log|zip|tmp))$/i;
export function safeReleasePath(relative) {
  return typeof relative === 'string' && relative.length > 0 && relative.length < 1024 &&
    !/[\x00-\x1f\x7f\\:]/.test(relative) && !relative.startsWith('/') &&
    relative.split('/').every(part => part && part !== '.' && part !== '..' &&
      !/[. ]$/.test(part) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
export function releaseFiles(directory, {rejectPrivate = true} = {}) {
  const found = [];
  const portableNames=new Set();
  function walk(current, prefix = '') {
    for (const entry of fs.readdirSync(current, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name, 'en'))) {
      const relative = prefix + entry.name;
      if (!safeReleasePath(relative)) throw new Error('Unsafe release path.');
      const portableName=relative.normalize('NFC').toLocaleLowerCase('en');
      if(portableNames.has(portableName))throw new Error(`Colliding portable release path: ${relative}`);
      portableNames.add(portableName);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic link in release source: ${relative}`);
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name.toLowerCase())) continue;
        if (privateDirectories.has(entry.name.toLowerCase()) || /^qa-output/i.test(entry.name) || relative.toLowerCase() === 'public/uploads') {
          if (rejectPrivate) throw new Error(`Private state exists; use a fresh source extraction: ${relative}`);
          continue;
        }
        walk(path.join(current,entry.name), relative + '/');
      } else if (entry.isFile()) {
        if (privateFiles.test(relative) && relative !== '.env.example') throw new Error(`Private/temporary file exists; use a fresh source extraction: ${relative}`);
        found.push(relative);
      } else throw new Error(`Unsupported release entry: ${relative}`);
    }
  }
  walk(directory);
  return found.sort();
}
export function hashFiles(directory, files) {
  return new Map(files.map(relative => [relative, crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,relative))).digest('hex')]));
}
export function writeChecksumManifest(directory) {
  const files = releaseFiles(directory).filter(relative => relative !== 'SHA256SUMS.txt');
  const hashes = hashFiles(directory, files);
  fs.writeFileSync(path.join(directory,'SHA256SUMS.txt'), Array.from(hashes, ([name,hash]) => `${hash}  ${name}`).join('\n')+'\n');
  return hashes;
}
export function resolveReleaseRoot(directory) {
  const realDirectory=fs.realpathSync(directory);
  function complete(candidate) {
    for(const name of ['package.json','package-lock.json','src','views']) {
      let stat;try{stat=fs.lstatSync(path.join(candidate,name));}catch(error){if(error.code==='ENOENT')return false;throw error;}
      if(stat.isSymbolicLink() || (name.endsWith('.json')?!stat.isFile():!stat.isDirectory()))return false;
    }
    return true;
  }
  if(complete(realDirectory))return realDirectory;
  const children=fs.readdirSync(realDirectory,{withFileTypes:true});
  if(children.length===1&&children[0].isDirectory()&&!children[0].isSymbolicLink()) {
    const nested=path.join(realDirectory,children[0].name);
    if(complete(nested))return nested;
  }
  throw new Error('Expected complete root-level source or exactly one enclosing source directory.');
}
export function isolatedEnvironment(environment = process.env, scratchDirectory) {
  const result = {};
  const allowed = /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES(?:\(X86\))?|PROGRAMDATA|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|CURL_CA_BUNDLE|LANG|LC_ALL)$/i;
  for (const [name,value] of Object.entries(environment)) if (allowed.test(name)) result[name]=value;
  result.NODE_ENV='test';
  result.SEED_DEMO_DATA='false';
  result.AI_ENABLED='false';
  result.npm_config_update_notifier='false';
  if(scratchDirectory) {
    const profile=path.join(scratchDirectory,'home');
    fs.mkdirSync(profile,{recursive:true,mode:0o700});
    result.HOME=profile;
    result.USERPROFILE=profile;
    result.APPDATA=path.join(profile,'AppData','Roaming');
    result.LOCALAPPDATA=path.join(profile,'AppData','Local');
    result.TMPDIR=scratchDirectory;
    result.TMP=scratchDirectory;
    result.TEMP=scratchDirectory;
    result.npm_config_cache=path.join(scratchDirectory,'npm-cache');
    result.npm_config_userconfig=path.join(profile,'.npmrc');
    fs.writeFileSync(result.npm_config_userconfig,'',{mode:0o600});
  }
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const [command,directory,...extra]=process.argv.slice(2);if(command!=='resolve'||!directory||extra.length)throw new Error('Usage: node scripts/release-files.mjs resolve EXTRACTED_DIRECTORY');console.log(resolveReleaseRoot(directory));}
  catch(error){console.error(`Release source rejected: ${error.message}`);process.exitCode=1;}
}
