import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
test('public autocomplete avoids private session middleware and retains both limiters',()=>{
 const start=s.indexOf("if(isPostgresPreview) app.get('/api/search',searchLimiter");
 assert.ok(start>s.indexOf('app.use(generalLimiter);'));
 assert.ok(start<s.indexOf('app.use(attachAuth)'));
 const route=s.slice(start,s.indexOf('\n});',start)+4);
 assert.match(route,/private, no-store/);
 assert.match(route,/feature_autocomplete_enabled/);
 assert.match(route,/onlyActive:true,limit:6/);
 assert.doesNotMatch(route,/req\.user|req\.session/);
});
test('immutable preview caches compiled templates, not personalized HTML',()=>{
 assert.ok(s.includes("if(isPostgresPreview) app.enable('view cache')"));
 assert.ok(s.includes("private, no-store, max-age=0"));
});
