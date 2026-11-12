export type AutofillState = { values: Record<string, unknown>; selection: string };
const empty = (value: unknown) => value === undefined || value === null || value === '' || value === 0 || Array.isArray(value) && !value.some(Boolean);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const defaults: Record<string, unknown> = { category: 'services', payment: 'bank', recipientType: 'organization', excluded: false };
/** Recognized values replace earlier automatic values, while human edits and saved data survive. */
export function mergeAutofill<T extends Record<string, unknown>>(current: T, fields: Record<string, unknown>, previous: AutofillState, options: { selection: string; manual: Set<string>; isNew: boolean; replace?: boolean }) {
  const result = {...current}; const automatic = {...previous.values};
  if (previous.selection && previous.selection !== options.selection) {
    for (const [key, value] of Object.entries(previous.values)) {
      if (!options.manual.has(key) && equal(current[key], value)) {
        (result as Record<string, unknown>)[key] = defaults[key] ?? (typeof value === 'number' ? 0 : Array.isArray(value) ? [] : '');
        delete automatic[key];
      }
    }
  }
  for (const [key,value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (options.replace || !options.manual.has(key) && (empty(result[key]) || equal(result[key], automatic[key]) || options.isNew && equal(result[key], defaults[key]))) {
      (result as Record<string, unknown>)[key] = value; automatic[key] = value;
    }
  }
  return { value: result, state: { values: automatic, selection: options.selection } };
}
export function duplicateReceipt<T extends {id:string;contractId:string;number:string;supplier:string;supplierIco:string}>(items:T[], item:{id?:string;contractId:string;number:string;supplier:string;supplierIco?:string}) {
  const normalize = (v:string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const number=normalize(item.number), supplier=normalize(item.supplier);
  if (!number || !supplier) return undefined;
  return items.find(i=>i.id!==item.id && i.contractId===item.contractId && normalize(i.number)===number && (normalize(i.supplier)===supplier || Boolean(item.supplierIco && i.supplierIco===item.supplierIco)));
}

/** A recognized buyer must not inherit the current organization's default. */
export function receiptRecipient(fields:Record<string,unknown>, organizationName:string) {
  const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(typeof fields.recipientName!=='string'||!fields.recipientName.trim()||!organizationName.trim()||['person','none'].includes(String(fields.recipientType)))return fields;
  return {...fields,recipientType:normalize(fields.recipientName)===normalize(organizationName)?'organization':'other'};
}
