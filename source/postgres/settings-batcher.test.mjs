import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsBatcher} from './settings-batcher.mjs';
test('parallel settings reads deduplicate and do not retain old values',async()=>{
  const calls=[];
  const values=new Map([['currency','EUR'],['empty','']]);
  const read=createSettingsBatcher(async keys=>{calls.push(keys);return values;});
  assert.deepEqual(await Promise.all([read('currency'),read('currency'),read('missing','one'),read('missing','two'),read('empty','fallback')]),['EUR','EUR','one','two','']);
  assert.deepEqual(calls,[['currency','missing','empty']]);
  values.set('currency','USD');
  assert.equal(await read('currency'),'USD');
  assert.equal(calls.length,2);
});
test('batch size bounded and failure rejects all affected readers',async()=>{
  const sizes=[];
  const read=createSettingsBatcher(async keys=>{sizes.push(keys.length);return new Map();});
  await Promise.all(Array.from({length:130},(_,i)=>read('k'+i,'x')));
  assert.deepEqual(sizes,[64,64,2]);
  const broken=createSettingsBatcher(async()=>{throw Error('db unavailable');});
  const result=await Promise.allSettled([broken('a'),broken('b')]);
  assert.ok(result.every(x=>x.status==='rejected'));
});
