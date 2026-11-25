import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLegacyBridge} from './bridge.mjs';
function fixture(fail=false) {
  const log=[];
  const client={async query(q){
    const text=typeof q==='string'?q:q.text;
    log.push(q);
    if(fail && text.startsWith('INSERT'))throw Error('fixture failure');
    if(text.startsWith('INSERT'))return {command:'INSERT',rowCount:1,rows:[{id:'42'}],fields:[{name:'id',dataTypeID:20}]};
    return {command:'SELECT',rowCount:0,rows:[],fields:[]};
  },release(destroy){log.push({release:true,destroy});}};
  return {log,bridge:createLegacyBridge({async connect(){return client;}})};
}
test('bound insert and returned identity',async()=>{
  const {log,bridge}=fixture();
  const result=await bridge.execute({sql:'INSERT INTO products(name) VALUES(?)',args:['test']});
  assert.equal(result.lastInsertRowid,42);
  assert.deepEqual(log.find(x=>x.text?.startsWith('INSERT')),{text:'INSERT INTO products(name) VALUES($1) RETURNING id',values:['test']});
  assert.ok(log.includes('COMMIT'));
  assert.equal(log.at(-1).release,true);
});
test('batch rolls back on error',async()=>{
  const {log,bridge}=fixture(true);
  await assert.rejects(bridge.batch([{sql:'INSERT INTO products(name) VALUES(?)',args:['test']}]),/fixture failure/);
  assert.ok(log.includes('ROLLBACK'));
  assert.ok(!log.includes('COMMIT'));
  assert.equal(log.at(-1).release,true);
});
test('batch commits once',async()=>{
  const {log,bridge}=fixture();
  const result=await bridge.batch([{sql:'INSERT INTO products(name) VALUES(?)',args:['test']},'SELECT 1']);
  assert.equal(result.length,2);
  assert.equal(log.filter(x=>x==='COMMIT').length,1);
});

test('explicit read avoids the writer advisory lock; writes still take it',async()=>{
  const {log,bridge}=fixture();
  await bridge.executeRead({sql:'SELECT value FROM settings WHERE key=?',args:['currency']});
  assert.equal(log[0],'BEGIN READ ONLY');
  assert.ok(!log.some(q=>typeof q==='string'&&q.includes('pg_advisory_xact_lock')));
  assert.ok(log.includes('COMMIT'));
  log.length=0;
  await bridge.execute({sql:'INSERT INTO products(name) VALUES(?)',args:['fixture']});
  assert.equal(log[0],'BEGIN');
  assert.ok(log.some(q=>typeof q==='string'&&q.includes('pg_advisory_xact_lock')));
});
