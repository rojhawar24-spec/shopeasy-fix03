/**
 * Stable, indexable language URLs for public storefront content.
 * The store's enabled languages and default language come from Manager Settings.
 * User cookies still work for navigation; a valid ?lang= query is authoritative on
 * indexable GET pages, so crawlers and shared links see deterministic content.
 */
import { SUPPORTED_UI_LOCALES } from './store-config.js';
import { parseLocalRedirect } from './local-navigation.js';

const INDEXABLE_EXACT_PATHS = new Set([
  '/', '/shop', '/faq', '/contact', '/stories', '/privacy', '/terms', '/cookies',
  '/shipping-returns', '/imprint', '/withdrawal-form'
]);

export function isIndexableStorefrontPath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/') || pathname.startsWith('//')) return false;
  if (INDEXABLE_EXACT_PATHS.has(pathname)) return true;
  const match = /^\/(?:product|category)\/([^/]+)$/.exec(pathname);
  if (!match) return false;
  try {
    // Product/category slugs support Sorani and Arabic letters. Reject an
    // encoded path separator, a double-encoded separator and controls.
    const slug = decodeURIComponent(match[1]);
    return /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}-]*$/u.test(slug);
  } catch { return false; }
}

export function seoLanguagePreferences(enabledLocales, defaultLocale) {
  const enabled = [...new Set((Array.isArray(enabledLocales) ? enabledLocales : [])
    .filter(code => SUPPORTED_UI_LOCALES.includes(code)))];
  const fallback = enabled.length ? enabled : ['en'];
  return { enabledLocales: fallback, defaultLocale: fallback.includes(defaultLocale) ? defaultLocale : fallback[0] };
}

export function indexedLocaleFromQuery(value, enabledLocales, pathname) {
  if (!isIndexableStorefrontPath(pathname) || typeof value !== 'string') return null;
  return seoLanguagePreferences(enabledLocales).enabledLocales.includes(value) ? value : null;
}

export function localizedPublicPath(pathname, locale, defaultLocale) {
  if (!isIndexableStorefrontPath(pathname)) return null;
  if (!SUPPORTED_UI_LOCALES.includes(locale) || !SUPPORTED_UI_LOCALES.includes(defaultLocale)) return null;
  return pathname + (locale === defaultLocale ? '' : `?lang=${encodeURIComponent(locale)}`);
}

export function buildIndexableSeoLinks({baseUrl='', pathname='/', locale='en', enabledLocales=['en'], defaultLocale='en', pageNumber=1}={}) {
  const preferences = seoLanguagePreferences(enabledLocales, defaultLocale);
  if (!isIndexableStorefrontPath(pathname)) return {canonical:'', alternates:[]};
  let origin;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash || u.port) return {canonical:'', alternates:[]};
    origin = u.origin;
  } catch { return {canonical:'', alternates:[]}; }
  const chosenLocale = preferences.enabledLocales.includes(locale) ? locale : preferences.defaultLocale;
  const canonicalPath = localizedPublicPath(pathname, chosenLocale, preferences.defaultLocale);
  // Each unfiltered catalogue page is an independent document for search engines.
  // Never use arbitrary query strings in a canonical URL.
  const page = Number.isSafeInteger(pageNumber) && pageNumber>=2 && pageNumber<=10000 &&
    (pathname==='/shop'||pathname.startsWith('/category/')) ? pageNumber : 1;
  const withPage = path => { const url = new URL(path, origin); if(page>1) url.searchParams.set('page',String(page)); return url.toString(); };
  const canonical = withPage(canonicalPath);
  const alternates = preferences.enabledLocales.map(code => ({
    hreflang: code,
    href: withPage(localizedPublicPath(pathname, code, preferences.defaultLocale))
  }));
  alternates.push({ hreflang: 'x-default', href: withPage(pathname) });
  return {canonical, alternates};
}

export function withSelectedPublicLanguage(returnTo, locale, defaultLocale) {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/';
  try {
    const u = parseLocalRedirect(returnTo);
    if (!u) return '/';
    if (isIndexableStorefrontPath(u.pathname)) {
      if (locale === defaultLocale) u.searchParams.delete('lang');
      else if (SUPPORTED_UI_LOCALES.includes(locale)) u.searchParams.set('lang', locale);
    }
    return u.pathname + u.search;
  } catch { return '/'; }
}

export function sitemapLocalePaths(paths, enabledLocales, defaultLocale) {
  const preferences = seoLanguagePreferences(enabledLocales, defaultLocale);
  return [...new Set(paths.flatMap(path => preferences.enabledLocales.map(locale =>
    localizedPublicPath(path, locale, preferences.defaultLocale)).filter(Boolean)))];
}

/** Align listing metadata with the page actually rendered after row-count bounds.
 * Existing links already encode the enabled/default language convention, so do
 * not infer it again from a visitor's cookie or a new default preference.
 */
export function resolveCatalogueSeoPagination({canonical='', alternates=[], pageNumber=1}={}) {
  const page = Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 1000000 ? pageNumber : 1;
  let canonicalUrl;
  try {
    canonicalUrl = new URL(canonical);
    if (canonicalUrl.protocol !== 'https:' || canonicalUrl.username || canonicalUrl.password || canonicalUrl.port || canonicalUrl.hash ||
        !(canonicalUrl.pathname === '/shop' || canonicalUrl.pathname.startsWith('/category/')) ||
        !isIndexableStorefrontPath(canonicalUrl.pathname)) return {canonical:'',alternates:[]};
  } catch { return {canonical:'',alternates:[]}; }
  const withRenderedPage = url => {
    url.searchParams.delete('page');
    if (page > 1) url.searchParams.set('page',String(page));
    return url.toString();
  };
  const resolvedAlternates = (Array.isArray(alternates) ? alternates : []).flatMap(alternate => {
    if (!alternate || ![...SUPPORTED_UI_LOCALES,'x-default'].includes(alternate.hreflang)) return [];
    try {
      const url = new URL(alternate.href);
      if (url.origin !== canonicalUrl.origin || url.pathname !== canonicalUrl.pathname || url.username || url.password || url.hash) return [];
      return [{hreflang:alternate.hreflang,href:withRenderedPage(url)}];
    } catch { return []; }
  });
  return {canonical:withRenderedPage(canonicalUrl),alternates:resolvedAlternates};
}
