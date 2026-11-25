import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/js/i18n-fr.js',import.meta.url),'utf8');
const match=/const dictionary\s*=\s*(\{.*?\});\s*const normalizeWhitespace/s.exec(source);
assert.ok(match,'French locale dictionary must remain present and parseable');
const french=JSON.parse(match[1]).fr;
const sharedTerms=new Set([
  '123456','{count} options','{count}/50','/ 6 images','+ Stock','03 · STOCK','04 · IMAGE',
  'Action','Actions','Audit','CATALOGUE','Code','Code *','Collection','COLLECTION','COMMERCE',
  'Contact','Cookies','Date','Description','Marketing','Minimum','OK','Option 1','Option 2',
  'options','Page','Page {page}','PROMOTIONS','S, M, L','Stock','Story','total','Total','Type','العربية'
]);
const placeholders=text=>[...text.matchAll(/<%=\s*[^%]+?\s*%>|\{[A-Za-z][\w]*\}/g)].map(m=>m[0]).sort();

test('FIX9: French runtime dictionary has every expected phrase and non-empty translation',()=>{
  assert.equal(Object.keys(french).length,1829);
  for(const [key,value] of Object.entries(french)){
    assert.equal(typeof value,'string',`translation type for ${key}`);
    assert.ok(value.trim(),`empty translation for ${key}`);
  }
});

test('FIX9: all 1829 French phrases retain dynamic substitution placeholders',()=>{
  for(const [key,value] of Object.entries(french))
    assert.deepEqual(placeholders(value),placeholders(key),`placeholder mismatch in ${JSON.stringify(key)}`);
});

test('FIX9: French copy does not have accidentally untranslated English beyond shared terms',()=>{
  const remaining=Object.entries(french).filter(([key,value])=>key===value && !sharedTerms.has(key));
  assert.deepEqual(remaining,[]);
  assert.ok(Object.values(french).some(v=>v.includes('Panier')));
  assert.ok(Object.values(french).some(v=>v.includes('Commande')));
});

test('FIX9: existing browser locale switching and safe DOM text replacement stay intact',()=>{
  assert.match(source,/document\.documentElement\.lang/);
  assert.match(source,/pageLang\.startsWith\('fr'\)/);
  assert.doesNotMatch(source,/<\/script\b/i);
  assert.match(source,/normalizeWhitespace/);
});
