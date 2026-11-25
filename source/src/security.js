import crypto from 'node:crypto';
import { DEFAULT_STORE_TIMEZONE } from './store-config.js';

// Escape untrusted text before embedding it in server-generated HTML strings.
// EJS's <%= ... %> escapes automatically; strings inserted with <%- ... %> do not.
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function csrfToken(req, res, next) {
  res.locals.csrf = req.session.csrf;
  next();
}

export function csrfRecoveryPath(req) {
  const path = String(req.path || '/');
  if (path === '/checkout') return '/checkout?notice=security-refresh';
  if (/^\/cart\/(?:add|update|remove|coupon)$/.test(path)) return '/cart?notice=security-refresh';
  if (path === '/order-lookup') return '/order-lookup?notice=security-refresh';
  if (path === '/checkout/success/returns' || path === '/checkout/success/cancel') {
    const id = String(req.body?.orderId || req.query?.order || '');
    return /^\d{1,12}$/.test(id) ? `/checkout/success?order=${id}&notice=security-refresh` : '/order-lookup?notice=security-refresh';
  }
  const accountOrder = path.match(/^\/account\/order\/(\d+)\/(?:cancel|returns)$/);
  if (accountOrder) return `/account/order/${accountOrder[1]}?notice=security-refresh`;
  if (/^\/order\/\d+\/return-request$/.test(path)) return '/order-lookup?notice=security-refresh';
  return null;
}

// A stale Login form must not replay credentials. Carry only a bounded email
// and local destination to a fresh GET; final authorization of that destination
// remains the successful sign-in handler's responsibility.
function loginCsrfRecoveryPath(req) {
  const submittedNext = typeof req.body?.next === 'string' ? req.body.next.trim() : '';
  let next = '/account';
  if (submittedNext.length <= 200 && isSafeLocalPath(submittedNext) &&
      !/[\u0000-\u0020\u007f]/.test(submittedNext) && !/%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i.test(submittedNext)) {
    try {
      const target = new URL(submittedNext, 'https://shop.invalid');
      if (target.origin === 'https://shop.invalid') next = target.pathname + target.search + target.hash;
    } catch { /* Keep the fixed account fallback for malformed destinations. */ }
  }
  const query = new URLSearchParams({ notice:'security-refresh', next });
  const email = typeof req.body?.email === 'string' ? cleanText(req.body.email,120) : '';
  if (email) query.set('email',email);
  return `/login?${query}`;
}

export function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session.csrf;
  const requestProductId = Number(req.body?.id);
  const productFormPath = req.path === '/admin/products/save'
    ? (Number.isSafeInteger(requestProductId) && requestProductId > 0 ? `/admin/products/${requestProductId}/edit` : '/admin/products/new')
    : null;
  const recoveryPath = csrfRecoveryPath(req);
  const blockedResponse = (staleToken=false) => {
    // A nonempty old token identifies a stale form. Missing or malformed tokens
    // still receive the normal rejection, and neither path reaches authentication.
    if (staleToken && req.path === '/login' && typeof token === 'string') {
      return res.redirect(303,loginCsrfRecoveryPath(req));
    }
    if (recoveryPath) return res.redirect(303, recoveryPath);
    return res.status(403).render('error', {
      title: 'Form security check expired',
      message: 'For your security, this submission was not saved. Open the form again to get a fresh security token, then submit it once more.',
      ...(productFormPath ? { actionUrl: productFormPath, actionLabel: 'Return to product form' } : {})
    });
  };
  if (!token || !expected || typeof token !== 'string') return blockedResponse();
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return blockedResponse(true);
  next();
}

export const cleanText = (value, max = 5000) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim()
  .slice(0, max);

// IDs arrive from URL and form parsing as strings. Reject arrays/objects,
// scientific notation, fractions and unsafe integers instead of allowing JS
// coercion (for example Number(['1']) === 1) to turn malformed input into a valid ID.
export const validId = value => {
  let candidate;
  if (typeof value === 'number') candidate = value;
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) candidate = Number(value.trim());
  else return false;
  return Number.isSafeInteger(candidate) && candidate > 0;
};

// For shared create/edit endpoints, a missing or empty ID means "create";
// a supplied but malformed ID must fail closed rather than silently creating
// a duplicate entity when an edit form is stale or tampered with.
export function optionalFormId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!validId(value)) throw new Error('INVALID_ID');
  return Number(value);
}

