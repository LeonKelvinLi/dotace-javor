import test from 'node:test';
import assert from 'node:assert/strict';
import type { Contract, Item } from '../lib/model';

// A URL keeps native Node TypeScript execution and bundler type checking aligned.
const { findings, submissionErrors, total } = await import(new URL('../lib/model.ts', import.meta.url).href) as typeof import('../lib/model');
const { reviewProgress } = await import(new URL('../lib/review.ts', import.meta.url).href) as typeof import('../lib/review');

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'contract-a', organizationId: 'org-a', number: 'SFJ-2026-1', program: 'Organizace',
  year: 2026, amount: 100_000, validFrom: '2026-01-01', validTo: '2026-12-31', deadline: '2027-01-15',
  conditions: 'Fictional test conditions.', cashLimit: null, status: 'draft', conclusion: '', reduction: 0,
  declaredBy: '', declaredAt: '', version: 1, ...overrides,
});
const item = (overrides: Partial<Item> = {}): Item => ({
  id: 'item-a', contractId: 'contract-a', number: 'FV-1', supplier: 'Fictional supplier', supplierIco: '00000010',
  description: 'Training equipment', category: 'materials', amount: 100, claimed: 100, date: '2026-09-10',
  payment: 'bank', recipientType: 'organization', recipientName: 'Fictional club', comment: '',
  orgReview: 'checked', sfjDecision: 'pending', sfjReason: '', excluded: false, fileIds: ['file-a'], version: 1,
  ...overrides,
});
const codes = (expense: Item, agreement = contract()) => findings(expense, agreement).map(f => f.code);

test('one invalid document reports simultaneous defects instead of hiding all but the first', () => {
  const bad = item({ number: '', supplier: '', description: '', amount: 50, claimed: 75,
    fileIds: [], date: '2026-02-30', recipientType: 'person', payment: 'cash' });
  assert.deepEqual(new Set(codes(bad)), new Set(['fields', 'amount', 'attachment', 'date', 'recipient_person', 'cash_policy']));
  const result = findings(bad, contract());
  assert.equal(result.filter(f => f.severity === 'error').length, 4);
  assert.equal(result.filter(f => f.severity === 'warning').length, 2);
});

test('a different company cannot be made eligible by a comment; individuals can be explained', () => {
  const explained = { comment: 'Fictional coach attended on behalf of this club.', orgReview: 'commented' as const };
  const company = item({ recipientType: 'other', ...explained });
  assert.ok(findings(company, contract()).some(f => f.code === 'recipient_company' && f.severity === 'error'));
  assert.ok(submissionErrors(contract(), [company]).length);
  assert.deepEqual(submissionErrors(contract(), [item({ recipientType: 'person', ...explained })]), []);
  assert.deepEqual(codes(item({ recipientType: 'none', recipientName: '' })), []);
});

test('partial claims require both an explanation and the explicit commented review state', () => {
  const partial = item({ amount: 200, claimed: 100 });
  assert.ok(codes(partial).includes('partial'));
  assert.ok(submissionErrors(contract(), [partial]).length);
  assert.ok(submissionErrors(contract(), [item({ ...partial, comment: 'Only the tournament portion.' })]).length);
  assert.ok(submissionErrors(contract(), [item({ ...partial, orgReview: 'commented', comment: '   ' })]).length);
  assert.deepEqual(submissionErrors(contract(), [item({ ...partial, orgReview: 'commented', comment: 'Only the tournament portion.' })]), []);
  assert.ok(submissionErrors(contract(), [item({ orgReview: 'unchecked' })]).length);
});

test('a commented review always contains a comment, even when no warning exists', () => {
  assert.ok(submissionErrors(contract(), [item({ orgReview: 'commented', comment: '\n  ' })]).length);
});

