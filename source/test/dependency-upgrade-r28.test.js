import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import express from 'express';
import {rateLimit} from 'express-rate-limit';
import ejs from 'ejs';
import {isolatedEnvironment} from '../scripts/release-files.mjs';

test('dotenv bootstrap loads a disposable file before consumers without informational or debug output', () => {
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-quiet-env-'));
  try {
    fs.writeFileSync(path.join(scratch,'.env'),'SHOP_EVIDENCE_ENV_LOAD=synthetic-fixture\nSHOP_EVIDENCE_ENV_KEEP=from-file\n');
    const loader=new URL('../src/load-environment.js',import.meta.url).href;
    const program=path.join(scratch,'observe.mjs');
    fs.writeFileSync(program,`await import(${JSON.stringify(loader)});process.stdout.write(JSON.stringify({loaded:process.env.SHOP_EVIDENCE_ENV_LOAD==='synthetic-fixture',existing_preserved:process.env.SHOP_EVIDENCE_ENV_KEEP==='already-set'}));`);
    const environment={...isolatedEnvironment(process.env,scratch),SHOP_EVIDENCE_ENV_KEEP:'already-set',DOTENV_CONFIG_QUIET:'false',DOTENV_CONFIG_DEBUG:'true'};
    const result=spawnSync(process.execPath,[program],{cwd:scratch,env:environment,encoding:'utf8'});
    assert.ifError(result.error);assert.equal(result.status,0);assert.equal(result.stderr,'');
    assert.deepEqual(JSON.parse(result.stdout),{loaded:true,existing_preserved:true});
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
});

test('quiet dotenv bootstrap preserves configured file, encoding and explicit override options', () => {
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-env-options-'));
  try {
    fs.writeFileSync(path.join(scratch,'.env'),'SHOP_EVIDENCE_PATH=wrong-default\n');
    const configured=path.join(scratch,'configured.env');
    fs.writeFileSync(configured,Buffer.from('SHOP_EVIDENCE_PATH=configured-file\nSHOP_EVIDENCE_ENCODING=caf\xe9\nSHOP_EVIDENCE_OVERRIDE=from-file\n','latin1'));
    const loader=new URL('../src/load-environment.js',import.meta.url).href;
    const program=path.join(scratch,'observe.mjs');
    fs.writeFileSync(program,`await import(${JSON.stringify(loader)});process.stdout.write(JSON.stringify({configured_file:process.env.SHOP_EVIDENCE_PATH==='configured-file',encoding:process.env.SHOP_EVIDENCE_ENCODING==='café',override:process.env.SHOP_EVIDENCE_OVERRIDE==='from-file'}));`);
    const environment={...isolatedEnvironment(process.env,scratch),SHOP_EVIDENCE_OVERRIDE:'already-set',DOTENV_CONFIG_PATH:configured,DOTENV_CONFIG_ENCODING:'latin1',DOTENV_CONFIG_OVERRIDE:'true',DOTENV_CONFIG_QUIET:'false',DOTENV_CONFIG_DEBUG:'true'};
    const result=spawnSync(process.execPath,[program],{cwd:scratch,env:environment,encoding:'utf8'});
    assert.ifError(result.error);assert.equal(result.status,0);assert.equal(result.stderr,'');
    assert.deepEqual(JSON.parse(result.stdout),{configured_file:true,encoding:true,override:true});
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
});

test('updated EJS preserves escaped multilingual seller content and trusted relative includes', async () => {
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'shopeasy-ejs-compat-'));
  try {
    fs.writeFileSync(path.join(scratch,'part.ejs'),'<span data-no-translate><%= sellerName %></span>');
    const source='<h1><%= title %></h1><%- include("part.ejs") %>';
    const rendered=ejs.render(source,{title:'ڕۆژ العربية Français',sellerName:'<script>synthetic()</script> & "seller"'},{filename:path.join(scratch,'page.ejs')});
    assert.ok(rendered.includes('ڕۆژ العربية Français'));
    assert.ok(rendered.includes('&lt;script&gt;synthetic()&lt;/script&gt; &amp; &#34;seller&#34;'));
    assert.ok(!rendered.includes('<script>'));
    assert.ok(rendered.includes('data-no-translate'));
  } finally {fs.rmSync(scratch,{recursive:true,force:true});}
});

test('updated rate limiter enforces the configured HTTP boundary and emits modern limit headers', async () => {
  const app=express();
  app.use(rateLimit({windowMs:60000,limit:2,standardHeaders:'draft-8',legacyHeaders:false}));
  app.get('/',(_request,response)=>response.send('synthetic'));
  const server=await new Promise((resolve,reject)=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));listening.on('error',reject);});
  try {
    const url=`http://127.0.0.1:${server.address().port}/`;
    const first=await fetch(url),second=await fetch(url),third=await fetch(url);
    assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(third.status,429);
    assert.ok(first.headers.has('ratelimit-policy'));assert.ok(first.headers.has('ratelimit'));
    assert.ok(Number(third.headers.get('retry-after'))>=1);
    assert.equal(first.headers.has('x-ratelimit-limit'),false);
  } finally {await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
