#!/usr/bin/env node
// Dependency-free integrity-oriented lint (not a substitute for a type checker).
// Checks committed source paths and source hygiene without requiring an npm registry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDirs=['src','scripts','public/js','test','generated','qa','vendor'];
const errors=[];
let count=0,imports=0;
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const full=path.join(dir,entry.name);
    if(entry.isSymbolicLink()) {errors.push(`Symlink in source: ${path.relative(root,full)}`); continue;}
    if(entry.isDirectory())walk(full);
    else if(entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) check(full);
  }
}
function check(file){
  count++;
  const rel=path.relative(root,file);
  const src=fs.readFileSync(file,'utf8');
  if(/^(?:<{7}|={7}|>{7})(?:\s|$)/m.test(src)) errors.push(`${rel}: unresolved conflict marker`);
  // These run-time primitives are banned by the release's existing zero-audit contract.
  if(rel.startsWith(`src${path.sep}`)||rel.startsWith(`public${path.sep}`)){
    if(/\bdebugger\s*;/.test(src)) errors.push(`${rel}: debugger statement`);
    if(/\beval\s*\(/.test(src)) errors.push(`${rel}: eval call`);
    if(/\bnew\s+Function\s*\(/.test(src)) errors.push(`${rel}: dynamic Function`);
  }
  // Static relative imports must resolve to shipped files. Do not guess about
  // dynamic module specifiers or imports inside generated string literals.
  for(const m of src.matchAll(/^[ \t]*import\s+(?:[^\n]*?\s+from\s+)?['"](\.[^'"\n]+)['"]/gm)){
    const spec=m[1]; imports++;
    const target=path.resolve(path.dirname(file),spec);
    if(!target.startsWith(root+path.sep)) {errors.push(`${rel}: import escapes release: ${spec}`);continue;}
    if(!fs.existsSync(target)&&!fs.existsSync(`${target}.js`)&&!fs.existsSync(`${target}.mjs`)&&!fs.existsSync(path.join(target,'index.js')))
      errors.push(`${rel}: import target missing: ${spec}`);
  }
}
for(const dir of sourceDirs)walk(path.join(root,dir));
for(const e of fs.readdirSync(root,{withFileTypes:true})) if(e.isFile()&&/\.(?:js|mjs|cjs)$/.test(e.name))check(path.join(root,e.name));
if(errors.length){errors.forEach(s=>process.stderr.write(`LINT ERROR ${s}\n`));process.stderr.write(`FAIL: ${errors.length} source hygiene/import issue(s).\n`);process.exitCode=1;}
else process.stdout.write(`PASS: lint hygiene on ${count} JS/MJS/CJS source files; ${imports} static relative imports resolved; no conflict markers or forbidden runtime debug primitives.\n`);
