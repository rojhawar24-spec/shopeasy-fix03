(() => {
  'use strict';
  const root=document.querySelector('[data-cart-studio]');
  if(!root)return;
  const status=root.querySelector('[data-cart-studio-status]');
  const announce=message=>{if(status){status.hidden=!message;status.textContent=message||'';}};
  const motion=()=>document.body.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy=false;
  const quantities=[...root.querySelectorAll('[data-cart-studio-quantity]')];
  const syncs=[];
  const reset=()=>{busy=false;root.removeAttribute('aria-busy');root.querySelectorAll('.is-saving').forEach(f=>f.classList.remove('is-saving'));syncs.forEach(fn=>fn());announce('');};
  for(const form of quantities){
    const input=form.querySelector('input[name=quantity]'),save=form.querySelector('button[type=submit]');
    if(!input||!save)continue;
    const steps=[...form.querySelectorAll('[data-cart-qty-step]')];
    const sync=()=>{
      const n=input.valueAsNumber,min=Number(input.min)||1,max=Number(input.max)||99;
      const valid=Number.isInteger(n)&&n>=min&&n<=max;
      save.disabled=busy||!valid||input.value===input.defaultValue;
      steps.forEach(b=>{b.disabled=busy||(Number(b.dataset.cartQtyStep)<0?Number.isFinite(n)&&n<=min:Number.isFinite(n)&&n>=max);});
    };
    syncs.push(sync);
    form.addEventListener('click',e=>{
      const b=e.target.closest('[data-cart-qty-step]');
      if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(busy||b.disabled)return;
      const min=Number(input.min)||1,max=Number(input.max)||99,n=input.valueAsNumber;
      const next=Math.min(max,Math.max(min,(Number.isFinite(n)?n:min)+Number(b.dataset.cartQtyStep)));
      if(next===n)return;
      input.value=String(next);sync();
      if(motion()&&input.animate)input.animate([{transform:'scale(.86)',opacity:.65},{transform:'scale(1)',opacity:1}],{duration:160,easing:'ease-out'});
      form.requestSubmit();
    },true);
    input.addEventListener('input',sync);input.addEventListener('change',sync);
    form.addEventListener('submit',e=>{
      if(busy||!input.checkValidity()){e.preventDefault();return;}
      if(e.defaultPrevented)return;
      busy=true;form.classList.add('is-saving');root.setAttribute('aria-busy','true');announce(root.dataset.savingText);
      syncs.forEach(fn=>fn());
    });
    sync();
  }
  const dialog=document.querySelector('[data-cart-remove-dialog]');
  const confirm=dialog?.querySelector('[data-cart-remove-confirm]');
  const cancel=dialog?.querySelector('[data-cart-remove-cancel]');
  const description=dialog?.querySelector('[data-cart-remove-description]');
  let pending=null,trigger=null;
  if(dialog&&confirm&&cancel&&description&&typeof dialog.showModal==='function'){
    for(const form of root.querySelectorAll('[data-cart-remove]')){
      form.addEventListener('submit',e=>{
        if(form.dataset.cartRemoveConfirmed==='1'){delete form.dataset.cartRemoveConfirmed;return;}
        if(busy){e.preventDefault();e.stopImmediatePropagation();return;}
        e.preventDefault();e.stopImmediatePropagation();
        pending=form;trigger=e.submitter||form.querySelector('button');
        description.textContent=[form.dataset.itemName,form.dataset.itemVariant].filter(Boolean).join(' — ');
        if(!dialog.open)dialog.showModal();
        cancel.focus();
      },true);
    }
    cancel.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{pending=null;trigger?.focus();trigger=null;});
    confirm.addEventListener('click',()=>{
      if(!pending||busy)return;
      const form=pending,button=trigger;
      // Preserve the original POST and CSRF fields, bypass only the redundant native confirmation.
      const nativeConfirm=form.getAttribute('data-confirm');
      form.removeAttribute('data-confirm');
      form.dataset.cartRemoveConfirmed='1';
      dialog.close();
      busy=true;root.setAttribute('aria-busy','true');form.closest('.cart-studio-item')?.classList.add('is-removing');
      syncs.forEach(fn=>fn());if(button)button.disabled=true;
      HTMLFormElement.prototype.submit.call(form);
      if(nativeConfirm!==null)form.setAttribute('data-confirm',nativeConfirm);
    });
  }
  root.querySelector('[data-cart-studio-checkout]')?.addEventListener('click',e=>{
    if(busy){e.preventDefault();return;}
    const changed=quantities.find(f=>{const i=f.querySelector('input[name=quantity]');return i&&i.value!==i.defaultValue;});
    if(changed){e.preventDefault();announce(root.dataset.pendingText);changed.querySelector('input[name=quantity]')?.focus();}
  });
  window.addEventListener('pageshow',e=>{if(e.persisted){reset();root.querySelectorAll('.is-removing').forEach(x=>x.classList.remove('is-removing'));root.querySelectorAll('[data-cart-remove] button').forEach(b=>b.disabled=false);}});
})();
