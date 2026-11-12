import test from 'node:test';
import assert from 'node:assert/strict';
import type { Contract, Item } from '../lib/model';
const { dashboardSummary } = await import(new URL('../lib/dashboard.ts', import.meta.url).href) as typeof import('../lib/dashboard');
const contract = (id: string, status: Contract['status'] = 'draft', deadline = '2027-01-15'): Contract => ({ id, organizationId:'org-a', number:id, program:'Organizace', year:2026, amount:100, validFrom:'2026-01-01', validTo:'2026-12-31', deadline, conditions:'', cashLimit:null, status, conclusion:'', reduction:0, declaredBy:'', declaredAt:'', version:1 });
const item = (id: string, contractId: string, overrides: Partial<Item> = {}): Item => ({ id, contractId, number:id, supplier:'Fictional supplier', supplierIco:'00000010', description:'Fixture', category:'materials', amount:1, claimed:1, date:'2026-11-10', payment:'bank', recipientType:'organization', recipientName:'', comment:'', orgReview:'unchecked', sfjDecision:'pending', sfjReason:'', excluded:false, fileIds:[], version:1, ...overrides });

test('dashboard money excludes removed expenses and records outside its contract scope, using cents', () => {
  const result = dashboardSummary({ contracts:[contract('a')], items:[item('a','a',{claimed:0.1}),item('b','a',{claimed:0.2}),item('excluded','a',{claimed:500,excluded:true}),item('elsewhere','b',{claimed:1000})] }, true);
  assert.equal(result.claimed,0.3); assert.equal(result.awarded,100); assert.equal(result.expenseCount,2);
});
test('federation queue distinguishes unfinished decisions, final approval and waiting for information', () => {
  const result = dashboardSummary({ contracts:[contract('wait','submitted','2026-12-01'),contract('review','submitted'),contract('ready','submitted'),contract('draft'),contract('done','approved')], items:[item('w','wait',{sfjDecision:'supplement'}),item('r','review'),item('a','ready',{sfjDecision:'accepted'}),item('x','ready',{excluded:true})] }, true);
  assert.equal(result.queue.at(-1)?.contract.id,'wait');
  assert.equal(result.queue.find(r=>r.contract.id==='ready')?.ready,true);
  assert.deepEqual(new Set(result.queue.map(r=>r.contract.id)),new Set(['wait','review','ready']));
  assert.deepEqual(result.counts,{open:1,submitted:3,approved:1});
});
test('organization sees requested information before drafts and only unfinished submission deadlines', () => {
  const result = dashboardSummary({ contracts:[contract('draft','draft','2027-02-01'),contract('fix','changes','2027-01-10'),contract('reply','submitted','2026-12-01'),contract('sent','submitted','2026-11-01'),contract('done','approved','2026-10-01')],items:[item('r','reply',{sfjDecision:'supplement'})] }, false);
  assert.deepEqual(result.queue.map(r=>r.contract.id),['reply','fix','draft']); assert.equal(result.nextDeadline,'2027-01-10');
});
test('empty and fully submitted workspaces have no invented deadlines or approvals', () => {
  const empty=dashboardSummary({contracts:[],items:[]},false);
  assert.equal(empty.nextDeadline,null); assert.equal(empty.claimed,0); assert.deepEqual(empty.queue,[]);
  const sent=dashboardSummary({contracts:[contract('sent','submitted')],items:[]},true);
  assert.equal(sent.nextDeadline,null); assert.equal(sent.queue[0].ready,false);
});
