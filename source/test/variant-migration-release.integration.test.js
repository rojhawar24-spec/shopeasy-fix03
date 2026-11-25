import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn,spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const root=fileURLToPath(new URL('../',import.meta.url));
const helper=fileURLToPath(new URL('./helpers/r27-variant-migration-fixture.mjs',import.meta.url));

function fixtureRun(mode,database,stock) {
  const result=spawnSync(process.execPath,[helper,mode,database,...(stock===undefined?[]:[String(stock)])],{
    cwd:root,encoding:'utf8',timeout:30000,
    env:{...process.env,R27_MIGRATION_GATE:'0'}
  });
  assert.equal(result.error,undefined,'fixture child must complete before its watchdog');
  return {status:result.status,result:JSON.parse(result.stdout.trim())};
}
function assertCompositeRows(database) {
  const db=new DatabaseSync(database);
  try {
    const row=db.prepare('SELECT id,product_id,stock,reserved_stock FROM product_variants WHERE id=17').get();
    assert.deepEqual({...row},{id:17,product_id:1,stock:2,reserved_stock:0});
    const insert=db.prepare('INSERT INTO product_variants(product_id,option_value,option_value_2,sku,stock) VALUES(?,?,?,?,?)');
    insert.run(row.product_id,'M','Blue','MIGRATION-BLUE',3);
    assert.throws(()=>insert.run(row.product_id,'M','Blue','MIGRATION-BLUE-DUPLICATE',3),/UNIQUE/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_variants').get().count,2);
  } finally {db.close();}
}
function gatedImport(database) {
  const child=spawn(process.execPath,[helper,'import',database],{
    cwd:root,env:{...process.env,R27_MIGRATION_GATE:'1'},stdio:['ignore','pipe','pipe','ipc']
  });
  let output='';
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{output+=data;});
  child.stderr.resume();
  let readyResolve;let readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  child.on('message',message=>{if(message?.waiting_for_migration_write) readyResolve();});
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
  const done=new Promise((resolve,reject)=>{
    child.once('error',error=>{readyReject(error);reject(error);});
    child.once('exit',(status,signal)=>{
      clearTimeout(timer);
      if(signal||status!==0) {
        const error=new Error(`Migration fixture did not complete: status=${status}, signal=${signal}`);
        readyReject(error);reject(error);return;
      }
      try {resolve(JSON.parse(output.trim()));}
      catch(error) {readyReject(error);reject(error);}
    });
  });
  // A child can fail before the caller awaits done while another child starts.
  done.catch(()=>{});
  return {child,ready,done,acquire:()=>child.send({operation:'acquire-migration-lock'})};
}

test('actual legacy variant startup migration preserves rows and installs composite uniqueness',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-migration-valid-'));
  const database=path.join(directory,'shop.db');
  try {
    assert.deepEqual(fixtureRun('prepare',database,2),{status:0,result:{prepared:true}});
    const imported=fixtureRun('import',database);
    assert.equal(imported.status,0);
    assert.equal(imported.result.import_resolved,true);
    assert.equal(imported.result.composite_schema,true);
    assert.deepEqual(imported.result.row,{id:17,product_id:1,stock:2,reserved_stock:0});
    assertCompositeRows(database);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('actual failed legacy copy rejects startup and preserves the original schema and row',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-migration-failed-'));
  const database=path.join(directory,'shop.db');
  try {
    assert.equal(fixtureRun('prepare',database,-1).status,0);
    const imported=fixtureRun('import',database);
    assert.equal(imported.status,1,'startup must reject, rather than silently resolve after rollback');
    assert.equal(imported.result.import_resolved,false);
    assert.equal(imported.result.constraint_failure,true);
    const db=new DatabaseSync(database);
    try {
      const schema=db.prepare("SELECT sql FROM sqlite_master WHERE name='product_variants'").get().sql;
      assert.match(schema,/UNIQUE\s*\(\s*product_id\s*,\s*option_value\s+COLLATE\s+NOCASE\s*\)/i);
      assert.equal(db.prepare('SELECT stock FROM product_variants WHERE id=17').get().stock,-1);
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name='product_variants_v289_migration'").get().count,0);
    } finally {db.close();}
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('a second actual startup rechecks a migration completed while waiting for the write lock',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-migration-race-'));
  const database=path.join(directory,'shop.db');
  let first;let second;
  try {
    assert.equal(fixtureRun('prepare',database,2).status,0);
    first=gatedImport(database);second=gatedImport(database);
    // Both imports have observed legacy schema before their migration transaction.
    await Promise.all([first.ready,second.ready]);
    first.acquire();
    const firstResult=await first.done;
    assert.equal(firstResult.composite_schema,true);
    assert.equal(firstResult.rebuild_count,1);
    second.acquire();
    const secondResult=await second.done;
    assert.equal(secondResult.composite_schema,true);
    assert.equal(secondResult.rebuild_count,0,'completed schema must be rechecked inside the acquired write transaction');
    assertCompositeRows(database);
  } finally {
    if(first&&!first.child.killed) first.child.kill('SIGTERM');
    if(second&&!second.child.killed) second.child.kill('SIGTERM');
    await Promise.allSettled([first?.done,second?.done]);
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
