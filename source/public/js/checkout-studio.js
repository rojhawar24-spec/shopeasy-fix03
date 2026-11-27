(()=>{'use strict';
const form=document.querySelector('[data-checkout-studio]');if(!form)return;
const stages=[...form.querySelectorAll('[data-checkout-stage]')],progress=form.querySelector('[data-checkout-progress]');
const gift=form.elements.giftCardCode, note=form.querySelector('.checkout-note-disclosure');
const sync=()=>{
 if(gift){const active=form.elements.paymentMethod?.value==='gift_card';gift.disabled=!active;gift.required=active;const label=gift.closest('label');if(label)label.hidden=!active;}
 let done=0;
 for(const stage of stages){const fields=[...stage.querySelectorAll('input,select,textarea')].filter(f=>!f.disabled&&f.type!=='hidden');const valid=fields.every(f=>f.validity.valid);stage.classList.toggle('is-complete',valid);const mark=stage.querySelector('[data-checkout-stage-done]');if(mark)mark.hidden=!valid;if(valid)done++;}
 if(progress){progress.hidden=false;progress.textContent=done+' / '+stages.length;}
};
form.addEventListener('input',sync);form.addEventListener('change',sync);form.addEventListener('invalid',e=>{e.target.classList.add('checkout-invalid');if(note?.contains(e.target))note.open=true;},true);
form.addEventListener('input',e=>{if(e.target.validity?.valid)e.target.classList.remove('checkout-invalid');});
sync();window.addEventListener('pageshow',sync);
})();