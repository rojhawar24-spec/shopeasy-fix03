import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');

test('render helper never overrides live session/request locals with empty defaults',()=>{
  const start=server.indexOf('function render(res,view,data={})');
  assert.notEqual(start,-1,'render helper must exist');
  const end=server.indexOf('\nfunction localRedirect',start);
  assert.notEqual(end,-1,'render helper boundary must exist');
  const source=server.slice(start,end);
  for(const forbidden of ["currency:'EUR'","locale:'en'","csrf:''","isLoggedIn:false","user:null","wishlistCount:0","cartCount:0"]){
    assert.equal(source.includes(forbidden),false,`render helper must not hard-code ${forbidden}`);
  }
  assert.match(source,/\.\.res\.locals\s*\}/,'live res.locals must have final precedence');

  const helper = Function(`${source}\nreturn render;`)();
  const calls=[];
  const res={locals:{csrf:'LIVE-CSRF',locale:'ckb',isLoggedIn:true,user:{id:7,role:'manager'},wishlistCount:3,cartCount:2,currency:'IQD'},render:(view,options)=>calls.push({view,options})};
  helper(res,'login',{title:'Sign in'});
  const options=calls[0]?.options;
  assert.equal(options.csrf,'LIVE-CSRF');
  assert.equal(options.locale,'ckb');
  assert.equal(options.isLoggedIn,true);
  assert.deepEqual(options.user,{id:7,role:'manager'});
  assert.equal(options.wishlistCount,3);
  assert.equal(options.cartCount,2);
  assert.equal(options.currency,'IQD');
  assert.equal(options.title,'Sign in');
});
