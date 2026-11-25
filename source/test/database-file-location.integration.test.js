import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isolatedEnvironment} from '../scripts/release-files.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('explicit file databases create their actual parent and leave source/data absent',async t=>{
  for(const kind of ['absolute','relative','memory'])await t.test(kind,()=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-database-location-'));
    try {
      const runtime=path.join(directory,'source');fs.mkdirSync(path.join(runtime,'src'),{recursive:true});
      fs.copyFileSync(path.join(root,'package.json'),path.join(runtime,'package.json'));
      for(const name of ['database.js','local-sqlite-transaction-queue.js'])fs.copyFileSync(path.join(root,'src',name),path.join(runtime,'src',name));
      fs.symlinkSync(path.join(root,'node_modules'),path.join(runtime,'node_modules'),process.platform==='win32'?'junction':'dir');
      const target=kind==='absolute'?path.join(directory,'selected folder','deep','fixture.db'):path.join(runtime,'selected','deep','fixture.db');
      const url=kind==='absolute'?pathToFileURL(target).href:kind==='relative'?'file:./selected/deep/fixture.db':'file::memory:';
      const environment=isolatedEnvironment(process.env,path.join(directory,'profile'));
      environment.DATABASE_URL=url;
      const probe=path.join(runtime,'probe.mjs');
      fs.writeFileSync(probe,`import {db} from './src/database.js';\nawait db.execute('CREATE TABLE proof(value INTEGER)');\nawait db.execute('INSERT INTO proof VALUES(42)');\nconst value=(await db.execute('SELECT value FROM proof')).rows[0].value;\nawait db.close();\nconsole.log(JSON.stringify({value}));\n`);
      const result=spawnSync(process.execPath,[probe],{cwd:runtime,env:environment,encoding:'utf8',timeout:15000});
      assert.equal(result.status,0,'isolated database creation must succeed');
      assert.deepEqual(JSON.parse(result.stdout.trim()),{value:42});
      assert.equal(fs.existsSync(path.join(runtime,'data')),false,'explicit database must not create source/data');
      if(kind!=='memory')assert.equal(fs.statSync(target).isFile(),true);
    }finally{fs.rmSync(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});}
  });
});
