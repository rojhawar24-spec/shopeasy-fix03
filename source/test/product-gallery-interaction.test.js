import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function harness(source, {rtl=false, count=3, motion=false}={}) {
  class Element {
    constructor(tag='div') {
      this.tag=tag; this.dataset={}; this.attrs={}; this.children=[]; this.events={}; this.matches={};
      const classes=new Set();
      this.classList={add:(...names)=>names.forEach(n=>classes.add(n)),toggle:(name,on)=>{if(on)classes.add(name);else classes.delete(name);},contains:n=>classes.has(n)};
      this.complete=true; this.naturalWidth=800; this.alt=''; this.open=false; this.animations=[];
    }
    get src(){return this.attrs.src||'';} set src(v){this.attrs.src=v;}
    getAttribute(k){return this.attrs[k]??null;}
    setAttribute(k,v){this.attrs[k]=String(v);}
    querySelector(k){return this.matches[k]||null;}
    querySelectorAll(k){return k==='[data-gallery-image]'?this.thumbs||[]:[];}
    append(...items){items.forEach(el=>{el.parentElement=this;this.children.push(el);});}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(el=>el!==this);}
    addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
    emit(type,props={}){const e={target:this,button:0,preventDefault(){this.defaultPrevented=true;},...props};for(const fn of this.events[type]||[])fn(e);return e;}
    click(){this.emit('click');}
    getBoundingClientRect(){return {left:0,right:100};}
    scrollBy(){}
    closest(){return null;}
    focus(){this.focused=true;}
    showModal(){this.open=true;}
    close(){this.open=false;this.emit('close');}
    decode(){return Promise.resolve();}
    animate(){let finish;const a={finished:new Promise(r=>{finish=r;}),cancelled:false,cancel(){this.cancelled=true;finish();},finish};this.animations.push(a);return a;}
  }
  const root=new Element(),stage=new Element(),main=new Element('img'),link=new Element('a'),dialog=new Element('dialog'),inner=new Element(),large=new Element('img'),close=new Element('button'),strip=new Element();
  root.append(stage,dialog,strip);stage.append(main,link);dialog.append(inner);inner.append(large,close);
  root.matches={'[data-product-main-image]':main,'[data-product-photo-expand]':link,'[data-product-photo-dialog]':dialog};
  dialog.matches={'[data-product-photo-large]':large,'[data-product-photo-close]':close};
  main.src='/photo-1.jpg';main.alt='Original';main.dataset.gallerySelectionUrl=main.src;
  let observer=()=>{};
  const thumbs=Array.from({length:count},(_,i)=>{const b=new Element('button');b.dataset.imageUrl='/photo-'+(i+1)+'.jpg';b.addEventListener('click',()=>{main.dataset.gallerySelectionUrl=b.dataset.imageUrl;main.src=b.dataset.imageUrl;main.alt='Photo '+(i+1);observer();});strip.append(b);return b;});
  root.thumbs=thumbs;
  const document={querySelector:s=>s==='[data-product-gallery]'?root:null,documentElement:{lang:rtl?'kmr-Arab':'en-GB',dir:rtl?'rtl':'ltr'},body:{dataset:{motion:motion?'on':'off'}},baseURI:'https://shop.example/',createElement:t=>new Element(t),createElementNS:(ns,t)=>{const el=new Element(t);el.namespaceURI=ns;return el;}};
  class MutationObserver {constructor(fn){observer=fn;}observe(){}}
  class Image extends Element {}
  new Function('document','navigator','matchMedia','MutationObserver','Image','URL',source)(document,{connection:{saveData:true}},()=>({matches:false}),MutationObserver,Image,URL);
  const nav=root.children.find(el=>el.className==='product-gallery-nav is-stage');
  const dialogNav=inner.children.find(el=>el.className==='product-gallery-nav is-dialog');
  return {root,stage,main,link,dialog,large,thumbs,nav,dialogNav,observer};
}
const source=readFileSync(new URL('../public/js/product-photo-zoom.js',import.meta.url),'utf8');

