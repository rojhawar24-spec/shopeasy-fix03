// Product-specific arrival visibility. Missing settings preserve legacy behaviour.
// Values are internal metadata, never customer-provided SQL or product tags.
export const NEW_ARRIVAL_DAYS = Object.freeze([3,7,14,30,60]);
export const MAX_NEW_ARRIVAL_DAYS = 3650;
export const DEFAULT_NEW_ARRIVAL_DAYS = 30;
const DAY_MS = 86400000;
export function productArrivalKey(id) {
  const productId=Number(id);
  if(!Number.isSafeInteger(productId)||productId<1)throw new Error('NEW_ARRIVAL');
  return 'product_new_'+productId;
}
export function normalizeNewArrivalInput(mode,customDays,now=new Date()) {
  if(mode===undefined||mode==='keep')return undefined;
  if(mode==='automatic')return 'automatic';
  if(mode==='off'||mode==='forever')return mode;
  if(typeof mode!=='string')throw new Error('NEW_ARRIVAL');
  let days;
  if(NEW_ARRIVAL_DAYS.map(String).includes(mode))days=Number(mode);
  else if(mode==='custom'&&typeof customDays==='string'&&/^[1-9][0-9]{0,3}$/.test(customDays))days=Number(customDays);
  else throw new Error('NEW_ARRIVAL');
  if(!Number.isSafeInteger(days)||days<1||days>MAX_NEW_ARRIVAL_DAYS||!Number.isFinite(now.getTime()))throw new Error('NEW_ARRIVAL');
  return new Date(now.getTime()+days*DAY_MS).toISOString();
}
export function validStoredArrival(value) {
  if(value===undefined||value==='automatic'||value==='off'||value==='forever')return true;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
  const time=Date.parse(value);
  return Number.isFinite(time)&&new Date(time).toISOString()===value;
}
export function defaultArrivalStart(now=new Date()) {
  return new Date(now.getTime()-DEFAULT_NEW_ARRIVAL_DAYS*DAY_MS).toISOString();
}
