(()=>{'use strict';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const lang=document.documentElement.lang.split('-')[0];
const labels={nl:['Scroll naar links','Scroll naar rechts'],fr:['Défiler à gauche','Défiler à droite'],ckb:['بۆ چەپ','بۆ ڕاست'],ar:['التمرير لليسار','التمرير لليمين'],en:['Scroll left','Scroll right']}[lang]||['Scroll left','Scroll right'];
for(const rail of document.querySelectorAll('.home-category-rail,.shop-category-rail>.chips,.home-product-rail')){
  const heading=rail.closest('.home-category-section')?.querySelector('.home-category-heading')||rail.closest('#featured')?.querySelector('.section-head')||rail.closest('.shop-category-toolbar');
  if(!heading)continue;
  const controls=document.createElement('div');controls.className='category-scroll-controls';controls.hidden=true;
  const buttons=[-1,1].map((direction,i)=>{
    const b=document.createElement('button');b.type='button';b.className='category-scroll-arrow';b.setAttribute('aria-label',labels[i]);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),icon=document.createElementNS(ns,'path');
    for(const [name,value] of Object.entries({viewBox:'0 0 24 24',width:'18',height:'18',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(name,value);
    icon.setAttribute('d',direction<0?'m15 6-6 6 6 6':'m9 6 6 6-6 6');svg.append(icon);b.append(svg);
    b.addEventListener('click',()=>rail.scrollBy({left:direction*Math.max(120,rail.clientWidth*.8),behavior:reduced.matches?'auto':'smooth'}));controls.append(b);return b;
  });
  heading.append(controls);let queued=false;
  const update=()=>{queued=false;const overflow=Math.max(0,rail.scrollWidth-rail.clientWidth);controls.hidden=overflow<3;const rtl=getComputedStyle(rail).direction==='rtl';const x=rail.scrollLeft;const min=rtl?-overflow:0,max=rtl?0:overflow;buttons[0].disabled=x<=min+2;buttons[1].disabled=x>=max-2;};
  const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(update)}};
  rail.addEventListener('scroll',schedule,{passive:true});
  if(window.ResizeObserver){const observer=new ResizeObserver(schedule);observer.observe(rail);for(const child of rail.children)observer.observe(child)}else window.addEventListener('resize',schedule,{passive:true});
  update();
}
})();