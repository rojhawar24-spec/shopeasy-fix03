import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
const start=appSource.indexOf('  // Run after validation/CSRF handlers');
const end=appSource.indexOf('\n\n})();',start);
assert.ok(start>0&&end>start,'submit protection must remain executable');
const submitSource=appSource.slice(start,end);

class Form extends EventTarget {
  constructor({valid=true,disabled=false}={}) {
    super();this.valid=valid;
    this.fields={idempotencyKey:'unchanged-order-key',guestAccessToken:'unchanged-guest-proof',_csrf:'unchanged-csrf',pricingQuoteId:'unchanged-quote'};
    this.originalNodes=[{text:'Place order '},{text:'→',ariaHidden:true}];
    this.control={disabled,childNodes:[...this.originalNodes],
      get textContent(){return this.childNodes.map(node=>node.text).join('');},
      set textContent(value){this.childNodes=[{text:value}];},
      replaceChildren(...nodes){this.childNodes=nodes;}};
  }
  checkValidity(){return this.valid;}
  querySelector(){return this.control;}
}
function setup(options={},locale='en') {
  const form=new Form(options);const window=new EventTarget();
  const document={documentElement:{lang:locale},querySelectorAll:()=>[form]};
  vm.runInNewContext(submitSource,{document,window,queueMicrotask},{timeout:1000});
  const show=persisted=>{const event=new Event('pageshow');Object.defineProperty(event,'persisted',{value:persisted});window.dispatchEvent(event);};
  return {form,show};
}

test('persisted history restoration restores exact button nodes and preserves server proof fields',()=>{
  const {form,show}=setup();const fields=structuredClone(form.fields);
  assert.equal(form.dispatchEvent(new Event('submit',{cancelable:true})),true);
  assert.equal(form.control.disabled,true);
  assert.equal(form.control.textContent,'Placing order…');
  assert.equal(form.dispatchEvent(new Event('submit',{cancelable:true})),false,'duplicate native submit is prevented');
  show(false);
  assert.equal(form.control.disabled,true,'non-persisted pageshow cannot release an in-flight lock');
  show(true);
  assert.equal(form.control.disabled,false);
  assert.deepEqual(form.control.childNodes,form.originalNodes);
  assert.equal(form.control.childNodes[1],form.originalNodes[1],'preserve original icon/DOM semantics');
  assert.deepEqual(form.fields,fields,'never replace idempotency, quote, CSRF or guest proof');
  assert.equal(form.dispatchEvent(new Event('submit',{cancelable:true})),true,'new user action after restoration is usable');
});

test('invalid and previously cancelled submissions do not disable controls',()=>{
  const invalid=setup({valid:false});invalid.form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(invalid.form.control.disabled,false);
  const form=new Form();form.addEventListener('submit',event=>event.preventDefault());
  vm.runInNewContext(submitSource,{document:{documentElement:{lang:'en'},querySelectorAll:()=>[form]},window:new EventTarget(),queueMicrotask});
  form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(form.control.disabled,false);
  assert.deepEqual(form.control.childNodes,form.originalNodes);
});

test('later cancellation releases only this enhancement without submitting automatically',async()=>{
  const {form}=setup();form.addEventListener('submit',event=>event.preventDefault());
  assert.equal(form.dispatchEvent(new Event('submit',{cancelable:true})),false);
  await Promise.resolve();
  assert.equal(form.control.disabled,false);
  assert.deepEqual(form.control.childNodes,form.originalNodes);
});

test('history restoration preserves an originally disabled control',()=>{
  const {form,show}=setup({disabled:true});
  form.dispatchEvent(new Event('submit',{cancelable:true}));show(true);
  assert.equal(form.control.disabled,true);
});

for(const [locale,text] of [['fr-BE','Commande en cours…'],['nl-BE','Bestelling wordt geplaatst…'],['ar','جارٍ إرسال الطلب…'],['ckb','داواکاری دادەنرێت…']]) {
  test(`pending order feedback is localized: ${locale}`,()=>{
    const {form}=setup({},locale);form.dispatchEvent(new Event('submit',{cancelable:true}));
    assert.equal(form.control.textContent,text);
  });
}

class ElementMock {
  constructor(attributes={},parent=null){this.attributes=new Map(Object.entries(attributes));this.parentElement=parent;this.children=[];}
  closest(){for(let node=this;node;node=node.parentElement)if(node.hasAttribute('data-no-translate')||node.getAttribute('contenteditable')==='true')return node;return null;}
  hasAttribute(name){return this.attributes.has(name);}
  getAttribute(name){return this.attributes.get(name);}
  setAttribute(name,value){this.attributes.set(name,value);}
  querySelectorAll(){return this.children;}
}
for(const [file,locale] of [['i18n.js','ckb'],['i18n-ckb.js','ckb'],['i18n-ar.js','ar'],['i18n-nl.js','nl-BE'],['i18n-fr.js','fr-BE']]) {
  test(`initial body translation preserves protected seller attributes: ${file}`,()=>{
    const attrs={alt:'Featured','aria-label':'Featured',title:'Featured',placeholder:'Featured','data-confirm':'Featured'};
    const body=new ElementMock();
    const protectedParent=new ElementMock({'data-no-translate':''},body);
    const editableParent=new ElementMock({contenteditable:'true'},body);
    const protectedChild=new ElementMock(attrs,protectedParent);
    const editableChild=new ElementMock(attrs,editableParent);
    const protectedSelf=new ElementMock({...attrs,'data-no-translate':''},body);
    const plain=new ElementMock(attrs,body);
    body.children=[protectedChild,editableChild,protectedSelf,plain];
    const window={};
    const document={documentElement:{lang:locale},body,createTreeWalker:()=>({nextNode:()=>false})};
    vm.runInNewContext(fs.readFileSync(new URL(`../public/js/${file}`,import.meta.url),'utf8'),{window,document,Element:ElementMock,NodeFilter:{SHOW_TEXT:4}},{timeout:1000});
    for(const name of Object.keys(attrs)) {
      assert.equal(protectedChild.getAttribute(name),'Featured',name);
      assert.equal(editableChild.getAttribute(name),'Featured',name);
      assert.equal(protectedSelf.getAttribute(name),'Featured',name);
      assert.notEqual(plain.getAttribute(name),'Featured','ordinary interface translation remains enabled');
    }
  });
}
