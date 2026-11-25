import { moneyCents, currencyMinorUnitFactor } from './security.js';

const MAX_RULES = 250;
const MAX_SHIPPING_FEE_MAJOR = 100000;
const normalizeName = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
const normalizePostal = value => String(value ?? '').normalize('NFKC').toLocaleUpperCase('en').replace(/[^A-Z0-9]/g, '').slice(0, 20);
const safeLines = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').slice(0, 25000);

function validateCountry(country, allowedCountries) {
  if (!country || country === '*' || country.length < 2 || country.length > 80 || !/^[\p{L}\p{M} .,'’()&/\-]+$/u.test(country)) return false;
  if (!Array.isArray(allowedCountries) || allowedCountries.length === 0) return true;
  return allowedCountries.some(item => normalizeName(item) === normalizeName(country));
}
function validateCity(city) {
  return city === '*' || (city.length >= 1 && city.length <= 100 && /^[\p{L}\p{M}\d .,'’()&/\-]+$/u.test(city));
}
function validatePostalPrefix(prefix) {
  return prefix === '*' || (/^[A-Za-z0-9]{1,20}$/.test(prefix));
}
function selectorKey(rule) {
  return [normalizeName(rule.country), normalizeName(rule.city), rule.postalPrefix === '*' ? '*' : normalizePostal(rule.postalPrefix)].join('|');
}
function commonRuleParts(line, lineNumber, allowedCountries) {
  const parts = line.split('|').map(part => part.trim());
  if (parts.length < 3) return { error: `Line ${lineNumber}: use Country | City or * | Postal prefix or * | value.` };
  const [country, city, postalPrefix] = parts;
  if (!validateCountry(country, allowedCountries)) return { error: `Line ${lineNumber}: country is invalid or is not in the delivery-country list.` };
  if (!validateCity(city)) return { error: `Line ${lineNumber}: city must be * or a valid city/town name.` };
  if (!validatePostalPrefix(postalPrefix)) return { error: `Line ${lineNumber}: postal prefix must be * or 1–20 letters/numbers without spaces.` };
  return { country, city, postalPrefix };
}
function getRuleLines(text) {
  return safeLines(text).split('\n').map((line, index) => ({ raw: line.trim(), lineNumber: index + 1 })).filter(entry => entry.raw && !entry.raw.startsWith('#'));
}

/** Format per-line shipping overrides: Country | City or * | Postal prefix or * | fee in store currency. */
export function parseShippingZoneRules(text, currency = 'EUR', allowedCountries = []) {
  const lines = getRuleLines(text);
  const errors = [];
  const rules = [];
  if (lines.length > MAX_RULES) return { valid: false, errors: [`Use no more than ${MAX_RULES} shipping rules.`], rules: [] };
  const seen = new Set();
  for (const entry of lines) {
    const parts = entry.raw.split('|');
    if (parts.length !== 4) { errors.push(`Line ${entry.lineNumber}: use exactly 4 fields separated by |.`); continue; }
    const common = commonRuleParts(entry.raw, entry.lineNumber, allowedCountries);
    if (common.error) { errors.push(common.error); continue; }
    const feeInput = parts[3].trim();
    const feeCents = moneyCents(feeInput, currency);
    if (feeCents === null || feeCents < 0 || feeCents > MAX_SHIPPING_FEE_MAJOR * currencyMinorUnitFactor(currency)) {
      errors.push(`Line ${entry.lineNumber}: delivery fee must be a non-negative amount with the selected currency's decimal precision, up to ${MAX_SHIPPING_FEE_MAJOR}.`);
      continue;
    }
    const rule = { ...common, feeCents, lineNumber: entry.lineNumber };
    const key = selectorKey(rule);
    if (seen.has(key)) { errors.push(`Line ${entry.lineNumber}: duplicate country/city/postal-prefix selector.`); continue; }
    seen.add(key);
    rules.push(rule);
  }
  return { valid: errors.length === 0, errors, rules };
}

/** Format per-line tax overrides: Country | City or * | Postal prefix or * | percent (0–100, up to 2 decimals) | tax shipping (yes/no). */
export function parseTaxRules(text, allowedCountries = []) {
  const lines = getRuleLines(text);
  const errors = [];
  const rules = [];
  if (lines.length > MAX_RULES) return { valid: false, errors: [`Use no more than ${MAX_RULES} tax rules.`], rules: [] };
  const seen = new Set();
  for (const entry of lines) {
    const parts = entry.raw.split('|').map(part => part.trim());
    if (parts.length !== 5) { errors.push(`Line ${entry.lineNumber}: use exactly 5 fields separated by |.`); continue; }
    const [country, city, postalPrefix, rateText, shippingTaxableText] = parts;
    const common = commonRuleParts([country, city, postalPrefix].join(' | '), entry.lineNumber, allowedCountries);
    if (common.error) { errors.push(common.error); continue; }
    if (!/^(?:\d{1,3})(?:[.,]\d{1,2})?$/.test(rateText)) { errors.push(`Line ${entry.lineNumber}: rate must be 0–100 percent with up to two decimal places.`); continue; }
    const rate = Number(rateText.replace(',', '.'));
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { errors.push(`Line ${entry.lineNumber}: rate must be from 0 to 100 percent.`); continue; }
    const normalizedShippingTax = shippingTaxableText.toLowerCase();
    if (!['yes', 'no', 'true', 'false', '1', '0'].includes(normalizedShippingTax)) { errors.push(`Line ${entry.lineNumber}: tax shipping must be yes or no.`); continue; }
    const rule = { ...common, rateBps: Math.round(rate * 100), shippingTaxable: ['yes', 'true', '1'].includes(normalizedShippingTax), lineNumber: entry.lineNumber };
    const key = selectorKey(rule);
    if (seen.has(key)) { errors.push(`Line ${entry.lineNumber}: duplicate country/city/postal-prefix selector.`); continue; }
    seen.add(key);
    rules.push(rule);
  }
  return { valid: errors.length === 0, errors, rules };
}

/** Choose the most-specific matching selector; exact city+postal-prefix beats either one alone. */
export function selectCommerceRule(rules, destination) {
  if (!Array.isArray(rules) || !destination) return null;
  const country = normalizeName(destination.country);
  const city = normalizeName(destination.city);
  const postal = normalizePostal(destination.postalCode);
  const matches = rules.filter(rule => normalizeName(rule.country) === country &&
    (rule.city === '*' || normalizeName(rule.city) === city) &&
    (rule.postalPrefix === '*' || postal.startsWith(normalizePostal(rule.postalPrefix))));
  matches.sort((a, b) => {
    const aSpecific = Number(a.city !== '*') + Number(a.postalPrefix !== '*');
    const bSpecific = Number(b.city !== '*') + Number(b.postalPrefix !== '*');
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    const prefixDifference = (b.postalPrefix === '*' ? 0 : b.postalPrefix.length) - (a.postalPrefix === '*' ? 0 : a.postalPrefix.length);
    if (prefixDifference) return prefixDifference;
    if (a.lineNumber !== undefined && b.lineNumber !== undefined) return a.lineNumber - b.lineNumber;
    return 0;
  });
  return matches[0] || null;
}

function roundedRatio(numerator, denominator) {
  const n = BigInt(numerator), d = BigInt(denominator);
  if (n < 0n || d <= 0n) throw new Error('INVALID_TAX_BASE');
  const result = (n + d / 2n) / d;
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MONEY_OVERFLOW');
  return Number(result);
}

/** Compute a configured rule's tax snapshot in currency minor units. No jurisdiction/rate is inferred. */
export function calculateConfiguredTax({ taxableItemsCents, shippingCents, rateBps, includesTax, shippingTaxable }) {
  for (const amount of [taxableItemsCents, shippingCents, rateBps]) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_TAX_BASE');
  }
  if (rateBps > 10000) throw new Error('INVALID_TAX_RATE');
  if (typeof includesTax !== 'boolean' || typeof shippingTaxable !== 'boolean') throw new Error('INVALID_TAX_MODE');
  const taxableShipping = shippingTaxable ? shippingCents : 0;
  const taxableBase = BigInt(taxableItemsCents) + BigInt(taxableShipping);
  // Round once on the total taxable base. Rounding product tax and shipping tax
  // separately could produce a one-minor-unit discrepancy on small orders.
  const denominator = includesTax ? 10000 + rateBps : 10000;
  const taxCents = roundedRatio(taxableBase * BigInt(rateBps), denominator);
  if (!Number.isSafeInteger(taxCents) || taxCents < 0) throw new Error('MONEY_OVERFLOW');
  return taxCents;
}

export function pricingRulesHaveErrors(shippingParsed, taxParsed) {
  return !shippingParsed?.valid || !taxParsed?.valid;
}

export function normalizeCommerceRuleText(value) { return safeLines(value); }
export function normalizeCommerceDestinationValue(value) { return normalizeName(value); }
export function normalizeCommercePostalCode(value) { return normalizePostal(value); }
