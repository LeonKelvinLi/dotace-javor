// One OCR job per tab bounds memory, including while a previous file is closing.
let tail: Promise<unknown> = Promise.resolve();
export function abortError() { return new DOMException('Čtení bylo zastaveno.', 'AbortError'); }
export function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw signal.reason ?? abortError(); }
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? abortError());
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function withOcrSlot<T>(job: () => Promise<T>, signal: AbortSignal): Promise<T> {
  const previous = tail;
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  tail = previous.then(() => released);
  try { await abortable(previous, signal); checkAbort(signal); return await job(); }
  finally { release(); }
}
export function rasterSize(width: number, height: number, preferredScale = 1) {
  if (![width, height, preferredScale].every(n => Number.isFinite(n) && n > 0)) throw new Error('Dokument má neplatné rozměry.');
  const scale = Math.min(preferredScale, 2600 / Math.max(width, height), Math.sqrt(4_000_000 / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}
