import test from 'node:test';
import assert from 'node:assert/strict';
import { abortable, rasterSize, withOcrSlot } from '../lib/ocr-lifecycle.ts';
import { extractDocument } from '../lib/extraction.ts';
const deferred = <T,>() => { let resolve!: (v:T)=>void; let reject!: (e:unknown)=>void; const promise = new Promise<T>((yes,no)=>{resolve=yes;reject=no;}); return {promise,resolve,reject}; };

test('large portrait, landscape and square images stay within OCR memory bounds', () => {
  for (const [w,h] of [[6000,4000],[4000,6000],[12000,12000],[600,800]]) {
    const size = rasterSize(w,h,2);
    assert.ok(size.width * size.height <= 4_000_000);
    assert.ok(Math.max(size.width,size.height) <= 2600);
    assert.ok(Math.abs(size.width / size.height - w / h) < 0.01);
  }
  for (const n of [0,-1,Infinity,NaN]) assert.throws(()=>rasterSize(n,100));
});
test('cancellation rejects immediately and consumes a late worker failure', async () => {
  const controller = new AbortController(), work = deferred<string>();
  const job = abortable(work.promise, controller.signal);
  controller.abort();
  await assert.rejects(job, {name:'AbortError'});
  work.reject(new Error('late worker error'));
  await new Promise(resolve=>setImmediate(resolve));
});
test('a cancelled queued scan cannot let the following scan overlap a running worker', async () => {
  const started = deferred<void>(), finish = deferred<void>(); let active = 0, peak = 0;
  const first = withOcrSlot(async()=>{active++;peak=Math.max(peak,active);started.resolve();await finish.promise;active--;}, new AbortController().signal);
  await started.promise;
  const cancel = new AbortController(); let cancelledRan = false;
  const second = withOcrSlot(async()=>{cancelledRan=true;},cancel.signal);
  cancel.abort(); await assert.rejects(second,{name:'AbortError'});
  let thirdRan = false;
  const third = withOcrSlot(async()=>{thirdRan=true;active++;peak=Math.max(peak,active);active--;},new AbortController().signal);
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(thirdRan,false);
  finish.resolve(); await Promise.all([first,third]);
  assert.equal(cancelledRan,false);assert.equal(peak,1);
});
test('worker failure releases the OCR slot for a successful retry', async()=>{
  await assert.rejects(withOcrSlot(async()=>{throw new Error('bad scan');},new AbortController().signal),/bad scan/);
  assert.equal(await withOcrSlot(async()=>42,new AbortController().signal),42);
});
test('empty, oversized and unsupported documents fail before starting OCR', async()=>{
  await assert.rejects(extractDocument(new File([],'empty.pdf',{type:'application/pdf'}),'receipt',()=>{}),/prázdný/);
  await assert.rejects(extractDocument(new File([new Uint8Array(10*1024*1024+1)],'large.png',{type:'image/png'}),'receipt',()=>{}),/10 MB/);
  await assert.rejects(extractDocument(new File(['not a supported file'],'file.docx',{type:'application/octet-stream'}),'receipt',()=>{}),/Podporujeme/);
});
test('a cancelled scan cannot start PDF or OCR workers', async()=>{
  const controller = new AbortController();controller.abort();
  await assert.rejects(extractDocument(new File(['pdf'],'cancelled.pdf',{type:'application/pdf'}),'receipt',()=>{},controller.signal),{name:'AbortError'});
});
