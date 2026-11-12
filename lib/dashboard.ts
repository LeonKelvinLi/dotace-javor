import type { AppState } from './model';

export function dashboardSummary(state: Pick<AppState, 'contracts' | 'items'>, federation: boolean) {
  const contracts = new Set(state.contracts.map(c => c.id));
  const expenses = state.items.filter(i => contracts.has(i.contractId) && !i.excluded);
  const counts = {
    open: state.contracts.filter(c => ['draft', 'changes'].includes(c.status)).length,
    submitted: state.contracts.filter(c => c.status === 'submitted').length,
    approved: state.contracts.filter(c => c.status === 'approved').length,
  };
  const queue = state.contracts.map(contract => {
    const items = expenses.filter(i => i.contractId === contract.id);
    const pending = items.filter(i => i.sfjDecision === 'pending').length;
    const waiting = items.filter(i => i.sfjDecision === 'supplement').length;
    const unchecked = items.filter(i => i.orgReview === 'unchecked').length;
    const ready = items.length > 0 && pending === 0 && waiting === 0;
    return { contract, items: items.length, pending, waiting, unchecked, ready };
  }).filter(row => federation
    ? row.contract.status === 'submitted'
    : ['draft', 'changes'].includes(row.contract.status) || (row.contract.status === 'submitted' && row.waiting > 0));
  const priority = (row: typeof queue[number]) => federation
    ? row.pending > 0 || row.ready ? 0 : 1
    : row.waiting > 0 || row.contract.status === 'changes' ? 0 : 1;
  queue.sort((a, b) => priority(a) - priority(b) || a.contract.deadline.localeCompare(b.contract.deadline) || a.contract.number.localeCompare(b.contract.number));
  return {
    awarded: state.contracts.reduce((sum, c) => sum + Math.round(c.amount * 100), 0) / 100,
    claimed: expenses.reduce((sum, i) => sum + Math.round(i.claimed * 100), 0) / 100,
    expenseCount: expenses.length,
    counts,
    queue,
    nextDeadline: state.contracts.filter(c => ['draft', 'changes'].includes(c.status)).map(c => c.deadline).sort()[0] || null,
  };
}
