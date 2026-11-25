const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ISO 13616 IBAN lengths from the SWIFT IBAN Registry, release 103 (17 Sep 2026).
// Length + MOD-97 validates the common IBAN envelope/check digits only; it does
// not prove that the account exists, is open, or belongs to this merchant.
const IBAN_LENGTHS = Object.freeze({
  AL:28, AD:24, AT:20, AZ:28, BH:22, BY:28, BE:16, BA:20, BR:29, VG:24,
  BG:22, BI:27, CR:22, HR:21, CY:28, CZ:24, DK:18, DJ:27, DO:28, EG:29,
  SV:28, EE:20, FK:18, FO:18, FI:18, FR:27, GE:22, DE:22, GI:23, GR:27,
  GL:18, GT:28, HN:28, HU:28, IS:26, IQ:23, IE:22, IL:23, IT:27, JO:30,
  KZ:20, XK:20, KW:30, LV:21, LB:28, LY:25, LI:21, LT:20, LU:20, MT:31,
  MR:27, MU:30, MD:24, MC:27, MN:20, ME:22, NL:18, NI:28, MK:19, NO:15,
  OM:23, PK:24, PS:29, PL:28, PT:25, QA:29, RO:24, RU:33, SM:27, ST:25,
  SA:24, RS:22, SC:31, SK:24, SI:19, SO:23, ES:24, SD:18, SE:24, CH:21,
  TL:23, TN:24, TR:26, UA:29, AE:23, GB:22, VA:22, YE:30
});

export function isValidIban(value) {
  const iban = String(value || '').replace(/\s+/g, '').toUpperCase();
  const expectedLength = IBAN_LENGTHS[iban.slice(0, 2)];
  if (!expectedLength || iban.length !== expectedLength || !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function validAccountIdentifier(value) {
  const account = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{2}/.test(account)) return isValidIban(account);
  // For non-IBAN markets a local account number remains supported, but
  // alphabetic placeholders like ABCDE are not meaningful payment instructions.
  // Format checking cannot prove an account exists: the Manager must still
  // independently confirm the beneficiary and number with the bank.
  return /^[A-Z0-9][A-Z0-9/-]{7,33}$/.test(account) &&
    (account.match(/\d/g) || []).length >= 6;
}

export function normalizeBankTransferConfig(input = {}) {
  const enabled = input.enabled === true || input.enabled === 1 || input.enabled === '1' || input.enabled === 'on';
  const bankName = clean(input.bankName, 100);
  const accountHolder = clean(input.accountHolder, 120);
  const account = clean(input.account, 40).replace(/\s+/g, ' ').toUpperCase();
  const bic = clean(input.bic, 11).replace(/\s+/g, '').toUpperCase();
  const instructions = clean(input.instructions, 500);
  const fieldsValid = bankName.length >= 2 && accountHolder.length >= 2 && validAccountIdentifier(account)
    && (!bic || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic));
  return Object.freeze({
    enabled,
    bankName,
    accountHolder,
    account,
    bic,
    instructions,
    ready: enabled && fieldsValid,
    valid: !enabled || fieldsValid
  });
}

export function normalizeBankTransactionReference(value) {
  // Bank references are case-insensitive and visual spaces are formatting only.
  // This prevents the same statement reference being entered with case/spacing
  // variations on two different orders.
  return clean(value, 100).replace(/\s+/g, '').toUpperCase();
}

export function buildBankTransferSnapshot(config, orderId) {
  const normalized = normalizeBankTransferConfig({ ...config, enabled: true });
  const id = Number(orderId);
  if (!normalized.ready || !Number.isSafeInteger(id) || id < 1) throw new Error('BANK_TRANSFER_NOT_CONFIGURED');
  return Object.freeze({
    bankName: normalized.bankName,
    accountHolder: normalized.accountHolder,
    account: normalized.account,
    bic: normalized.bic,
    instructions: normalized.instructions,
    reference: `SHOP-${id}`
  });
}

export function parseBankTransferSnapshot(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const normalized = normalizeBankTransferConfig({ ...parsed, enabled: true });
  const reference = clean(parsed.reference, 40).toUpperCase();
  if (!normalized.ready || !/^SHOP-[1-9]\d{0,11}$/.test(reference)) return null;
  return Object.freeze({
    bankName: normalized.bankName,
    accountHolder: normalized.accountHolder,
    account: normalized.account,
    bic: normalized.bic,
    instructions: normalized.instructions,
    reference
  });
}
