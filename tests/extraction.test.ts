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
