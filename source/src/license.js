// ShopEasy 2.8.51 — license metadata status (not a cryptographic entitlement system).
// Do not add a real key to source control. Set values as deployment secrets/environment variables.
const KEY_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLicenseInfo(env = process.env) {
  const licensedTo = String(env.LICENSED_TO || '').trim().slice(0, 160);
  const licensorName = String(env.LICENSOR_NAME || '').trim().slice(0, 160);
  const licenseEmail = String(env.LICENSE_EMAIL || '').trim().slice(0, 254);
  const licenseKey = String(env.LICENSE_KEY || '').trim();
  const licenseDate = String(env.LICENSE_DATE || '').trim();
  const licenseType = String(env.LICENSE_TYPE || 'single-storefront').trim();
  const keyFormatValid = KEY_PATTERN.test(licenseKey);
  const parsedDate = DATE_PATTERN.test(licenseDate) ? new Date(`${licenseDate}T00:00:00Z`) : null;
  const dateFormatValid = Boolean(parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === licenseDate);
  const knownType = licenseType === 'single-storefront';
  const configured = Boolean(licensedTo && licensorName && licenseEmail && keyFormatValid && dateFormatValid && knownType);
  const missing = [];
  if (!licensorName) missing.push('LICENSOR_NAME');
  if (!licensedTo) missing.push('LICENSED_TO');
  if (!licenseEmail) missing.push('LICENSE_EMAIL');
  if (!licenseKey) missing.push('LICENSE_KEY');
  else if (!keyFormatValid) missing.push('LICENSE_KEY (must be 32 URL-safe characters)');
  if (!licenseDate) missing.push('LICENSE_DATE');
  else if (!dateFormatValid) missing.push('LICENSE_DATE (YYYY-MM-DD)');
  if (!knownType) missing.push('LICENSE_TYPE (unsupported value)');
  return Object.freeze({
    configured,
    status: configured ? 'metadata-configured-unverified' : 'incomplete',
    licensedTo: licensedTo || '',
    licensorName: licensorName || '',
    licenseEmail: licenseEmail || '',
    licenseDate: dateFormatValid ? licenseDate : '',
    licenseType: knownType ? licenseType : 'unknown',
    keyFormatValid,
    dateFormatValid,
    missing,
    note: 'Metadata validation only. This does not prove ownership, legal authority, payment, signature, or cryptographic validity.'
  });
}

export function warnIfLicenseMetadataIncomplete(info = getLicenseInfo()) {
  if (!info.configured) {
    // Intentionally generic: never print the key or other secret values.
    console.warn(`[license] License metadata is incomplete (${info.missing.join(', ')}). Store will continue; this is not proof of a valid license.`);
  }
  return info;
}
