// Customer-facing appearance preferences. All persisted inputs are allowlisted before
// interpolation into a self-hosted CSS response; never embed arbitrary manager CSS.
export const APPEARANCE_SWITCHES = Object.freeze({
  darkMode: true,
  motion: true,
  quickView: true,
  compare: true,
  recentlyViewed: false,
  stickyPurchase: true,
  freeShipping: false,
  newsletter: false,
  reviews: false,
  stockAlerts: false,
  cartDrawer: false,
  countrySuggestion: false,
  filterChips: true
});
export const DEFAULT_APPEARANCE = Object.freeze({
  brandPrimary: '#244C40', brandAccent: '#D8B68A', font: 'inter', logo: '',
  freeShippingMinimum: 0,
  ...APPEARANCE_SWITCHES
});
export const allowedFonts = Object.freeze(['inter','system','editorial']);
const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = value => typeof value === 'string' && HEX.test(value);
export function safeHex(value, fallback){ return isHex(value) ? value.toUpperCase() : fallback; }
const luminance = value => {
  const rgb = [1,3,5].map(index => parseInt(value.slice(index,index+2),16)/255)
    .map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
};
// Buttons and links on the primary colour carry white labels; minimum AA contrast.
export function validPrimary(value){ return isHex(value) && (1.05/(luminance(value)+0.05)) >= 4.5; }
export function normalizeAppearance(record={}) {
  const out={...DEFAULT_APPEARANCE};
  out.brandPrimary=validPrimary(record.brandPrimary)?record.brandPrimary.toUpperCase():DEFAULT_APPEARANCE.brandPrimary;
  out.brandAccent=safeHex(record.brandAccent,DEFAULT_APPEARANCE.brandAccent);
  out.font=allowedFonts.includes(record.font)?record.font:DEFAULT_APPEARANCE.font;
  out.logo=typeof record.logo==='string' && /^\/uploads\/[a-f0-9]{32}\.(?:png|jpg|webp)$/.test(record.logo) ? record.logo : '';
  const amount=Number(record.freeShippingMinimum);
  out.freeShippingMinimum=Number.isSafeInteger(amount)&&amount>=0&&amount<=100000000 ? amount : 0;
  for(const [key,defaultValue] of Object.entries(APPEARANCE_SWITCHES)){
    const v=record[key]; out[key]= v===undefined ? defaultValue : v===true||v==='1';
  }
  return out;
}
export function appearanceCss(record){
  const a=normalizeAppearance(record);
  const font = a.font==='system' ? 'system-ui,-apple-system,"Segoe UI",sans-serif'
    : a.font==='editorial' ? 'Georgia,"Times New Roman",serif'
      : '"Inter",system-ui,sans-serif';
  return `:root{--brand-primary:${a.brandPrimary};--brand-highlight:${a.brandAccent};--brand-font:${font};}`;
}
