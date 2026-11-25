import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/admin-settings-ux.js', import.meta.url), 'utf8');

function settingsPage(initialEntries = [['legalName','Roj’s shop'],['businessAddress','London']]) {
  let entries = initialEntries;
  const formEvents = new Map();
  const windowEvents = new Map();
  const attributes = new Map();
  const state = { textContent:'' };
  const help = { textContent:'' };
  const button = { textContent:'Save settings', disabled:false };
  const form = {
    dataset:{},
    querySelector:selector=>({ '[data-save-state]':state, '[data-save-help]':help, '[data-save-button]':button })[selector],
    addEventListener:(name,callback)=>formEvents.set(name,callback),
    setAttribute:(name,value)=>attributes.set(name,value),
    removeAttribute:name=>attributes.delete(name),
    reportValidity:()=>true
  };
  vm.runInNewContext(source,{
    document:{querySelector:selector=>selector==='[data-settings-form]'?form:null},
    window:{addEventListener:(name,callback)=>windowEvents.set(name,callback)},
    FormData:class { entries() { return entries[Symbol.iterator](); } }
  });
  return {
    form,state,button,attributes,
    change(next){entries=next;formEvents.get('input')();},
    submit(){const event={prevented:false,preventDefault(){this.prevented=true;}};formEvents.get('submit')(event);return event;},
    restore(){windowEvents.get('pageshow')({persisted:true});},
    unload(){const event={prevented:false,preventDefault(){this.prevented=true;}};windowEvents.get('beforeunload')(event);return event;}
  };
}

test('settings dirty detection keeps literal delimiters inside their own fields',()=>{
  const page=settingsPage([['legalName','a&businessAddress=b'],['businessAddress','c']]);
  page.change([['legalName','a'],['businessAddress','b&businessAddress=c']]);
  assert.equal(page.form.dataset.dirty,'true');
  assert.equal(page.state.textContent,'Unsaved changes');
  assert.equal(page.unload().prevented,true);
});

test('Back/Forward restoration unlocks a submitted settings form for another save',()=>{
  const page=settingsPage();
  page.change([['legalName','Updated shop'],['businessAddress','London']]);
  assert.equal(page.submit().prevented,false);
  assert.equal(page.button.disabled,true);
  assert.equal(page.attributes.get('aria-busy'),'true');
  assert.equal(page.submit().prevented,true,'concurrent submit is still blocked');
  page.restore();
  assert.equal(page.button.disabled,false);
  assert.equal(page.attributes.has('aria-busy'),false);
  assert.equal(page.state.textContent,'Unsaved changes');
  assert.equal(page.unload().prevented,true,'unsaved-change protection survives restoration');
  assert.equal(page.submit().prevented,false,'restored controls must permit a fresh submit');
});

test('rotating only the security token does not mark settings as edited',()=>{
  const page=settingsPage([['_csrf','old'],['legalName','Roj’s shop']]);
  page.change([['_csrf','new'],['legalName','Roj’s shop']]);
  assert.equal(page.form.dataset.dirty,'false');
  assert.equal(page.unload().prevented,false);
});
