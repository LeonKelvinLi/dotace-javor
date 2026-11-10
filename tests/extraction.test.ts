import test from 'node:test';
import assert from 'node:assert/strict';

const { parseCzechAmount, parseDocumentText } = await import(new URL('../lib/extraction.ts', import.meta.url).href) as typeof import('../lib/extraction');

test('Czech amounts retain thousands and cents across common printed separators', () => {
  for (const input of ['1 234,56 Kč', '1\u00a0234,56', '1\u202f234,56 CZK', '1.234,56']) {
    assert.equal(parseCzechAmount(input), 1234.56, input);
  }
  assert.equal(parseCzechAmount('12 345,-'), 12345);
  assert.equal(parseCzechAmount('1.234,-'), 1234);
  assert.equal(parseCzechAmount('1.234 Kč'), 1234);
  assert.equal(parseCzechAmount('1234.56'), 1234.56);
  for (const input of ['', 'n/a', '-200 Kč', 'Infinity', '1 000 000 000 Kč']) {
    assert.equal(parseCzechAmount(input), undefined, input);
  }
});

test('the payable total wins over VAT and earlier subtotals', () => {
  const fields = parseDocumentText(`Faktura číslo: FV-2026-042
Dodavatel: Sportovní model s.r.o.
Základ daně: 1 000,00 Kč
DPH celkem: 210,00 Kč
Celkem bez DPH: 1 000,00 Kč
Celkem k úhradě: 1 210,00 Kč
Datum splatnosti: 20. 10. 2026
Datum úhrady: 15. 10. 2026
Popis: Nájem sportovní haly`, 'receipt');
  assert.equal(fields.amount, 1210);
  assert.equal(fields.claimed, 1210);
  assert.equal(fields.number, 'FV-2026-042');
  assert.equal(fields.supplier, 'Sportovní model s.r.o.');
  assert.equal(fields.date, '2026-10-15');
});

test('due date is not evidence of payment and missing labels do not invent values', () => {
  const fields = parseDocumentText('Datum vystavení: 1. 10. 2026\nDatum splatnosti: 15. 10. 2026\nDPH: 210,00 Kč', 'receipt');
  assert.equal(fields.date, undefined);
  assert.equal(fields.amount, undefined);
  assert.equal(fields.claimed, undefined);
  assert.equal(fields.payment, undefined);
  assert.equal(fields.recipientType, undefined);
  assert.equal(fields.orgReview, undefined);
  assert.equal(fields.sfjDecision, undefined);
});

test('organization extraction keeps two statutory representatives and labelled contacts', () => {
  const fields = parseDocumentText(`Název organizace: FK Ukázka, z. s.
IČO: 12345678
Sídlo: Příkladná 12, Modelové Město
E-mail: klub@example.test
Telefon: +420 123 456 789
Bankovní spojení: 123-1234567890 / 0800
Zastoupená: Jana Modelová
Statutární zástupce: Pavel Ukázkový`, 'organization');
  assert.equal(fields.name, 'FK Ukázka, z. s.');
  assert.equal(fields.ico, '12345678');
  assert.equal(fields.address, 'Příkladná 12, Modelové Město');
  assert.equal(fields.email, 'klub@example.test');
  assert.equal(fields.bank, '123-1234567890/0800');
  assert.deepEqual(fields.representatives, ['Jana Modelová', 'Pavel Ukázkový']);
});

test('contract extraction does not turn a grant into an already claimed expense', () => {
  const fields = parseDocumentText('Číslo smlouvy: SFJ-2026-T-001\nVýše dotace: 80 000,00 Kč\nDatum úhrady: 10. 9. 2026', 'contract');
  assert.equal(fields.number, 'SFJ-2026-T-001');
  assert.equal(fields.amount, 80000);
  assert.equal(fields.claimed, undefined);
  assert.equal(fields.date, undefined);
});

test('ordinary prose mentioning an invoice does not invent an invoice number', () => {
  assert.deepEqual(parseDocumentText('Vážení členové, zveme vás na setkání.\nTento dopis není faktura ani potvrzení o úhradě.'), {});
});

