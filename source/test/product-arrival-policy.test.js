import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeNewArrivalInput, validStoredArrival, defaultArrivalStart, productArrivalKey } from '../src/product-arrival-policy.js';
import { compileLegacyQuery } from '../postgres/legacy-query.mjs';
import { createClient } from '@libsql/client';
const now=new Date('2026-11-28T12:00:00.000Z');
const day=86400000;
test('arrival duration is anchored to the saved instant, not edited repeatedly',()=>{
  for(const days of [3,7,14,30,60])assert.equal(Date.parse(normalizeNewArrivalInput(String(days),undefined,now)),now.getTime()+days*day);
  assert.equal(normalizeNewArrivalInput('keep','invalid',now),undefined);
  assert.equal(normalizeNewArrivalInput(undefined,undefined,now),undefined);
  assert.equal(normalizeNewArrivalInput('automatic',undefined,now),'automatic');
  assert.equal(normalizeNewArrivalInput('forever',undefined,now),'forever');
  assert.equal(normalizeNewArrivalInput('off',undefined,now),'off');
});
test('custom duration and stored metadata reject malformed or duplicate inputs',()=>{
  for(const days of [1,3650])assert.equal(Date.parse(normalizeNewArrivalInput('custom',String(days),now)),now.getTime()+days*day);
  for(const [mode,days] of [['custom','0'],['custom','3651'],['custom','1.5'],['custom',['7','14']],[['off','forever'],undefined],['unknown','7'],['custom',' 7']])assert.throws(()=>normalizeNewArrivalInput(mode,days,now),/NEW_ARRIVAL/);
  for(const value of [undefined,'automatic','forever','off','2026-12-01T12:00:00.000Z'])assert.equal(validStoredArrival(value),true);
  for(const value of [null,'2026-02-31T12:00:00.000Z','invalid',5])assert.equal(validStoredArrival(value),false);
  assert.equal(productArrivalKey(42),'product_new_42');
  assert.throws(()=>productArrivalKey('bad'),/NEW_ARRIVAL/);
  assert.equal(defaultArrivalStart(now),'2026-10-29T12:00:00.000Z');
});
test('actual catalogue arrival SQL filters before limiting and supports PostgreSQL compilation',async()=>{
  const source=readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
  const begin=source.indexOf('  const arrivalJoin = newOnly');
  const end=source.indexOf("  if (status === 'active')",begin);
  assert.ok(begin>=0&&end>begin);
  const conditions=[],params={catalogNow:now.toISOString()};
  const join=new Function('newOnly','now','conditions','params','defaultArrivalStart',source.slice(begin,end)+'\nreturn arrivalJoin;')(true,now,conditions,params,defaultArrivalStart);
  const query='SELECT p.id FROM products p '+join+' WHERE '+conditions.join(' AND ')+' ORDER BY p.created_at DESC,p.id DESC LIMIT 5';
  const client=createClient({url:':memory:'});
  try{
    await client.executeMultiple('CREATE TABLE products(id INTEGER PRIMARY KEY,active INTEGER,created_at TEXT); CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);');
    const products=[[1,1,'2026-11-27T00:00:00.000Z'],[2,1,'2026-01-01T00:00:00.000Z'],[3,1,'2026-11-26T00:00:00.000Z'],[4,1,'2026-01-02T00:00:00.000Z'],[5,0,'2026-11-28T00:00:00.000Z'],[6,1,'2026-11-25T00:00:00.000Z'],[7,1,'2026-11-24T00:00:00.000Z'],[8,1,'2026-11-29T00:00:00.000Z'],[9,1,'2026-10-29T12:00:00.000Z'],[10,1,'2026-01-03T00:00:00.000Z']];
    for(const args of products)await client.execute({sql:'INSERT INTO products VALUES(?,?,?)',args});
    for(const [id,value] of [[2,'forever'],[3,'off'],[4,'2026-12-01T00:00:00.000Z'],[5,'forever'],[6,'2026-11-28T12:00:00.000Z'],[7,'automatic'],[10,'off']])await client.execute({sql:'INSERT INTO settings VALUES(?,?)',args:[productArrivalKey(id),value]});
    const rows=await client.execute({sql:query,args:params});
    assert.deepEqual(rows.rows.map(row=>Number(row.id)),[1,7,9,4,2]);
    const pg=compileLegacyQuery(query,params,{runtime:true});
    assert.ok(pg.text.includes('shopeasy.sqlite_julianday('));
    assert.deepEqual(pg.values,[params.catalogNow,params.arrivalStart]);
    assert.ok(source.includes('data.newArrivalValue!==undefined'));
    assert.ok(source.includes('[productArrivalKey(savedId),data.newArrivalValue],tx)'));
  }finally{client.close();}
});
