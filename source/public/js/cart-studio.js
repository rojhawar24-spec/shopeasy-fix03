(() => {
  'use strict';
  const root=document.querySelector('[data-cart-studio]');
  if(!root)return;
  const forms=[...root.querySelectorAll('[data-cart-studio-quantity]')];
  const status=root.querySelector('[data-cart-studio-status]');
  const checkout=root.querySelector('[data-cart-studio-checkout]');
  const dirty=new Set();
  const controls=[];
  const lockOthers=()=>{for(const entry of controls){const locked=dirty.size>0&&!dirty.has(entry.form);entry.input.readOnly=locked;for(const b of entry.steps)b.disabled=locked||b.dataset.atLimit==='true';}};
  const announce=message=>{if(status){status.hidden=!message;status.textContent=message||'';}};
  const motion=()=>document.body.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const form of forms){
    const input=form.querySelector('input[name=quantity]'),save=form.querySelector('button[type=submit]');
    if(!input||!save)continue;
    const original=input.value,steps=[...form.querySelectorAll('[data-cart-qty-step]')];
    controls.push({form,input,steps});
    const sync=()=>{
      const n=input.valueAsNumber,min=Number(input.min)||1,max=Number(input.max)||99;
      const valid=Number.isInteger(n)&&n>=min&&n<=max;
      const changed=input.value!==original;
      if(changed)dirty.add(form);else dirty.delete(form);
      form.classList.toggle('is-dirty',changed);
      save.disabled=!changed||!valid;
      steps.forEach(b=>{b.dataset.atLimit=String(Number(b.dataset.cartQtyStep)<0?Number.isFinite(n)&&n<=min:Number.isFinite(n)&&n>=max);});
      lockOthers();
      announce(dirty.size?root.dataset.pendingText:'');
    };
    form.addEventListener('click',e=>{
      const b=e.target.closest('[data-cart-qty-step]');
      if(!b||b.disabled||input.readOnly)return;
      e.preventDefault();e.stopImmediatePropagation();
      const n=input.valueAsNumber,min=Number(input.min)||1,max=Number(input.max)||99;
      input.value=String(Math.min(max,Math.max(min,(Number.isFinite(n)?n:min)+Number(b.dataset.cartQtyStep))));
      input.dispatchEvent(new Event('input',{bubbles:true}));
      if(motion()&&input.animate)input.animate([{transform:'scale(.88)',opacity:.7},{transform:'scale(1)',opacity:1}],{duration:180,easing:'ease-out'});
    },true);
    input.addEventListener('input',sync);input.addEventListener('change',sync);
    form.addEventListener('submit',e=>{
      if(!input.checkValidity()||dirty.size>1){e.preventDefault();if(dirty.size>1)announce(root.dataset.oneText);return;}
      form.classList.add('is-saving');announce(root.dataset.savingText);
    });
    sync();
  }
  checkout?.addEventListener('click',e=>{
    if(!dirty.size)return;
    e.preventDefault();announce(root.dataset.pendingText);
    const f=dirty.values().next().value;
    (f.querySelector('button[type=submit]:not(:disabled)')||f.querySelector('input[name=quantity]'))?.focus();
  });
  // Prevent conflicting unsaved edits; existing server forms remain authoritative.
  root.addEventListener('focusin',e=>{
    const f=e.target.closest('[data-cart-studio-quantity]');
    if(f&&dirty.size&&!dirty.has(f))announce(root.dataset.oneText);
  });
  // Only one line is edited at a time; no optimistic totals or hidden requests.
})();
