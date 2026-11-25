import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import createTaskLimiter from 'promise-limit';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('installed override resolves only to the new first-party component in both module formats',async()=>{
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'node_modules/promise-limit/package.json'),'utf8'));
  assert.equal(metadata.name,'@shopeasy/task-limit');assert.equal(metadata.version,'1.0.0');assert.equal(metadata.license,'UNLICENSED');
  assert.equal(fs.realpathSync(require.resolve('promise-limit')),fs.realpathSync(path.join(root,'vendor/promise-limit/index.cjs')));
  assert.equal(require('promise-limit'),createTaskLimiter);
});

test('FIFO admission observes the capacity and preserves task values',async()=>{
  const limit=createTaskLimiter(2),starts=[],gates=[];let active=0,peak=0;
  const tasks=Array.from({length:6},(_,index)=>limit(async()=>{
    active++;peak=Math.max(peak,active);starts.push(index);
    await new Promise(resolve=>{gates[index]=resolve;});active--;return index*10;
  }));
  await tick();assert.deepEqual(starts,[0,1]);assert.equal(limit.queue,4);
  gates[1]();await tick();assert.deepEqual(starts,[0,1,2]);
  gates[0]();await tick();assert.deepEqual(starts,[0,1,2,3]);
  gates[2]();gates[3]();await tick();assert.deepEqual(starts,[0,1,2,3,4,5]);
  gates[4]();gates[5]();assert.deepEqual(await Promise.all(tasks),[0,10,20,30,40,50]);
  assert.equal(peak,2);assert.equal(active,0);assert.equal(limit.queue,0);
});

test('synchronous throws, rejected tasks and rejected thenables release capacity',async()=>{
  const limit=createTaskLimiter(1),first=new Error('synthetic-first'),second=new Error('synthetic-second'),third=new Error('synthetic-third');
  const outcomes=await Promise.allSettled([
    limit(()=>{throw first;}),limit(()=>Promise.reject(second)),limit(()=>({then(){throw third;}})),limit(()=>42)
  ]);
  assert.equal(outcomes[0].reason,first);assert.equal(outcomes[1].reason,second);assert.equal(outcomes[2].reason,third);assert.deepEqual(outcomes[3],{status:'fulfilled',value:42});
  assert.equal(await limit(()=>43),43);assert.equal(limit.queue,0);
});

test('unlimited modes, invalid input and a large queue are handled without recursive overflow',async()=>{
  for(const capacity of [undefined,0,Infinity])assert.deepEqual(await Promise.all([1,2,3].map(value=>createTaskLimiter(capacity)(()=>value))),[1,2,3]);
  for(const capacity of [-1,1.5,NaN,'2',null])assert.throws(()=>createTaskLimiter(capacity),RangeError);
  const limit=createTaskLimiter(3);await assert.rejects(limit('not-a-function'),TypeError);
  assert.deepEqual(await Promise.all(Array.from({length:5000},(_,index)=>limit(()=>index))),Array.from({length:5000},(_,index)=>index));
});

for(const format of ['lib-esm','lib-cjs'])for(const transport of ['http','ws']) {
  test(`actual locked SDK ${format}/${transport} consumes the replacement with bounded tasks`,async()=>{
    const filename=path.join(root,'node_modules/@libsql/client',format,transport+'.js');
    const sdk=format==='lib-esm'?await import(pathToFileURL(filename)):require(filename);
    const client=transport==='http'
      ? sdk.createClient({url:'https://task-limit.example.test',concurrency:2,fetch:()=>{throw new Error('External requests forbidden in this test.');}})
      : new sdk.WsClient({close(){}},new URL('wss://task-limit.example.test'),undefined,'number',2);
    let active=0,peak=0;
    try {
      const result=await Promise.all(Array.from({length:10},(_,index)=>client.limit(async()=>{active++;peak=Math.max(peak,active);await tick();active--;return index;})));
      assert.deepEqual(result,Array.from({length:10},(_,index)=>index));assert.equal(peak,2);
    } finally {client.close();}
  });
}
