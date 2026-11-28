import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/js/cart-studio.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');

function cartHarness(source,{dialogSupported=true,motion=true}={}){
  class Element{
    constructor(){this.attrs={};this.events={};this.dataset={};this.matches={};this.lists={};this.disabled=false;this.hidden=false;this.readOnly=false;this.focused=false;this.classes=new Set();this.classList={add:(...ns)=>ns.forEach(n=>this.classes.add(n)),remove:(...ns)=>ns.forEach(n=>this.classes.delete(n)),toggle:(n,on)=>on?this.classes.add(n):this.classes.delete(n)};}
    querySelector(s){return this.matches[s]||null;}
    querySelectorAll(s){return this.lists[s]||[];}
    addEventListener(type,fn,capture=false){(this.events[type]??=[]).push({fn,capture});}
    emit(type,props={}){const e={target:this,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};for(const item of [...(this.events[type]||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){item.fn(e);if(e.stopped)break;}return e;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    removeAttribute(k){delete this.attrs[k];}
    focus(){this.focused=true;}
    closest(s){return this.matches[s]||null;}
    animate(){this.animated=true;}
    click(){if(!this.disabled)this.emit('click');}
  }
  class Form extends Element {
    constructor(){super();this.posts=[];}
    requestSubmit(submitter){const e=this.emit('submit',{submitter});if(!e.defaultPrevented)this.posts.push(submitter?.disabled?'disabled':submitter?.value||'quantity');return e;}
    submit(){this.posts.push('native');}
  }
  const root=new Element(),status=new Element(),checkout=new Element(),dialog=new Element(),confirm=new Element(),cancel=new Element(),desc=new Element(),coupon=new Form(),apply=new Element(),removeCode=new Element();
  root.dataset={savingText:'Saving',pendingText:'Save or revert',oneText:'Other change'};
  root.matches={'[data-cart-studio-status]':status,'[data-cart-studio-checkout]':checkout};
  apply.value='apply';removeCode.value='remove';
  function row(name){
    const item=new Element(),form=new Form(),remove=new Form(),input=new Element(),save=new Element(),revert=new Element(),minus=new Element(),plus=new Element(),removeButton=new Element();
    input.value=input.defaultValue='2';input.min='1';input.max='5';
    Object.defineProperty(input,'valueAsNumber',{get(){return input.value===''?NaN:Number(input.value);}});
    input.checkValidity=()=>Number.isInteger(input.valueAsNumber)&&input.valueAsNumber>=1&&input.valueAsNumber<=5;
    form.matches={'input[name=quantity]':input,'button[type=submit]':save,'[data-cart-quantity-revert]':revert};
    form.lists['[data-cart-qty-step]']=[minus,plus];
    for(const [b,d] of [[minus,-1],[plus,1]]){b.dataset.cartQtyStep=String(d);b.matches['[data-cart-qty-step]']=b;}
    item.matches['[data-cart-studio-quantity]']=form;
    remove.matches={'button':removeButton,'.cart-studio-item':item};
    remove.dataset={itemName:name,itemVariant:'Blue · M'};
    return {item,form,remove,input,save,revert,minus,plus,removeButton};
  }
  const a=row('A'),b=row('B');
  root.lists={'[data-cart-studio-quantity]':[a.form,b.form],'[data-cart-remove]':[a.remove,b.remove],'.coupon-form':[coupon],'[data-cart-remove] button, .coupon-form button':[a.removeButton,b.removeButton,apply,removeCode],'.is-saving,.is-removing':[a.item,b.item,a.form,b.form,a.remove,b.remove,coupon]};
  dialog.matches={'[data-cart-remove-confirm]':confirm,'[data-cart-remove-cancel]':cancel,'[data-cart-remove-description]':desc};
  if(dialogSupported)dialog.showModal=()=>{dialog.open=true;};
  dialog.close=()=>{dialog.open=false;dialog.emit('close');};
  const document={body:{dataset:{motion:motion?'on':'off'}},querySelector:s=>s==='[data-cart-studio]'?root:s==='[data-cart-remove-dialog]'?dialog:null};
  const window=new Element();
  new Function('document','window','matchMedia','HTMLFormElement','queueMicrotask',source)(document,window,()=>({matches:false}),Form,queueMicrotask);
  return {a,b,root,status,checkout,dialog,confirm,cancel,desc,coupon,apply,removeCode,window};
}
test('editing one quantity locks the other row and protects all conflicting actions',()=>{
  const h=cartHarness(source);
  h.a.input.value='4';h.a.input.emit('input');
  assert.equal(h.a.revert.hidden,false);
  assert.equal(h.a.save.disabled,false);
  assert.equal(h.b.input.readOnly,true);
  assert.equal(h.b.plus.disabled,true);
  assert.equal(h.checkout.emit('click').defaultPrevented,true);
  assert.equal(h.b.remove.requestSubmit(h.b.removeButton).defaultPrevented,true);
  assert.equal(h.dialog.open,undefined);
  assert.equal(h.coupon.requestSubmit(h.apply).defaultPrevented,true);
  h.a.revert.click();
  assert.equal(h.a.input.value,'2');
  assert.equal(h.b.input.readOnly,false);
  assert.equal(h.a.revert.hidden,true);
  assert.equal(h.checkout.emit('click').defaultPrevented,false);
});
test('quantity step posts once and blocks another mutation during navigation',()=>{
  const h=cartHarness(source);
  h.a.form.emit('click',{target:h.a.plus});
  assert.equal(h.a.input.value,'3');
  assert.equal(h.a.form.posts.length,1);
  assert.equal(h.a.input.animated,true);
  assert.equal(h.root.attrs['aria-busy'],'true');
  h.a.form.emit('click',{target:h.a.plus});
  assert.equal(h.a.form.posts.length,1);
  assert.equal(h.b.removeButton.disabled,true);
  assert.equal(h.coupon.requestSubmit(h.removeCode).defaultPrevented,true);
  assert.equal(h.checkout.emit('click').defaultPrevented,true);
  h.window.emit('pageshow',{persisted:true});
  assert.equal(h.root.attrs['aria-busy'],undefined);
  assert.equal(h.a.revert.disabled,false);
});
test('confirmation cancels without POST and confirms the selected variant only once',()=>{
  const h=cartHarness(source);
  h.a.remove.requestSubmit(h.a.removeButton);
  assert.equal(h.dialog.open,true);
  assert.equal(h.desc.textContent,'A — Blue · M');
  h.cancel.click();
  assert.equal(h.a.remove.posts.length,0);
  assert.equal(h.a.removeButton.focused,true);
  h.a.remove.requestSubmit(h.a.removeButton);
  h.confirm.click();h.confirm.click();
  assert.equal(h.a.remove.posts.join(','),'native');
  assert.equal(h.b.remove.posts.length,0);
  assert.ok(h.a.item.classes.has('is-removing'));
  assert.equal(h.root.attrs['aria-busy'],'true');
});
test('coupon action remains enabled for native POST and cancelled submission unlocks the bag',async()=>{
  const h=cartHarness(source);
  h.coupon.addEventListener('submit',e=>e.preventDefault());
  h.coupon.requestSubmit(h.removeCode);
  assert.equal(h.removeCode.disabled,false);
  assert.equal(h.apply.disabled,true);
  await Promise.resolve();
  assert.equal(h.apply.disabled,false);
  assert.equal(h.root.attrs['aria-busy'],undefined);
  const next=cartHarness(source);
  next.coupon.requestSubmit(next.removeCode);
  assert.equal(next.coupon.posts.join(','),'remove');
});
test('native removal confirmation remains usable without dialog support',async()=>{
  const h=cartHarness(source,{dialogSupported:false});
  h.a.remove.addEventListener('submit',e=>e.preventDefault());
  h.a.remove.requestSubmit(h.a.removeButton);
  await Promise.resolve();
  assert.equal(h.a.remove.posts.length,0);
  assert.equal(h.a.removeButton.disabled,false);
  assert.equal(h.root.attrs['aria-busy'],undefined);
});
function noticeHarness(app,{motion=true,reduced=false,focused=true}={}){
  const events={},closeEvents={},continueEvents={},animation={};
  let finishAnimation;
  const close={hidden:true,addEventListener:(s,f)=>closeEvents[s]=f};
  const link={addEventListener:(s,f)=>continueEvents[s]=f};
  const main={attrs:{},hasAttribute(k){return k in this.attrs;},setAttribute(k,v){this.attrs[k]=v;},focus(){this.focused=true;}};
  const notice={hidden:false,contains:x=>x===close,querySelector:s=>s==='[data-cart-confirmation-close]'?close:link,addEventListener:(s,f)=>events[s]=f,classList:{add(){}},animate(frames,options){animation.frames=frames;animation.options=options;return {finished:new Promise(r=>finishAnimation=r)};}};
  const document={body:{dataset:{motion:motion?'on':'off'}},activeElement:focused?close:main,getElementById:()=>main,querySelectorAll:()=>[notice]};
  const begin=app.indexOf('// CART CONFIRMATION START'),end=app.indexOf('// CART CONFIRMATION END');
  if(begin<0||end<=begin)throw Error('Missing confirmation behavior');
  new Function('document','matchMedia',app.slice(begin,end))(document,query=>({matches:query.includes('reduced-motion')&&reduced}));
  return {close,notice,main,animation,closeEvents,continueEvents,events,finish:()=>finishAnimation?.()};
}
test('bag notice animates dismissal once and preserves modified-link navigation',async()=>{
  const h=noticeHarness(app);
  let prevented=false;
  h.continueEvents.click({button:0,ctrlKey:true,preventDefault(){prevented=true;}});
  assert.equal(prevented,false);
  h.closeEvents.click();
  assert.equal(h.notice.hidden,false);
  assert.equal(h.animation.options.duration,180);
  h.finish();
  await Promise.resolve();
  assert.equal(h.notice.hidden,true);
  assert.equal(h.main.focused,true);
});
test('reduced-motion bag notice dismisses immediately via Escape',()=>{
  const h=noticeHarness(app,{reduced:true});
  let prevented=false;
  h.events.keydown({key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(h.notice.hidden,true);
  assert.equal(h.animation.options,undefined);
});
