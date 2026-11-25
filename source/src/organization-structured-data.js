/**
 * Honest Schema.org Organization markup. Never fabricate a seller identity.
 * This is intentionally not a tax compliance certificate or an invoice.
 */
const clean = (value, limit = 300) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0, limit);
export function buildStoreOrganizationStructuredData({legalName='',storeName='',businessAddress='',supportEmail='',businessPhone='',enterpriseNumber='',vatNumber='',baseUrl=''}={}) {
  const legal = clean(legalName,200);
  const address = clean(businessAddress,500);
  const email = clean(supportEmail,200);
  const phone = clean(businessPhone,80);
  const tradeName = clean(storeName,200);
  let url;
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) return null;
    url = u.origin + '/';
  } catch { return null; }
  // Incomplete Manager drafts must not appear as verified business records.
  if (!legal || !address || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const obj={
    '@context':'https://schema.org', '@type':'Organization', name: legal,
    ...(tradeName && tradeName !== legal ? {alternateName:tradeName}:{}),
    url, address, email,
    ...(phone ? {telephone:phone}:{}),
    ...(clean(enterpriseNumber,60) ? {taxID:clean(enterpriseNumber,60)}:{}),
    ...(clean(vatNumber,60) ? {vatID:clean(vatNumber,60)}:{})
  };
  return obj;
}
export function serializeJsonLdSafely(data) {
  return data ? JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029') : '';
}
