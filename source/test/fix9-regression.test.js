import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDateTimeDisplay} from '../src/security.js';
import {getIntlLocaleForUi} from '../src/store-config.js';
import {isValidBelgianEnterpriseNumber,validatePeppolInvoiceForm} from '../src/services/peppol-recommand.js';

const validForm={invoiceNumber:'INV-2026-001',issueDate:'2026-11-01',dueDate:'2026-12-01',
  recipient:'0208:0123456848',buyerVatNumber:'BE0123456848',buyerName:'Atelier Test',
  buyerStreet:'Rue 1',buyerCity:'Brussels',buyerPostalZone:'1000',itemName:'Consulting',
  quantity:'2.00',netPriceAmount:'100.00',vatRate:'21',iban:'BE68539007547034'};

test('FIX9: selected French locale renders French date/month in storefront and Manager',()=>{
  assert.equal(getIntlLocaleForUi('fr'),'fr-BE');
  const value='2026-11-08 14:30:00';
  const french=formatDateTimeDisplay(value,'Europe/Brussels',getIntlLocaleForUi('fr'));
  const en=formatDateTimeDisplay(value,'Europe/Brussels','en-GB');
  assert.notEqual(french,en);
  assert.match(french,/nov\./i);
  assert.doesNotMatch(french,/Nov 2026/);
  assert.equal(formatDateTimeDisplay(value,'Europe/Brussels','invalid'),en);
});

test('FIX9: Peppol 0208 validates Belgian enterprise number MOD-97 check digits',()=>{
  for(const number of ['0123456848','0308357159','0202239951'])
    assert.equal(isValidBelgianEnterpriseNumber(number),true,number);
  for(const number of ['0123456789','0123456849','0123456800','1000000000','0000000000','1000000097',
      '', '123', 'A123456848','0123456848 ','0208:0123456848',null,undefined,[]])
    assert.equal(isValidBelgianEnterpriseNumber(number),false,String(number));
});

test('FIX9: Peppol invoice rejects a changed checksum even when VAT and recipient still match',()=>{
  assert.equal(validatePeppolInvoiceForm(validForm).recipient,validForm.recipient);
  assert.throws(()=>validatePeppolInvoiceForm({...validForm,recipient:'0208:0123456789',buyerVatNumber:'BE0123456789'}),
    /INVALID_PEPPOL_RECIPIENT/);
  assert.throws(()=>validatePeppolInvoiceForm({...validForm,buyerVatNumber:'BE0123456789'}),
    /BUYER_ID_MISMATCH/);
  assert.throws(()=>validatePeppolInvoiceForm({...validForm,recipient:'0208:0123456849',buyerVatNumber:'BE0123456849'}),
    /INVALID_PEPPOL_RECIPIENT/);
});

test('FIX9: Peppol IBAN uses real ISO MOD-97, length and country check',()=>{
  for(const iban of ['BE00000000000000','BE67539007547034','BE68539007547035','BE681234','NL00ABNA0123456789',
       'DE00000000000000000000','ZZ68539007547034'])
    assert.throws(()=>validatePeppolInvoiceForm({...validForm,iban}),/INVALID_IBAN/,iban);
  const normalized=validatePeppolInvoiceForm({...validForm,iban:'be68 5390 0754 7034'});
  assert.equal(normalized.document.paymentMeans[0].iban,'BE68539007547034');
});