// Amounts are persisted as integer minor units. The historical column names end
// in *_cents, but the actual scale is determined by the order/store currency.
// Most minor-unit digit counts come from Intl's ISO 4217 data. Pin currencies
// whose runtime/CLDR data may differ from the ISO 4217 minor-unit list.
export const SUPPORTED_CURRENCIES = Object.freeze([
  'AED','ARS','AUD','BHD','BDT','BRL','CAD','CHF','CLP','CNY','COP','CZK','DKK',
  'EGP','EUR','GBP','HKD','HUF','IDR','ILS','INR','IQD','ISK','JOD','JPY','KES',
  'KRW','KWD','LKR','MAD','MXN','MYR','NGN','NOK','NZD','OMR','PEN','PHP','PKR',
  'PLN','QAR','RON','RUB','SAR','SEK','SGD','SYP','THB','TND','TRY','TWD','UAH','USD',
  'UYU','VND','ZAR'
]);

export const isValidCurrency = value => {
  // A repeated form parameter is an array; do not accept ['EUR'] as 'EUR'.
  if (typeof value !== 'string') return false;
  const code = value.toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(code)) return false;
  try {
    new Intl.NumberFormat('en-GB', { style:'currency', currency:code }).format(1);
    return true;
  } catch { return false; }
};

const ISO_4217_MINOR_UNIT_DIGITS = Object.freeze({ IQD:3, BHD:3, JOD:3, KWD:3, OMR:3, TND:3, CLP:0, ISK:0, JPY:0, KRW:0, VND:0 });

export function currencyMinorUnitDigits(currency='EUR') {
  // Precision must survive an unavailable Intl formatter as well: using
  // isValidCurrency here would turn a known IQD/JPY amount into EUR minor units
  // precisely when a caller needs its plain-text fallback.
  const code = typeof currency==='string'&&SUPPORTED_CURRENCIES.includes(currency.toUpperCase()) ? currency.toUpperCase() : 'EUR';
  if (Object.hasOwn(ISO_4217_MINOR_UNIT_DIGITS, code)) return ISO_4217_MINOR_UNIT_DIGITS[code];
  try { return new Intl.NumberFormat('en', { style:'currency', currency:code }).resolvedOptions().maximumFractionDigits; }
  catch { return 2; }
}

export function currencyMinorUnitFactor(currency='EUR') {
  return 10 ** currencyMinorUnitDigits(currency);
}

function normalizeMoneyIntegerPart(value) {
  const part=String(value??'');
  if (/^\d+$/.test(part)) return part;
  if (/^\d{1,3}(?: \d{3})+$/.test(part)) return part.replace(/ /g,'');
  const grouped=/^(\d{1,3})([.,])\d{3}(?:\2\d{3})*$/.exec(part);
  if (grouped) return part.replace(/[.,]/g,'');
  return null;
}

// Accept both international decimal points and comma-decimal formats used in
// Belgium/Iraq, including well-formed thousands separators. Never guess through
// malformed values: reject those instead of saving a different price silently.
export const moneyCents = (value, currency='EUR') => {
  // Never coerce arrays/objects/booleans to prices: ['1','25'] becomes '1,25'
  // with String(), even though it came from an invalid repeated form field.
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return null;
  const code=isValidCurrency(currency)?String(currency).toUpperCase():'EUR';
  let source=String(value??'').normalize('NFKC').replace(/[\u00a0\u202f]/g,' ').trim();
  // People sometimes include the store currency in the input. Accept only the
  // configured currency's own symbol/code; never silently convert currencies.
  let currencySymbol='';
  try { currencySymbol=new Intl.NumberFormat('en',{style:'currency',currency:code}).formatToParts(1).find(part=>part.type==='currency')?.value||''; } catch {}
  for(const decoration of [...new Set([code,currencySymbol].filter(Boolean))].sort((a,b)=>b.length-a.length)) {
    const escaped=decoration.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const prefix=new RegExp(`^${escaped}\\s*`,'i');
    const suffix=new RegExp(`\\s*${escaped}$`,'i');
    if(prefix.test(source)){source=source.replace(prefix,'').trim();break;}
    if(suffix.test(source)){source=source.replace(suffix,'').trim();break;}
  }
  const digits=currencyMinorUnitDigits(code);
  if (!source || !/^[\d., ]+$/.test(source) || source.startsWith(' ') || source.endsWith(' ')) return null;
  const comma=source.lastIndexOf(',');
  const dot=source.lastIndexOf('.');
  let whole='',fraction='';

  if (digits===0) {
    const integer=normalizeMoneyIntegerPart(source);
    if (integer===null) return null;
    whole=integer;
  } else if (comma>=0 && dot>=0) {
    const separator=comma>dot?',':'.';
    const cut=source.lastIndexOf(separator);
    const fractionPart=source.slice(cut+1);
    if (!/^\d+$/.test(fractionPart) || fractionPart.length<1 || fractionPart.length>digits) return null;
    const integer=normalizeMoneyIntegerPart(source.slice(0,cut));
    if (integer===null) return null;
    whole=integer; fraction=fractionPart;
  } else if (comma>=0 || dot>=0) {
    const separator=comma>=0?',':'.';
    const chunks=source.split(separator);
    if (chunks.length>2) {
      const integer=normalizeMoneyIntegerPart(source);
      if (integer===null) return null;
      whole=integer;
    } else {
      const [integerRaw,fractionRaw='']=chunks;
      const grouped=normalizeMoneyIntegerPart(source);
      const canBeGrouping=fractionRaw.length===3 && grouped!==null;
      if (fractionRaw.length>digits && canBeGrouping) {
        whole=grouped;
      } else {
        if (!/^\d+$/.test(fractionRaw) || fractionRaw.length<1 || fractionRaw.length>digits) return null;
        const integer=normalizeMoneyIntegerPart(integerRaw);
        if (integer===null) return null;
        whole=integer; fraction=fractionRaw;
      }
    }
  } else {
    const integer=normalizeMoneyIntegerPart(source);
    if (integer===null) return null;
    whole=integer;
  }

  try {
    const factor=BigInt(currencyMinorUnitFactor(currency));
    const amount=BigInt(whole)*factor+BigInt((fraction+'0'.repeat(digits)).slice(0,digits)||'0');
    const result=Number(amount);
    return Number.isSafeInteger(result)&&result>=0?result:null;
  } catch { return null; }
};