test('foreign-currency totals never become CZK claims without a verified conversion', () => {
  for (const currency of ['EUR', '€', 'USD', '$', 'GBP', '£', 'CHF', 'PLN']) {
    const fields = parseDocumentText(`Číslo faktury: QA-2026-042\nCelkem k úhradě: 1 210,00 ${currency}`);
    assert.equal(fields.number, 'QA-2026-042');
    assert.equal(fields.amount, undefined, currency);
    assert.equal(fields.claimed, undefined, currency);
  }
});

const { documentProposal, parsePaymentDate, convertToCzk } = await import(new URL('../lib/extraction.ts', import.meta.url).href) as typeof import('../lib/extraction');
test('English invoices extract identifiers, supplier, total, category and actual payment date', () => {
  const p = documentProposal('INVOICE TEST DOCUMENT\nInvoice number: EN-2026-011\nSupplier: Example Sports Ltd\nCompany ID: 12345678\nDescription: Training venue rental\nSubtotal: CZK 1,000.00\nVAT: CZK 210.00\nTotal due: CZK 1,210.00\nDue date: 30 October 2026\nPayment date: October 20, 2026\nPayment method: Bank transfer');
  assert.equal(p.fields.number, 'EN-2026-011'); assert.equal(p.fields.supplier, 'Example Sports Ltd');
  assert.equal(p.fields.supplierIco, '12345678'); assert.equal(p.fields.amount, 1210); assert.equal(p.fields.date,'2026-10-20'); assert.equal(p.fields.category,'services'); assert.equal(p.fields.payment,'bank');
});
test('foreign invoices retain original amount and currency for explicit documented conversion', () => {
  const p = documentProposal('Invoice no.: EN-2026-012\nTotal due: EUR 1,210.00');
  assert.equal(p.sourceAmount,1210); assert.equal(p.currency,'EUR'); assert.equal(p.fields.amount,undefined);
  const conversion = convertToCzk(p.sourceAmount!,25,'Test rate 2026-10-20'); assert.equal(conversion.amount,30250); assert.match(conversion.note,/Test rate/);
  for (const rate of [0,-1,Infinity,NaN]) assert.throws(()=>convertToCzk(1210,rate,'Test rate'));
  assert.throws(()=>convertToCzk(1210,25,''));
});
test('invalid and ambiguous payment dates are not guessed', () => {
  for (const input of ['31.2.2026','2026-02-29','10/11/2026','November 31, 2026']) assert.equal(parsePaymentDate(input),undefined,input);
  assert.equal(parsePaymentDate('2024-02-29'),'2024-02-29'); assert.equal(parsePaymentDate('20 October 2026'),'2026-10-20');
});
test('a buyer IČO preceding the seller is never used as the supplier ID', () => {
  const p = documentProposal('Bill to: Our Club\nIČO: 11111111\nSupplier: Sports Ltd\nIČO: 22222222\nTotal due: 100 CZK'); assert.equal(p.fields.supplierIco,'22222222');
});
test('conflicting totals require review and localized money formats retain precision', () => {
  assert.equal(documentProposal('Total due: 100 CZK\nTotal due: 200 CZK').fields.amount,undefined);
  assert.equal(parseCzechAmount('EUR 1,234.56'),1234.56); assert.equal(parseCzechAmount('1.234,56 EUR'),1234.56);
  assert.equal(parseCzechAmount('1,234,567.89 USD'),1234567.89); assert.equal(parseCzechAmount('1,23,4.56'),undefined);
});

test('an unlabelled currency is not assumed to be CZK', () => {
  const p = documentProposal('Invoice number: EN-2026-099\nTotal due: 1,210.00');
  assert.equal(p.sourceAmount,1210); assert.equal(p.currency,undefined); assert.equal(p.fields.amount,undefined);
  assert.ok(p.warnings.some(w=>w.includes('Měna')));
});