test('excluded and other-contract items cannot contaminate this contract settlement', () => {
  const excluded = item({ id: 'excluded', excluded: true, claimed: 1_000_000, amount: 0, recipientType: 'other', fileIds: [], orgReview: 'unchecked' });
  const elsewhere = item({ id: 'elsewhere', contractId: 'contract-b', claimed: 1_000_000, orgReview: 'unchecked' });
  assert.deepEqual(findings(excluded, contract()), []);
  assert.deepEqual(submissionErrors(contract(), [item(), excluded, elsewhere]), []);
  assert.ok(submissionErrors(contract(), [excluded, elsewhere]).some(message => message.includes('alespoň jednu')));
  assert.equal(total([item(), excluded]), 100);
});

test('totals use currency hundredths and the ceiling is checked per contract', () => {
  const expenses = [item({ id: 'a', amount: 0.1, claimed: 0.1 }), item({ id: 'b', amount: 0.2, claimed: 0.2 })];
  assert.equal(total(expenses), 0.3);
  assert.deepEqual(submissionErrors(contract({ amount: 0.3 }), expenses), []);
  assert.ok(submissionErrors(contract({ amount: 0.29 }), expenses).some(message => message.includes('částku dotace')));
  assert.equal(total([item({ amount: 10.45, claimed: 5.2 }), item({ id: 'b', amount: 20.55, claimed: 4.8 })], 'amount'), 31);
});

test('required evidence and invalid currency values cannot pass confirmed review', () => {
  assert.ok(codes(item({ fileIds: [] })).includes('attachment'));
  for (const claimed of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100.01]) {
    assert.ok(codes(item({ claimed })).includes('amount'), `claim ${claimed} must fail`);
  }
});

test('impossible payment dates fail while a real leap-day and period exceptions are distinguished', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-2-10']) {
    assert.ok(codes(item({ date })).includes('date'), `${date} must be invalid`);
  }
  assert.deepEqual(codes(item({ date: '2024-02-29' }), contract({ validFrom: '2024-01-01', validTo: '2024-12-31' })), []);
  const beforePeriod = findings(item({ date: '2025-12-31' }), contract());
  assert.deepEqual(beforePeriod.map(f => [f.code, f.severity]), [['period', 'warning']]);
});

test('unconfirmed cash policy warns at any amount and never invents a 10,000 CZK threshold', () => {
  for (const claimed of [1, 9_999, 10_000, 10_001]) {
    assert.deepEqual(codes(item({ payment: 'cash', amount: claimed, claimed })), ['cash_policy']);
  }
  assert.deepEqual(codes(item({ payment: 'bank' })), []);
  assert.deepEqual(codes(item({ payment: 'cash', amount: 600, claimed: 600 }), contract({ cashLimit: 5_000 })), []);
  assert.deepEqual(codes(item({ payment: 'cash', amount: 5_000, claimed: 5_000 }), contract({ cashLimit: 5_000 })), ['cash_limit']);
});

test('organization checks do not count as federation decisions', () => {
  const review = reviewProgress([item({orgReview:'checked'}), item({id:'b',orgReview:'commented'})]);
  assert.equal(review.remaining, 2);
  assert.equal(review.decided.length, 0);
  assert.equal(review.ready, false);
});
test('information requests block approval while undecided expenses come first', () => {
  const waiting = item({id:'waiting',sfjDecision:'supplement'});
  const pending = item({id:'pending'});
  const review = reviewProgress([waiting, item({id:'accepted',sfjDecision:'accepted'}), pending]);
  assert.equal(review.remaining, 2);
  assert.equal(review.next?.id, 'pending');
  assert.equal(review.ready, false);
  assert.equal(reviewProgress([waiting, {...pending,sfjDecision:'accepted'}]).next?.id, 'waiting');
});
test('final approval requires decisions on active expenses and cannot approve an empty claim', () => {
  const accepted = item({sfjDecision:'accepted'});
  const rejected = item({id:'rejected',sfjDecision:'rejected'});
  const excluded = item({id:'excluded',excluded:true});
  assert.equal(reviewProgress([accepted,rejected,excluded]).ready, true);
  assert.equal(reviewProgress([accepted,rejected,excluded]).decided.length, 2);
  assert.equal(reviewProgress([excluded]).ready, false);
  assert.equal(reviewProgress([]).ready, false);
});