export function minorUnitsToMajor(value, currency='EUR') {
  const amount=Number(value||0);
  return Number.isFinite(amount) ? amount / currencyMinorUnitFactor(currency) : 0;
}

export function formatMoneyInput(value, currency='EUR') {
  const digits=currencyMinorUnitDigits(currency);
  return minorUnitsToMajor(value,currency).toFixed(digits);
}

// SQLite datetime('now') returns UTC as `YYYY-MM-DD HH:mm:ss` without a zone.
// JavaScript interprets that legacy string as local time, which can make a new order
// look one or two hours old (and can shift manager-facing timestamps). Treat only
// this unzoned SQLite form as UTC; preserve explicit Z/offset timestamps unchanged.
export function parseStoredTimestamp(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (value === null || value === undefined || value === '') return new Date(Number.NaN);
  if (typeof value === 'string') {
    const raw = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)) {
      return new Date(`${raw.replace(' ', 'T')}Z`);
    }
    return new Date(raw);
  }
  return new Date(value);
}

export const safeDateOrNull = value => {
  if (!value) return null;
  const d = parseStoredTimestamp(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};


export function formatDateTimeDisplay(value, timeZone=DEFAULT_STORE_TIMEZONE, locale='en-GB') {
  if (!value) return '';
  const safeLocale = ['en-GB','en','ckb','ar','nl-BE','fr-BE','fr','ckb-IQ','ar-IQ'].includes(String(locale)) ? String(locale) : 'en-GB';
  try {
    return new Intl.DateTimeFormat(safeLocale, {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(parseStoredTimestamp(value));
  } catch { return ''; }
}

export function formatDateTimeLocal(value, timeZone=DEFAULT_STORE_TIMEZONE) {
  if (!value) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false
    }).formatToParts(parseStoredTimestamp(value)).reduce((acc,p)=>{ if(p.type!=='literal') acc[p.type]=p.value; return acc; }, {});
    if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return '';
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  } catch { return ''; }
}

function timezoneOffsetMs(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(instantMs)).reduce((acc,p)=>{ if(p.type!=='literal') acc[p.type]=p.value; return acc; }, {});
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month)-1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - instantMs;
}

