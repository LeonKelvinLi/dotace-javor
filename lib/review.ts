import type { Item } from './model';

export function reviewProgress(items: Item[]) {
  const active = items.filter(item => !item.excluded);
  const pending = active.filter(item => item.sfjDecision === 'pending');
  const waiting = active.filter(item => item.sfjDecision === 'supplement');
  const decided = active.filter(item => ['accepted', 'rejected'].includes(item.sfjDecision));
  return {
    active, pending, waiting, decided,
    remaining: pending.length + waiting.length,
    ready: active.length > 0 && decided.length === active.length,
    next: pending[0] || waiting[0],
  };
}
