/** Deterministic, non-stacking multi-item promotions. All prices are minor units.
 * A matching pair discounts the lower-priced unit; repeated bundles consume
 * distinct quantities. Nothing depends on the browser's claimed prices.
 */
import {safeMinorUnitsAdd, safeMinorUnitsMultiply, safePercentOfMinorUnits} from './pricing.js';

export function normalizeBundleRules(input) {
  let values=input;
  try { if (typeof values==='string') values=JSON.parse(values); } catch { return []; }
  if (!Array.isArray(values) || values.length>20) return [];
  const output=[];
  for(const rule of values) {
    const ids=Array.isArray(rule?.productIds)?rule.productIds.map(Number):[];
    const pct=Number(rule?.discountPercent);
    if(ids.length!==2 || !ids.every(id=>Number.isSafeInteger(id)&&id>0) || ids[0]===ids[1] || !Number.isInteger(pct) || pct<1 || pct>50)continue;
    if(rule.active===false)continue;
    if(output.some(other=>other.productIds.some(id=>ids.includes(id))))continue; // no overlapping product rules
    output.push({productIds:ids,discountPercent:pct});
  }
  return output;
}
export function calculateBundleDiscount(lines,rules) {
  const safeRules=normalizeBundleRules(rules);
  const available=new Map();
  for (const line of (Array.isArray(lines)?lines:[])) {
    const id=Number(line.productId??line.product?.id);
    const qty=Number(line.quantity);
    const price=Number(line.price??line.unit);
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(qty)||qty<1||!Number.isSafeInteger(price)||price<0)throw new Error('INVALID_BUNDLE_LINES');
    const current=available.get(id)||{qty:0,units:[]};
    current.qty=safeMinorUnitsAdd(current.qty,qty);
    current.units.push({price,qty});
    available.set(id,current);
  }
  let discount=0;
  const applied=[];
  for(const rule of safeRules) {
    const a=available.get(rule.productIds[0]);
    const b=available.get(rule.productIds[1]);
    if(!a||!b)continue;
    const count=Math.min(a.qty,b.qty);
    if(!count)continue;
    // Each unit is priced independently. Using the lowest *variant* price for
    // every unit would silently understate the discount when quantities have
    // different unit prices. Match cheapest eligible units first, deterministically.
    const left=a.units.map(unit=>({...unit})).sort((x,y)=>x.price-y.price);
    const right=b.units.map(unit=>({...unit})).sort((x,y)=>x.price-y.price);
    let indexA=0,indexB=0,remaining=count,eligible=0;
    while(remaining>0){
      const itemA=left[indexA],itemB=right[indexB];
      const paired=Math.min(remaining,itemA.qty,itemB.qty);
      eligible=safeMinorUnitsAdd(eligible,safeMinorUnitsMultiply(Math.min(itemA.price,itemB.price),paired));
      itemA.qty-=paired;itemB.qty-=paired;remaining-=paired;
      if(itemA.qty===0)indexA++;
      if(itemB.qty===0)indexB++;
    }
    const amount=safePercentOfMinorUnits(eligible,rule.discountPercent);
    discount=safeMinorUnitsAdd(discount,amount);
    a.qty-=count;b.qty-=count;
    applied.push({...rule,count,discountCents:amount});
  }
  return {discountCents:discount,applied};
}