export function dateTimeLocalToISOString(value, timeZone=DEFAULT_STORE_TIMEZONE) {
  const raw=String(value||'').trim();
  const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [,y,mo,d,h,mi]=match;
  const year=Number(y), month=Number(mo), day=Number(d), hour=Number(h), minute=Number(mi);
  if (month<1||month>12||day<1||day>31||hour>23||minute>59) return null;
  try {
    const wallMs=Date.UTC(year,month-1,day,hour,minute,0,0);

    // Reject impossible calendar dates like 2026-02-31 or 2026-04-31.
    // JavaScript Date silently rolls these into the next month, so we
    // verify that the wall-clock parts round-trip unchanged before
    // applying the timezone conversion.
    const calendarCheck = new Date(wallMs);
    if (
      calendarCheck.getUTCFullYear() !== year ||
      calendarCheck.getUTCMonth() !== month - 1 ||
      calendarCheck.getUTCDate() !== day ||
      calendarCheck.getUTCHours() !== hour ||
      calendarCheck.getUTCMinutes() !== minute
    ) {
      return null;
    }

    let offset=timezoneOffsetMs(wallMs,timeZone);
    let instantMs=wallMs-offset;
    const corrected=timezoneOffsetMs(instantMs,timeZone);
    if (corrected!==offset) instantMs=wallMs-corrected;
    const dte=new Date(instantMs);
    if(Number.isNaN(dte.getTime())) return null;
    // Daylight-saving gaps can silently normalize a nonexistent local time
    // (for example 02:30 on the Brussels spring-forward day) to another hour.
    // Reject such input instead of storing a different wall-clock time than the
    // manager selected. Ambiguous fall-back times still round-trip to one valid instant.
    if(formatDateTimeLocal(dte,timeZone)!==raw) return null;
    return dte.toISOString();
  } catch { return null; }
}

function noProtocolRelative(value) {
  return !value.startsWith('//') && !value.includes('\\') && !/[\r\n]/.test(value);
}

export const isSafeUrl = value => {
  if (!value) return true;
  const s = String(value).trim();
  if (s.startsWith('/')) return noProtocolRelative(s);
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && Boolean(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
};

export const isSafeLocalPath = value => {
  const s = String(value ?? '');
  return Boolean(s) && s.startsWith('/') && noProtocolRelative(s);
};

export function assertUploadSignature(buffer, mime) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

// Apply to new/set/reset passwords only. Existing password verification deliberately
// remains compatible with older hashes; a policy update must not lock users out.
// This small offline blocklist rejects obvious examples, not every breached password.
const COMMON_NEW_PASSWORDS = new Set([
  'passwordpassword','password123456789','password12345678',
  '123456789012345','1234567890123456','12345678901234567890',
  'qwertyuiopasdfgh','qwertyuiop123456','letmeinletmeinletmein',
  'correcthorsebatterystaple'
]);
export function isStrongEnoughPassword(value) {
  if (typeof value !== 'string' || value.length > 200 || [...value.trim()].length < 15) return false;
  const normalized=value.normalize('NFKC').trim().toLowerCase();
  const compact=normalized.replace(/\s+/gu,'');
  if (!compact || COMMON_NEW_PASSWORDS.has(compact)) return false;
  if (/^(.{1,4})\1+$/u.test(compact)) return false;
  return true;
}

// =========================================================
// Phone validation
// Supports international formats:
//   +00 123 456 789   (illustrative international format)
//   0750 123 4567       (local)
//   +31 6 12345678      (Netherlands)
//   +1 (555) 123-4567   (USA)
// Requires 7-20 actual digits. Rejects strings like "-------".
// =========================================================
export function isValidPhone(value) {
  const s = String(value ?? '').trim();

  if (s.length === 0 || s.length > 32) return false;

  // Only allow: optional leading +, digits, spaces, parentheses, dashes
  if (!/^\+?[0-9 ()-]+$/.test(s)) return false;

  // Count actual digits
  const digits = (s.match(/\d/g) || []).length;

  return digits >= 7 && digits <= 20;
}
// Delivery coverage is explicitly configured by the merchant as one country per
// line. Checkout compares the submitted country to this allow-list on the server;
// the form's select element is only a usability aid, never the security boundary.
export function normalizeDeliveryCountries(value) {
  const entries = String(value ?? '').split(/\r?\n/);
  const countries = [];
  const seen = new Set();

  for (const entry of entries) {
    const country = entry.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!country) continue;
    if (
      country.length < 2 || country.length > 80 ||
      !/^[\p{L}\p{M} .,'’()&/\-]+$/u.test(country) ||
      country.toLocaleLowerCase('en') === 'other'
    ) return null;

    const key = country.toLocaleLowerCase('en');
    if (!seen.has(key)) {
      seen.add(key);
      countries.push(country);
    }
  }

  if (countries.length > 250) return null;
  return countries;
}

export function matchDeliveryCountry(value, configuredCountries) {
  const submitted = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (submitted.length < 2 || submitted.length > 80 || !Array.isArray(configuredCountries)) return null;
  const key = submitted.toLocaleLowerCase('en');
  return configuredCountries.find(country =>
    String(country).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en') === key
  ) || null;
}
