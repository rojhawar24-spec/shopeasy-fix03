(()=>{'use strict';
const allowed=new Set(['image/jpeg','image/png','image/webp']);
document.querySelectorAll('[data-easy-drop]').forEach(zone=>{
 const input=zone.querySelector('input[type=file]');if(!input)return;
 zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('is-dragging')});
 zone.addEventListener('dragleave',()=>zone.classList.remove('is-dragging'));
 zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('is-dragging');const files=[...e.dataTransfer.files];if(!files.length)return;try{const dt=new DataTransfer();files.slice(0,input.multiple?5:1).forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch{input.click();}});
 const clear=document.createElement('button');clear.type='button';clear.className='btn btn-small';clear.textContent='Clear selection';clear.hidden=true;zone.after(clear);
 input.addEventListener('change',()=>{clear.hidden=!input.files.length;});
 clear.addEventListener('click',()=>{input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));clear.hidden=true;});
});
const input=document.querySelector('[data-easy-photo]'),preview=document.querySelector('[data-easy-preview]');
if(!input||!preview)return;
let url='',generation=0,busy=false;
const form=input.closest('form');
input.addEventListener('change',async()=>{
 const token=++generation;busy=false;input.setCustomValidity('');if(url)URL.revokeObjectURL(url);preview.replaceChildren();
 let file=input.files[0];if(!file)return;
 if(!allowed.has(file.type)||!file.size){input.setCustomValidity('Choose a valid JPG, PNG or WebP photo.');preview.textContent=input.validationMessage;return;}
 busy=true;preview.textContent='Preparing photo…';
 try{
 if(file.size>2*1024*1024){const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas');const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.78));if(!blob||blob.size>2*1024*1024)throw Error('size');file=new File([blob],'category-photo.webp',{type:blob.type});if(token!==generation)return;const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;}finally{bitmap.close();}}
 if(token!==generation)return;
 url=URL.createObjectURL(file);const img=document.createElement('img');img.alt='Selected category photo';img.width=140;img.height=140;img.className='easy-photo-preview';img.src=url;await img.decode();if(token!==generation)return;preview.replaceChildren(img,document.createTextNode(' Ready to save'));const remove=form.elements.removeImage;if(remove)remove.checked=false;
 }catch{if(token===generation){input.setCustomValidity('This photo cannot be used. Try a smaller JPG, PNG or WebP.');preview.textContent=input.validationMessage;}}
 finally{if(token===generation)busy=false;}
});
form.addEventListener('submit',e=>{if(busy||!input.checkValidity()){e.preventDefault();input.reportValidity();}},true);
window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
})();