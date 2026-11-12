import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeAutofill, duplicateReceipt, receiptRecipient} from '../lib/autofill.ts';
import {documentProposal} from '../lib/extraction.ts';
const report=readFileSync(new URL('./fixtures/settlement-report.txt',import.meta.url),'utf8');
test('settlement report yields separate receipts instead of the grant or settlement totals',()=>{
 const p=documentProposal(report);assert.equal(p.receipts?.length,2);
 const first=p.receipts![0].fields,second=p.receipts![1].fields;
 assert.equal(first.number,'FV-2026-101');assert.equal(first.supplier,'Sport Vzor s.r.o.');assert.equal(first.description,'Tréninkové míče a pomůcky');assert.equal(first.category,'materials');assert.equal(first.amount,18500);assert.equal(first.claimed,18500);assert.equal(first.date,'2026-09-15');assert.equal(first.supplierIco,'00000010');assert.equal(first.payment,'bank');assert.equal(first.recipientType,'organization');
 assert.equal(second.number,'FV-2026-108');assert.equal(second.supplier,'Areál Ukázkov s.r.o.');assert.equal(second.amount,32000);assert.equal(second.claimed,24000);assert.equal(second.date,'2026-09-15');assert.equal(second.category,'services');
 for (const field of ['orgReview','sfjDecision','declaredBy','declaredAt']) assert.equal(first[field],undefined);
 assert.notEqual(first.amount,120000);assert.notEqual(first.amount,42500);assert.equal(p.warnings.length,0);
});
test('an ordinary numbered letter never becomes a settlement report',()=>{
 assert.equal(documentProposal('Meeting\n1. FV-2026-101 · Sports Ltd\nExpenses: 100 CZK').receipts,undefined);
});
test('automatic completion fills all known values and replaces empty defaults',()=>{
 const result=mergeAutofill({number:'',amount:0,claimed:0,payment:'bank',category:'services',date:'',recipientName:''},{number:'INV-1',amount:100,claimed:80,payment:'cash',category:'materials',date:'2026-09-15',recipientName:'Club'},{values:{},selection:''},{selection:'source1',manual:new Set(),isNew:true});
 assert.equal(result.value.number,'INV-1');assert.equal(result.value.amount,100);assert.equal(result.value.claimed,80);assert.equal(result.value.payment,'cash');assert.equal(result.value.category,'materials');assert.equal(result.value.recipientName,'Club');
});
test('repeat scans preserve manual corrections, including intentionally cleared values',()=>{
 const r=mergeAutofill({supplier:'Human edit',date:'',amount:150},{supplier:'OCR vendor',date:'2026-09-15',amount:100},{values:{supplier:'OCR vendor',date:'2026-09-15',amount:100},selection:'one'},{selection:'one',manual:new Set(['supplier','date','amount']),isNew:true});
 assert.deepEqual(r.value,{supplier:'Human edit',date:'',amount:150});
});
test('switching receipts replaces previous automatic data and clears unavailable values',()=>{
 const r=mergeAutofill({number:'ONE',date:'2026-09-15',amount:100,claimed:100,comment:'Human note'},{number:'TWO',amount:200,claimed:150},{values:{number:'ONE',date:'2026-09-15',amount:100,claimed:100},selection:'one'},{selection:'two',manual:new Set(['comment']),isNew:true});
 assert.equal(r.value.number,'TWO');assert.equal(r.value.date,'');assert.equal(r.value.amount,200);assert.equal(r.value.claimed,150);assert.equal(r.value.comment,'Human note');
});
test('saved receipt values survive automatic recognition; explicit restore can replace them',()=>{
 const current={supplier:'Saved vendor',amount:100,claimed:80,date:'2026-09-15'};
 const automatic=mergeAutofill(current,{supplier:'OCR different',amount:200,date:'2026-09-20'},{values:{},selection:''},{selection:'one',manual:new Set(),isNew:false});assert.deepEqual(automatic.value,current);
 const restore=mergeAutofill(current,{amount:200},{values:{},selection:''},{selection:'one',manual:new Set(['amount']),isNew:false,replace:true});assert.equal(restore.value.amount,200);
});
test('duplicate detection is scoped to the same contract and supplier and excludes updates',()=>{
 const receipt={id:'1',contractId:'a',number:'FV-2026-101',supplier:'Sport Vzor s.r.o.',supplierIco:'12345678'};
 assert.equal(duplicateReceipt([receipt],{...receipt,id:''})?.id,'1');assert.equal(duplicateReceipt([receipt],receipt),undefined);
 assert.equal(duplicateReceipt([receipt],{...receipt,id:'',contractId:'b'}),undefined);assert.equal(duplicateReceipt([receipt],{...receipt,id:'',supplier:'Other vendor',supplierIco:'87654321'}),undefined);
});

test('OCR never labels a different club as our organization',()=>{
 assert.equal(receiptRecipient({recipientName:'FK Háj, z. s.'},'Onboarding Sports Club').recipientType,'other');
 assert.equal(receiptRecipient({recipientName:'FK Haj z.s.'},'FK Háj, z. s.').recipientType,'organization');
 assert.equal(receiptRecipient({recipientName:'Jane Example',recipientType:'person'},'Sports Club').recipientType,'person');
});
