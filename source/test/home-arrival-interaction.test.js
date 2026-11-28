import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ejs from 'ejs';
import {pageText} from '../src/home-login-copy.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const retail=read('public/js/retail-2027.js'),home=read('views/home.ejs'),server=read('src/server.js');
const renderEjs=(template,locals)=>ejs.render(template,locals);

function harness(source,{checked=false,reduced=false,missing=false,legacy=false}={}){
  const events=new Map(),add=(target,event,fn)=>events.set(target+':'+event,fn);
  const style=()=>({removeProperty(k){delete this[k.replace(/-([a-z])/g,(_,s)=>s.toUpperCase())];}});
  const label={title:''};
  const pause={checked,dataset:{pauseLabel:'Pause',resumeLabel:'Resume'},closest:()=>label,addEventListener:(e,f)=>add('pause',e,f)};
  const clone={style:style(),addEventListener:(e,f)=>add('clone',e,f)};
  const track={style:style(),getBoundingClientRect:()=>({left:-160}),querySelector:()=>clone};
  const ribbon={style:style(),scrollLeft:0,scrollWidth:900,clientWidth:320,getBoundingClientRect:()=>({left:0}),querySelector:()=>track,contains:n=>n==='inside',addEventListener:(e,f)=>add('ribbon',e,f)};
  const section={querySelector:s=>s==='.arrival-ribbon'?ribbon:pause};
  const media={matches:reduced,addListener:f=>add('media','change',f)};
  if(!legacy)media.addEventListener=(e,f)=>add('media',e,f);
  const begin=source.indexOf('// HOME ARRIVALS START'),end=source.indexOf('// HOME ARRIVALS END');
  if(begin<0||end<=begin)throw new Error('Missing arrival behavior');
  new Function('q','window',source.slice(begin,end))(s=>missing?null:section,{matchMedia:()=>media});
  return {pause,clone,track,ribbon,label,media,events,emit:(target,event,data)=>events.get(target+':'+event)?.(data)};
}
function arrivalTemplate(home){
  const start=home.indexOf('<% if (newProducts && newProducts.length) {');
  const end=home.indexOf('<% if (categories',start);
  if(start<0||end<=start)throw new Error('Missing homepage arrival template');
  return home.slice(start,end);
}
function catalog(count,motion,locale='en'){
  return {appearance:{motion},locale,newProducts:Array.from({length:count},(_,i)=>({id:i+1,slug:'product-'+i,name:'Item '+i,image_url:'/images/item.jpg',price_cents:1000})),pageText:s=>s,safeImageUrl:s=>s,formatPrice:()=> '€10',effectivePrice:p=>p.price_cents,currency:'EUR'};
}

test('pause exposes one scrollable product set and resume restores the animated track',()=>{
  const h=harness(retail);
  assert.equal(h.label.title,'Pause');
  h.pause.checked=true;h.emit('pause','change');
  assert.equal(h.track.style.animation,'none');
  assert.equal(h.track.style.transform,'none');
  assert.equal(h.ribbon.style.overflowX,'auto');
  assert.equal(h.clone.style.display,'none');
  assert.equal(h.ribbon.scrollLeft,160);
  assert.equal(h.label.title,'Resume');
  h.pause.checked=false;h.emit('pause','change');
  assert.equal(h.track.style.animation,undefined);
  assert.equal(h.clone.style.display,undefined);
  assert.equal(h.ribbon.style.overflowX,undefined);
  assert.equal(h.ribbon.scrollLeft,0);
  assert.equal(h.label.title,'Pause');
});

test('reduced motion is respected on load and on preference changes',()=>{
  const h=harness(retail,{reduced:true,legacy:true});
  assert.equal(h.track.style.animation,'none');
  assert.equal(h.clone.style.display,'none');
  h.media.matches=false;h.emit('media','change');
  assert.equal(h.track.style.animation,undefined);
  h.pause.checked=true;h.emit('pause','change');
  h.media.matches=true;h.emit('media','change');
  h.media.matches=false;h.emit('media','change');
  assert.equal(h.track.style.animation,'none');
});

test('duplicate links do not steal focus and real links retain keyboard navigation',()=>{
  const h=harness(retail);let prevented=false;
  h.emit('clone','mousedown',{target:{closest:()=>true},preventDefault:()=>{prevented=true;}});
  assert.ok(prevented);
  h.ribbon.scrollLeft=80;h.emit('ribbon','focusout',{relatedTarget:'inside'});
  assert.equal(h.ribbon.scrollLeft,80);
  h.emit('ribbon','focusout',{relatedTarget:null});
  assert.equal(h.ribbon.scrollLeft,0);
  h.pause.checked=true;h.emit('pause','change');
  h.ribbon.scrollLeft=90;h.emit('ribbon','focusout',{relatedTarget:null});
  assert.equal(h.ribbon.scrollLeft,90);
  assert.equal(harness(retail,{missing:true}).events.size,0);
});

test('arrival template handles zero, one and five products without duplicate static cards',()=>{
  const render=(count,motion,locale)=>renderEjs(arrivalTemplate(home),catalog(count,motion,locale));
  assert.equal(render(0,true).includes('id="new-arrivals"'),false);
  const one=render(1,true);
  assert.equal((one.match(/class="home-arrival-tile/g)||[]).length,1);
  assert.equal(one.includes('data-arrival-pause'),false);
  const five=render(5,true,'kmr');
  assert.equal((five.match(/class="home-arrival-tile/g)||[]).length,10);
  assert.equal((five.match(/data-arrival-copy/g)||[]).length,1);
  assert.ok(five.includes('data-arrival-pause'));
  assert.ok(five.includes('class="arrival-caption" dir="rtl"'));
  const still=render(5,false);
  assert.equal((still.match(/class="home-arrival-tile/g)||[]).length,5);
  assert.ok(still.includes('class="home-arrival-grid"'));
  assert.equal(still.includes('data-arrival-pause'),false);
  assert.equal(still.includes('class="arrival-ribbon-track"'),false);
});

test('home arrivals are capped at five and localized in six languages',()=>{
  assert.ok(server.includes('const newProducts=latestProducts.filter(isRecentlyAddedProduct).slice(0,5);'));
  for(const locale of ['en','nl','fr','ar','ckb','kmr']){
    for(const key of ['JUST ADDED','New in the shop','See all products →','NEW','Pause animation','Resume animation']){
      const value=pageText(locale,key);
      assert.ok(typeof value==='string' && value.trim(),locale+' '+key);
      if(locale!=='en')assert.notEqual(value,key,locale+' untranslated: '+key);
    }
  }
});
