// Generic store defaults. Customer-specific market values belong in environment/configuration,
// not hard-coded throughout the application.
export const DEFAULT_STORE_NAME = 'ShopEasy Store';
export const DEFAULT_STORE_CURRENCY = 'EUR';
export const DEFAULT_STORE_TIMEZONE = 'UTC';
export const DEFAULT_UI_LOCALE = 'en';
const badiniPreview = process.env.VERCEL_ENV === 'preview';
export const SUPPORTED_UI_LOCALES = Object.freeze(['en', 'ckb', 'ar', 'nl', 'fr', ...(badiniPreview?['kmr']:[])]);
export const UI_LOCALE_OPTIONS = Object.freeze([
  Object.freeze({ code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' }),
  Object.freeze({ code: 'ckb', label: 'Sorani Kurdish', nativeLabel: 'کوردی (سۆرانی)', dir: 'rtl' }),
  Object.freeze({ code: 'ar', label: 'Arabic', nativeLabel: 'العربية', dir: 'rtl' }),
  Object.freeze({ code: 'nl', label: 'Dutch', nativeLabel: 'Nederlands', dir: 'ltr' }),
  Object.freeze({ code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' }),
  ...(badiniPreview?[Object.freeze({code:'kmr',label:'Badini Kurdish (preview)',nativeLabel:'کوردی (بادینی) · BETA',dir:'rtl'})]:[])
]);

export function normalizeEnabledUiLocales(value, fallback = SUPPORTED_UI_LOCALES) {
  let candidate = value;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate); }
    catch { candidate = candidate.split(/[\s,;]+/); }
  }
  if (!Array.isArray(candidate)) candidate = fallback;
  const normalized = [...new Set(candidate.map(item => String(item ?? '').trim().toLowerCase())
    .filter(code => SUPPORTED_UI_LOCALES.includes(code)))];
  if (normalized.length) return badiniPreview && !normalized.includes('kmr') ? [...normalized,'kmr'] : normalized;
  const safeFallback = [...new Set((Array.isArray(fallback) ? fallback : SUPPORTED_UI_LOCALES)
    .map(item => String(item ?? '').trim().toLowerCase())
    .filter(code => SUPPORTED_UI_LOCALES.includes(code)))];
  return safeFallback.length ? safeFallback : [DEFAULT_UI_LOCALE];
}

export function getUiLanguagePreferences(defaultValue, enabledValue, environmentDefault = DEFAULT_UI_LOCALE) {
  const enabledLocales = normalizeEnabledUiLocales(enabledValue, SUPPORTED_UI_LOCALES);
  const requestedDefault = getDefaultUiLocale(defaultValue || environmentDefault);
  const defaultLocale = enabledLocales.includes(requestedDefault) ? requestedDefault : enabledLocales[0];
  return { defaultLocale, enabledLocales };
}


export function getStoreName(value) {
  const candidate = String(value ?? '').trim();
  return candidate || DEFAULT_STORE_NAME;
}

export function getDefaultUiLocale(value) {
  const candidate = String(value ?? DEFAULT_UI_LOCALE).trim().toLowerCase();
  return SUPPORTED_UI_LOCALES.includes(candidate) ? candidate : DEFAULT_UI_LOCALE;
}

export function getStoreTimezone(value) {
  const candidate = String(value ?? '').trim() || DEFAULT_STORE_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return DEFAULT_STORE_TIMEZONE;
  }
}

// UI language and market region are separate. A language selection must not silently
// force a customer into one country's number/date conventions.
export function getIntlLocaleForUi(locale) {
  if (locale === 'ar') return 'ar';
  if (locale === 'ckb') return 'ckb';
  if (locale === 'kmr') return 'ku-Arab-IQ';
  if (locale === 'nl') return 'nl-BE';
  if (locale === 'fr') return 'fr-BE';
  return 'en-GB';
}
