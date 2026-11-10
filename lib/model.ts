export type Role = 'federation' | 'org_admin' | 'member';
export type Program = 'Organizace' | 'Talent' | 'Reprezentace' | 'Pohár předsedy';
export type Category = 'materials' | 'services' | 'wages';
export type Organization = { id: string; name: string; ico: string; address: string; email: string; phone: string; bank: string; representatives: string[] };
export type Contract = { id: string; organizationId: string; number: string; program: Program; year: number; amount: number; validFrom: string; validTo: string; deadline: string; conditions: string; cashLimit: number | null; status: 'draft' | 'submitted' | 'changes' | 'approved'; conclusion: string; reduction: number; declaredBy: string; declaredAt: string; version: number };
export type Item = { id: string; contractId: string; number: string; supplier: string; supplierIco: string; description: string; category: Category; amount: number; claimed: number; date: string; payment: 'bank' | 'cash'; recipientType: 'organization' | 'person' | 'none' | 'other'; recipientName: string; comment: string; orgReview: 'unchecked' | 'checked' | 'commented'; sfjDecision: 'pending' | 'accepted' | 'rejected' | 'supplement'; sfjReason: string; excluded: boolean; fileIds: string[]; version: number };
export type StoredFile = { id: string; organizationId: string; contractId: string; name: string; type: string; size: number; sha256: string; kind: 'receipt' | 'contract' | 'instructions' | 'decision' | 'amendment'; createdAt: string };
export type AuditEvent = { id: string; at: string; actor: string; organizationId: string; contractId: string; itemId: string; action: string; detail: string };
export type Membership = { id: string; userId: string; email: string; name: string; role: Role; organizationId: string };
export type Feedback = { id: string; text: string; at: string; author: string; organizationId: string };
export type Finding = { code: string; message: string; severity: 'error' | 'warning' };
export type AppState = { user: { userId: string; email: string; displayName: string }; membership: Membership; organizations: Organization[]; contracts: Contract[]; items: Item[]; files: StoredFile[]; audit: AuditEvent[]; members: Membership[]; feedback: Feedback[]; capabilities: { extraction: string; adviser: string } };
export const categoryLabels: Record<Category, string> = { materials: 'Spotřeba materiálu', services: 'Služby včetně OSVČ', wages: 'Mzdy včetně odvodů' };
export const declaration = 'Potvrzuji pravdivost a věcnou správnost údajů uvedených v tomto vyúčtování. Údaje jsou zavedené a zaúčtované v našem účetnictví nebo evidenci. Za věcnou správnost a skutečné uskutečnění plnění odpovídá naše organizace.';
export const money = (v: number) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(v);
export const cents = (v: number) => Math.round(v * 100);
export function total(items: Item[], field: 'claimed' | 'amount' = 'claimed') { return items.filter(i => !i.excluded).reduce((s, i) => s + cents(i[field]), 0) / 100; }
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function findings(item: Item, contract: Contract): Finding[] {
  if (item.excluded) return [];
  const out: Finding[] = [];
  const add = (code: string, message: string, severity: 'error' | 'warning' = 'warning') => out.push({ code, message, severity });
  if (!item.number.trim() || !item.supplier.trim() || !item.description.trim()) add('fields', 'Doplňte číslo dokladu, dodavatele a popis nákladu.', 'error');
  if (!Number.isFinite(item.amount) || !Number.isFinite(item.claimed) || item.amount <= 0 || item.claimed <= 0 || cents(item.claimed) > cents(item.amount)) add('amount', 'Uplatněná částka musí být kladná a nesmí překročit částku dokladu.', 'error');
  if (!item.fileIds.length) add('attachment', 'Chybí příloha dokladu.', 'error');
  if (!isCalendarDate(item.date)) add('date', 'Doplňte platné datum úhrady.', 'error');
  else if (item.date < contract.validFrom || item.date > contract.validTo) add('period', 'Datum úhrady je mimo smluvní období. Vysvětlete souvislost a ověřte podmínky smlouvy.');
  if (item.recipientType === 'other') add('recipient_company', 'Doklad na jinou firmu nelze uplatnit. Položku vyřaďte.', 'error');
  if (item.recipientType === 'person') add('recipient_person', 'Doklad je vystaven na osobu. Uveďte její vztah k organizaci a účel výdaje.');
  if (cents(item.claimed) < cents(item.amount)) add('partial', 'Uplatňujete jen část dokladu. Vysvětlete rozdělení nákladu.');
  if (item.payment === 'cash') {
    if (contract.cashLimit === null) add('cash_policy', 'Pravidlo hotovosti není potvrzené. Podklady 2025 vyžadují bezhotovostní úhradu; vysvětlete a ověřte se SFJ.');
    else if (item.amount >= contract.cashLimit) add('cash_limit', 'Hotovost dosahuje nastavené kontrolní hranice. Vysvětlete úhradu.');
  }
  return out;
}
export function submissionErrors(contract: Contract, items: Item[]) {
  const active = items.filter(i => i.contractId === contract.id && !i.excluded);
  const out: string[] = [];
  if (!active.length) out.push('Vyúčtování musí obsahovat alespoň jednu nevyřazenou položku.');
  for (const item of active) {
    const f = findings(item, contract);
    for (const x of f.filter(x => x.severity === 'error')) out.push(`${item.number || 'Doklad'}: ${x.message}`);
    if (f.some(x => x.severity === 'warning') && (!item.comment.trim() || item.orgReview !== 'commented')) out.push(`${item.number}: Upozornění vyžaduje komentář a kontrolu s komentářem.`);
    else if (item.orgReview === 'commented' && !item.comment.trim()) out.push(`${item.number}: Kontrola s komentářem vyžaduje vyplněný komentář.`);
    if (item.orgReview === 'unchecked') out.push(`${item.number}: Doklad není zkontrolovaný.`);
  }
  if (cents(total(active)) > cents(contract.amount)) out.push('Uplatněné náklady překračují částku dotace.');
  return out;
}
