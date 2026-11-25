const STRICT_MODE = 'standard';
const SIMPLIFIED_COD_MODE = 'simplified_cod';

export const MARKET_SETUP_MODES = Object.freeze({
  STANDARD: STRICT_MODE,
  SIMPLIFIED_COD: SIMPLIFIED_COD_MODE
});

export function normalizeMarketSetupMode(value) {
  return String(value || '').trim() === SIMPLIFIED_COD_MODE ? SIMPLIFIED_COD_MODE : STRICT_MODE;
}

// A merchant delivering to Belgium cannot bypass Belgian business disclosure
// requirements by selecting the lightweight COD setup profile. The delivery
// country list is authoritative on the server; UI language and currency are not.
const BELGIUM_COUNTRY_NAMES = new Set(['be', 'belgium', 'belgie', 'belgique', 'belgien', 'belgio', 'belgica']);
export function deliversToBelgium(countries = []) {
  return Array.isArray(countries) && countries.some(value => {
    if (typeof value !== 'string') return false;
    const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return BELGIUM_COUNTRY_NAMES.has(normalized);
  });
}

export function effectiveLaunchMode(mode, deliveryCountries = []) {
  return deliversToBelgium(deliveryCountries) ? STRICT_MODE : normalizeMarketSetupMode(mode);
}

export function minimumCustomerTermsLength(mode, deliveryCountries = []) {
  return effectiveLaunchMode(mode, deliveryCountries) === SIMPLIFIED_COD_MODE ? 20 : 40;
}

export function launchGateMessage(mode, deliveryCountries = []) {
  return effectiveLaunchMode(mode, deliveryCountries) === SIMPLIFIED_COD_MODE
    ? 'The manager must finish the basic store contact, delivery coverage, customer terms and product setup before accepting orders.'
    : 'The manager must finish business identity, tax, delivery-country coverage and customer-policy setup before accepting orders.';
}

export function evaluateLaunchReadiness({
  mode = STRICT_MODE,
  deliveryCountries = [],
  storeName = '',
  supportEmail = '',
  businessPhone = '',
  enterpriseNumber = '',
  legalName = '',
  businessAddress = '',
  policies = false,
  pricesIncludeTax = false,
  shippingConfigured = true,
  deliveryCountriesConfigured = false,
  sellableProductCount = 0,
  currencyReviewComplete = true
} = {}) {
  const setupMode = effectiveLaunchMode(mode, deliveryCountries);
  const hasContact = Boolean(String(supportEmail || '').trim() || String(businessPhone || '').trim());
  const hasTerms = policies !== null && typeof policies === 'object'
    ? String(Object(policies).terms || '').trim().length >= (setupMode === SIMPLIFIED_COD_MODE ? 20 : 40)
    : Boolean(policies);

  if (setupMode === SIMPLIFIED_COD_MODE) {
    return Boolean(
      String(storeName || '').trim() &&
      hasContact &&
      hasTerms &&
      shippingConfigured &&
      deliveryCountriesConfigured &&
      Number(sellableProductCount) > 0 &&
      currencyReviewComplete
    );
  }

  return Boolean(
    String(storeName || '').trim() &&
    String(supportEmail || '').trim() &&
    String(businessPhone || '').trim() &&
    String(enterpriseNumber || '').trim() &&
    String(legalName || '').trim() &&
    String(businessAddress || '').trim() &&
    policies === true &&
    pricesIncludeTax &&
    shippingConfigured &&
    deliveryCountriesConfigured &&
    Number(sellableProductCount) > 0 &&
    currencyReviewComplete
  );
}
