import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidIban, normalizeBankTransferConfig, buildBankTransferSnapshot, normalizeBankTransactionReference, parseBankTransferSnapshot } from '../src/services/bank-transfer.js';

test('IBAN validation checks registered country length and MOD-97 checksum', () => {
  assert.equal(isValidIban('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(isValidIban('BE68 5390 0754 7034'), true);
  assert.equal(isValidIban('IQ98 NBIQ 8501 2345 6789 012'), true);
  assert.equal(isValidIban('GB82WEST12345698765433'), false);
  assert.equal(isValidIban('BE68 5390 0754 7034 0'), false, 'valid checksum alone must not bypass the registered BE length');
  assert.equal(isValidIban('ZZ82 WEST 1234 5698 7654 32'), false, 'unknown country prefixes fail closed');
  assert.equal(isValidIban('not-an-iban'), false);
});

test('bank transfer is unavailable until the public bank details are complete and valid', () => {
  assert.equal(normalizeBankTransferConfig({ enabled: true, bankName: 'Bank', accountHolder: 'Shop' }).ready, false);
  assert.equal(normalizeBankTransferConfig({ enabled: true, bankName: 'Bank', accountHolder: 'Shop', account: 'GB82 WEST 1234 5698 7654 32' }).ready, true);
  assert.equal(normalizeBankTransferConfig({ enabled: true, bankName: 'Bank', accountHolder: 'Shop', account: 'GB82 WEST 1234 5698 7654 33' }).ready, false);
});

test('bank transfer snapshot is immutable order-specific customer instruction data', () => {
  const config = { enabled: true, bankName: 'Example Bank', accountHolder: 'ShopEasy BV', account: 'GB82 WEST 1234 5698 7654 32', bic: 'NWBKGB2L', instructions: 'Use your order reference.' };
  const snapshot = buildBankTransferSnapshot(config, 27);
  assert.equal(snapshot.reference, 'SHOP-27');
  assert.equal(parseBankTransferSnapshot(JSON.stringify(snapshot)).accountHolder, 'ShopEasy BV');
  assert.equal(parseBankTransferSnapshot(JSON.stringify({ ...snapshot, reference: 'SHOP-0' })), null);
  assert.throws(() => buildBankTransferSnapshot({ ...config, account: 'GB82WEST12345698765433' }, 27), /BANK_TRANSFER_NOT_CONFIGURED/);
});


test('bank transaction references normalize case and display whitespace before persistence', () => {
  assert.equal(normalizeBankTransactionReference(' bank Ref-123 '), 'BANKREF-123');
  assert.equal(normalizeBankTransactionReference('BANKREF-123'), 'BANKREF-123');
  assert.equal(normalizeBankTransactionReference(''), '');
});