test('gallery controls sit outside the photo stage and inside the enlarged dialog, with wrapping navigation',()=>{
  const h=harness(source);
  assert.ok(h.nav);
  assert.ok(h.dialogNav);
  assert.equal(h.nav.children[1].textContent,'1 / 3');
  h.nav.children[2].click();
  assert.equal(h.main.src,'/photo-2.jpg');
  assert.equal(h.thumbs[1].getAttribute('aria-pressed'),'true');
  h.nav.children[2].click();
  h.nav.children[2].click();
  assert.equal(h.main.src,'/photo-1.jpg');
  h.nav.children[0].click();
  assert.equal(h.main.src,'/photo-3.jpg');
  h.link.click();
  assert.equal(h.dialog.open,true);
  assert.equal(h.large.src,'https://shop.example/photo-3.jpg');
  h.dialogNav.children[2].click();
  assert.equal(h.large.src,'https://shop.example/photo-1.jpg');
  h.dialog.close();
  assert.equal(h.link.focused,true);
});

test('a failed download retains the intended thumbnail and navigation index',()=>{
  const h=harness(source);
  h.thumbs[1].click();
  h.main.src='/assets/product-placeholder.svg';h.observer();
  assert.equal(h.nav.children[1].textContent,'2 / 3');
  assert.equal(h.thumbs[1].getAttribute('aria-pressed'),'true');
  assert.equal(h.link.href,'https://shop.example/assets/product-placeholder.svg');
  h.nav.children[2].click();
  assert.equal(h.main.src,'/photo-3.jpg');
});

test('variant-only photo stays distinct and the base photo remains selectable',()=>{
  const h=harness(source,{count:1});
  assert.equal(h.nav,undefined);
  h.main.dataset.gallerySelectionUrl='/variant.jpg';h.main.src='/variant.jpg';h.observer();
  assert.equal(h.thumbs[0].getAttribute('aria-pressed'),'false');
  h.thumbs[0].click();
  assert.equal(h.main.src,'/photo-1.jpg');
  assert.equal(h.thumbs[0].getAttribute('aria-pressed'),'true');
});

test('RTL keyboard and touch directions stay consistent',()=>{
  const h=harness(source,{rtl:true});
  assert.equal(h.nav.children[2].getAttribute('aria-label'),'وێنەیێ پاشێ');
  h.root.emit('keydown',{key:'ArrowLeft'});
  assert.equal(h.main.src,'/photo-2.jpg');
  h.stage.emit('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:10,clientY:20});
  h.stage.emit('pointerup',{pointerId:1,clientX:100,clientY:25});
  assert.equal(h.main.src,'/photo-3.jpg');
  h.stage.emit('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:2,clientX:10,clientY:20});
  h.stage.emit('pointercancel',{pointerId:2});
  h.stage.emit('pointerup',{pointerId:2,clientX:100,clientY:25});
  assert.equal(h.main.src,'/photo-3.jpg');
});

test('rapid photo changes cancel obsolete overlays and keep only the current transition',async()=>{
  const h=harness(source,{motion:true});
  h.thumbs[1].click();
  await Promise.resolve();
  const old=h.stage.children.find(el=>el.className==='product-gallery-outgoing');
  assert.ok(old);
  const oldAnimation=old.animations[0];
  assert.ok(oldAnimation);
  h.thumbs[2].click();
  assert.equal(oldAnimation.cancelled,true);
  await Promise.resolve();
  const fresh=h.stage.children.find(el=>el.className==='product-gallery-outgoing');
  assert.ok(fresh);
  assert.notEqual(fresh,old);
  assert.equal(h.stage.children.filter(el=>el.className==='product-gallery-outgoing').length,1);
  fresh.animations[0].finish();
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(h.stage.children.filter(el=>el.className==='product-gallery-outgoing').length,0);
  assert.equal(h.main.src,'/photo-3.jpg');
});
