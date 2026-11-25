import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('CSP permits local image previews but not blob scripts',()=>{
  const server=read('src/server.js');
  assert.match(server,/imgSrc:\s*\[[^\]]*"blob:"/);
  assert.doesNotMatch(server,/scriptSrc:\s*\[[^\]]*"blob:"/);
});
test('selected image dimensions, decode failure, pending submit and stale events',async()=>{
  class El {
    constructor(){this.dataset={};this.hidden=true;this.handlers={};this.textContent='';}
    addEventListener(name,handler){this.handlers[name]=handler;}
    querySelector(){return null;}
    removeAttribute(){}
    focus(){}
  }
  class Input extends El {closest(){return form;}}
  class Img extends El {}
  const probes=[];
  class Probe {constructor(){probes.push(this);} }
  const form=new El(),input=new Input(),preview=new El(),image=new Img(),title=new El(),status=new El();
  const fields={'[data-product-cover-preview-image]':image,'[data-product-cover-preview-title]':title,'[data-product-cover-preview-status]':status};
  preview.querySelector=sel=>fields[sel];
  let seq=0;
  vm.runInNewContext(read('public/js/product-image-preview.js'),{
    document:{querySelector:s=>s==='[data-product-cover-input]'?input:preview},
    window:{addEventListener(){}},HTMLInputElement:Input,HTMLElement:El,HTMLImageElement:Img,Image:Probe,
    URL:{createObjectURL:()=> 'blob:fixture-'+(++seq),revokeObjectURL(){}}
  });
  const pick=async()=>{input.files=[{name:'test.png',type:'image/png',size:1569*1024}];await input.handlers.change();};
  const blocked=()=>{let stopped=false;form.handlers.submit({preventDefault(){stopped=true;}});return stopped;};
  await pick();
  assert.equal(blocked(),true);
  Object.assign(probes[0],{naturalWidth:1122,naturalHeight:1402});
  probes[0].onload();
  assert.match(status.textContent,/1122 × 1402 px/);
  assert.equal(image.src,'blob:fixture-1');
  assert.equal(blocked(),false);
  await pick();
  probes[1].onerror();
  assert.equal(blocked(),true);
  assert.doesNotMatch(status.textContent,/120 × 150/);
  await pick();
  probes[1].onerror(); // stale failure cannot invalidate a newer selection
  Object.assign(probes[2],{naturalWidth:1200,naturalHeight:1200});
  probes[2].onload();
  assert.equal(preview.dataset.previewQuality,'good');
  assert.equal(blocked(),false);
});
test('fallback handler does not take over staged upload previews',()=>{
  const source=read('public/js/image-fallback.js');
  assert.match(source,/getAttribute\('data-product-cover-preview-image'\) != null/);
  assert.match(source,/closest\('\[data-gallery-stage\]'\)/);
});
