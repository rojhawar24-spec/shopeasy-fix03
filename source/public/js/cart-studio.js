(() => {
  'use strict';
  const root=document.querySelector('[data-cart-studio]');
  if(!root)return;
  const status=root.querySelector('[data-cart-studio-status]');
  const announce=message=>{if(status){status.hidden=!message;status.textContent=message||'';}};
  const motion=()=>document.body.dataset.motion!=='off'&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let busy=false;
  const quantities=[...root.querySelectorAll('[data-cart-studio-quantity]')];
  const mutationControls=[...root.querySelectorAll('[data-cart-remove] button, .coupon-form button')];
  const initiallyDisabled=new Map(mutationControls.map(button=>[button,button.disabled]));
  const syncs=[];
  const dirtyQuantity=(except=null)=>quantities.find(form=>{
    const input=form.querySelector('input[name=quantity]');
    return form!==except && input && input.value!==input.defaultValue;
  });
  const protectDirty=(except=null)=>{
    const dirty=dirtyQuantity(except);
    if(!dirty)return false;
    announce(except?root.dataset.oneText:root.dataset.pendingText);
    dirty.querySelector('input[name=quantity]')?.focus();
    return true;
  };
  const syncAll=()=>syncs.forEach(fn=>fn());
  const syncDraft=()=>{
    syncAll();
    if(!busy)announce(dirtyQuantity()?root.dataset.pendingText:'');
  };
  const setBusy=(value,submitter=null)=>{
    busy=value;
    if(value)root.setAttribute('aria-busy','true');else root.removeAttribute('aria-busy');
    // Keep an active named submitter enabled: its name/value (e.g. coupon
    // action=remove) must remain part of the original browser form submission.
    mutationControls.forEach(button=>{
      button.disabled=initiallyDisabled.get(button)||(value&&button!==submitter);
    });
    syncAll();
  };
  const reset=()=>{
    root.querySelectorAll('.is-saving,.is-removing').forEach(el=>el.classList.remove('is-saving','is-removing'));
    setBusy(false);syncDraft();
  };
  const startSubmission=(event,form,removing=false)=>{
    if(removing)form.closest('.cart-studio-item')?.classList.add('is-removing');
    else form.classList.add('is-saving');
    announce(root.dataset.savingText);
    setBusy(true,event.submitter);
    // Native confirmation or another form listener may still cancel the POST.
    queueMicrotask(()=>{if(event.defaultPrevented)reset();});
  };
  for(const form of quantities){
    const input=form.querySelector('input[name=quantity]'),save=form.querySelector('button[type=submit]');
    if(!input||!save)continue;
    const steps=[...form.querySelectorAll('[data-cart-qty-step]')];
    const initialReadOnly=input.readOnly;
    const sync=()=>{
      const n=input.valueAsNumber,min=Number(input.min)||1,max=Number(input.max)||99;
      const valid=Number.isInteger(n)&&n>=min&&n<=max;
      const dirty=input.value!==input.defaultValue;
      const otherDirty=Boolean(dirtyQuantity(form));
      // One editable draft at a time; an already restored draft can always
      // be reverted. Read-only inputs still participate in native POSTs.
      const locked=otherDirty&&!dirty;
      input.readOnly=initialReadOnly||busy||locked;
      form.classList.toggle('is-dirty',dirty);
      save.disabled=busy||!valid||!dirty||otherDirty;
      steps.forEach(b=>{b.disabled=busy||otherDirty||(Number(b.dataset.cartQtyStep)<0?Number.isFinite(n)&&n<=min:Number.isFinite(n)&&n>=max);});
    };
    syncs.push(sync);
    form.addEventListener('click',e=>{
      const b=e.target.closest('[data-cart-qty-step]');
      if(!b)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(busy||b.disabled||protectDirty(form))return;
      const min=Number(input.min)||1,max=Number(input.max)||99,n=input.valueAsNumber;
      const next=Math.min(max,Math.max(min,(Number.isInteger(n)?n:min)+Number(b.dataset.cartQtyStep)));
      if(next===n)return;
      input.value=String(next);syncDraft();
      if(motion()&&input.animate)input.animate([{transform:'scale(.86)',opacity:.65},{transform:'scale(1)',opacity:1}],{duration:160,easing:'ease-out'});
      if(typeof form.requestSubmit==='function')form.requestSubmit();else save.click();
    },true);
    input.addEventListener('input',syncDraft);input.addEventListener('change',syncDraft);
    form.addEventListener('submit',e=>{
      if(e.defaultPrevented)return;
      if(busy||!input.checkValidity()||input.value===input.defaultValue||protectDirty(form)){e.preventDefault();return;}
      startSubmission(e,form);
    });
  }
  const dialog=document.querySelector('[data-cart-remove-dialog]');
  const confirm=dialog?.querySelector('[data-cart-remove-confirm]');
  const cancel=dialog?.querySelector('[data-cart-remove-cancel]');
  const description=dialog?.querySelector('[data-cart-remove-description]');
  const customDialog=Boolean(dialog&&confirm&&cancel&&description&&typeof dialog.showModal==='function');
  const sameQuantity=form=>form.closest('.cart-studio-item')?.querySelector('[data-cart-studio-quantity]')||null;
  let pending=null,trigger=null;
  for(const form of root.querySelectorAll('[data-cart-remove]')){
    form.addEventListener('submit',e=>{
      if(e.defaultPrevented)return;
      if(busy||protectDirty(sameQuantity(form))){e.preventDefault();e.stopImmediatePropagation();return;}
      if(!customDialog){
        // Keep the normal data-confirm fallback in app.js.
        startSubmission(e,form,true);
        return;
      }
      e.preventDefault();e.stopImmediatePropagation();
      pending=form;trigger=e.submitter||form.querySelector('button');
      description.textContent=[form.dataset.itemName,form.dataset.itemVariant].filter(Boolean).join(' — ');
      if(!dialog.open)dialog.showModal();
      cancel.focus();
    },true);
  }
  if(customDialog){
    cancel.addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    dialog.addEventListener('close',()=>{pending=null;trigger?.focus();trigger=null;});
    confirm.addEventListener('click',()=>{
      if(!pending||busy)return;
      const form=pending,button=trigger;
      if(dirtyQuantity(sameQuantity(form))){
        dialog.close();protectDirty(sameQuantity(form));return;
      }
      pending=null;trigger=null;
      dialog.close();
      form.closest('.cart-studio-item')?.classList.add('is-removing');
      announce(root.dataset.savingText);setBusy(true);
      // The buyer already confirmed. Keep the original same-origin POST and
      // CSRF/product/variant fields; do not simulate removal or price changes.
      try{HTMLFormElement.prototype.submit.call(form);}
      catch(error){reset();button?.focus();throw error;}
    });
  }
  for(const form of root.querySelectorAll('.coupon-form')){
    form.addEventListener('submit',e=>{
      if(e.defaultPrevented)return;
      if(busy||protectDirty()){e.preventDefault();return;}
      startSubmission(e,form);
    });
  }
  root.querySelector('[data-cart-studio-checkout]')?.addEventListener('click',e=>{
    if(busy||protectDirty())e.preventDefault();
  });
  window.addEventListener('pageshow',e=>{if(e.persisted){if(dialog?.open)dialog.close();pending=null;trigger=null;reset();}});
  syncDraft();
})();
