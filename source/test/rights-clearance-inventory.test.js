import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
test('root license stays unlicensed until rights evidence is recorded', () => {
  const pkg=JSON.parse(read('package.json')), lock=JSON.parse(read('package-lock.json'));
  assert.equal(lock.version,pkg.version); assert.equal(lock.packages[''].version,pkg.version);
  assert.equal(pkg.private,true); assert.equal(pkg.license,'UNLICENSED'); assert.equal(lock.packages[''].license,'UNLICENSED');
  assert.match(read('LICENSE.txt'),/STATUS: DRAFT ONLY — NOT AN EFFECTIVE LICENSE/);
  assert.match(read('RIGHTS-CLEARANCE-REGISTER.md'),/OVERALL STATUS: OPEN \/ NOT CLEARED FOR COMMERCIAL RESALE/);
  assert.match(read('ASSET-PROVENANCE-REGISTER.md'),/Overall status: OPEN/i);
});
test('third-party inventory covers every locked package and marks metadata gaps', () => {
  const lock=JSON.parse(read('package-lock.json')); const inventory=read('THIRD-PARTY-NOTICES.md');
  const entries=Object.entries(lock.packages).filter(([key])=>key.startsWith('node_modules/'));
  const declaredCount=inventory.match(/Locked package entries: \*\*(\d+)\*\*/);
  assert.ok(declaredCount, 'THIRD-PARTY-NOTICES.md must declare the locked package-entry count');
  assert.equal(Number(declaredCount[1]), entries.length,
    `THIRD-PARTY-NOTICES.md count (${declaredCount[1]}) must match package-lock.json (${entries.length} node_modules entries)`);
  const rows=new Map([...inventory.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| ([^|]+) \| (yes|no) \| ([^\n]+) \|$/gm)].map(([,name,rel,version,licence,optional,source])=>[rel,{name,version,licence,optional,source}]));
  assert.equal(rows.size,entries.length,'inventory must contain one current-version row per exact lock path');
  for (const [rel,metadata] of entries) {
    const name=rel.slice(rel.lastIndexOf('node_modules/')+'node_modules/'.length);
    const row=rows.get(rel),component=metadata.link?lock.packages[metadata.resolved]:metadata;
    assert.ok(row,`inventory missing ${rel}`);
    assert.equal(row.name,name,`inventory alias/name differs for ${rel}`);
    assert.equal(row.version,component.version,`inventory version differs for ${rel}`);
    assert.ok(row.licence.includes(component.license||'NOASSERTION'),`inventory licence metadata differs for ${rel}`);
    assert.equal(row.optional,metadata.optional?'yes':'no',`inventory platform optionality differs for ${rel}`);
    assert.ok(row.source.includes(metadata.resolved),`inventory source differs for ${rel}`);
  }
  assert.match(inventory,/busboy@1\.6\.0/); assert.match(inventory,/streamsearch@1\.1\.0/);
});
