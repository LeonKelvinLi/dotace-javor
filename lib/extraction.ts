import { abortable, abortError, checkAbort, rasterSize, withOcrSlot } from './ocr-lifecycle.ts';
export type ExtractionMode = 'receipt' | 'organization' | 'contract';
export type ExtractionResult = { text: string; fields: Record<string, unknown>; method: string; pages: number; confidence?: number; currency?: string; sourceAmount?: number; warnings?: string[] };
const currencyPattern = /\b(?:CZK|EUR|USD|GBP|CHF|PLN|HUF|JPY|CNY|CAD|AUD|BRL)\b|Kč|[€$£¥]/gi;
function currencies(text: string): string[] {
  return [...new Set((text.match(currencyPattern) || []).map(c => ({'KČ':'CZK','€':'EUR','$':'USD','£':'GBP','¥':'JPY'}[c.toUpperCase()] || c.toUpperCase())))];
}
export function hasForeignCurrency(text: string): boolean { return currencies(text).some(c => c !== 'CZK'); }
function matchLine(text: string, pattern: RegExp) { return text.match(pattern)?.[1]?.trim().replace(/\s+/g, ' '); }
export function parseCzechAmount(value: string): number | undefined {
  let s = value.trim().replace(currencyPattern, '').replace(/[\s\u00a0\u202f']/g, '').replace(/[,.]-$/, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return undefined;
  const comma = s.lastIndexOf(','), dot = s.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    if (!new RegExp('^\\d{1,3}(?:\\'+thousands+'\\d{3})*\\'+decimal+'\\d{1,2}$').test(s)) return undefined;
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (comma >= 0 || dot >= 0) {
    const separator = comma >= 0 ? ',' : '.';
    if (new RegExp('^\\d{1,3}(?:\\'+separator+'\\d{3})+$').test(s)) s = s.split(separator).join('');
    else if (new RegExp('^\\d+\\'+separator+'\\d{1,2}$').test(s)) s = s.replace(separator, '.');
    else return undefined;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 1_000_000_000 ? Math.round(n * 100) / 100 : undefined;
}
export function parsePaymentDate(value: string): string | undefined {
  let year: number, month: number, day: number;
  const numeric = value.trim().match(/^(\d{1,4})\s*([.\/-])\s*(\d{1,2})\s*[.\/-]\s*(\d{1,4})$/);
  if (numeric) {
    if (numeric[1].length === 4) [year, month, day] = [+numeric[1], +numeric[3], +numeric[4]];
    else { [day, month, year] = [+numeric[1], +numeric[3], +numeric[4]]; if (numeric[2] === '/' && day <= 12 && month <= 12 && day !== month) return undefined; }
  } else {
    const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const named = value.trim().match(/^(?:(\d{1,2})\s+([a-z]+)|([a-z]+)\s+(\d{1,2})),?\s+(\d{4})$/i);
    if (!named) return undefined;
    day = Number(named[1] || named[4]); year = +named[5];
    month = months.findIndex(m => m.startsWith((named[2] || named[3]).toLowerCase())) + 1;
  }
  if (year < 1900 || year > 2200 || !month) return undefined;
  const result = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const date = new Date(`${result}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === result ? result : undefined;
}
export function documentTotal(text: string): { sourceAmount?: number; currency?: string } {
  // Prioritize the actual payable total over subtotal, VAT, or a running total.
  const labels = ['celkem k úhradě|částka k úhradě|k úhradě|total (?:amount )?(?:due|payable)|amount due|balance due|grand total', 'celkem včetně DPH|celková částka|výše dotace|částka dotace|grant amount|total incl(?:uding)?\\.? (?:VAT|tax)', 'celkem|total'];
  for (const label of labels) {
    const values = [...text.matchAll(new RegExp('(?:^|\\n)[ \\t]*(?:'+label+')[ \\t]*[:=]?[ \\t]*([^\\n]+)', 'gim'))].map(m => {
      const raw = m[1].trim();
      if (/[a-z]/i.test(raw.replace(currencyPattern, '').replace(/Kč/gi,''))) return {};
      const sourceAmount = parseCzechAmount(raw);
      const all = currencies(raw), documentCurrencies = currencies(text);
      return { sourceAmount, currency: all.length === 1 ? all[0] : documentCurrencies.length === 1 ? documentCurrencies[0] : undefined };
    }).filter(v => v.sourceAmount !== undefined);
    if (values.length) return values.every(v => v.sourceAmount === values[0].sourceAmount && v.currency === values[0].currency) ? values[0] : {};
  }
  return {};
}
export function parseDocumentText(text: string, mode: ExtractionMode = 'receipt'): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  const ico = matchLine(text, /(?:^|\n)[ \t]*(?:IČO|IČ|ICO|I\.Č\.|company (?:id|registration number))\s*:?\s*(\d[\d ]{6,12}\d)/i)?.replace(/\s/g, '');
  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  const bank = text.match(/(?:účet|účtu|ucet|bankovní spojení|bank account)\s*:?\s*((?:\d{1,6}-)?\d{2,10}\s*\/\s*\d{4})/i)?.[1]?.replace(/\s/g, '');
  if (mode === 'organization') {
    const name = matchLine(text, /(?:^|\n)[ \t]*(?:název organizace|organizace|příjemce|název|objednatel|organisation name|organization name|recipient|grantee)\s*:?\s*([^\n\r]+)/i);
    const address = matchLine(text, /(?:^|\n)[ \t]*(?:se sídlem|sídlo|adresa|registered address|address)\s*:?\s*([^\n\r]+)/i);
    if (name) f.name = name; if (ico?.length === 8) f.ico = ico; if (address) f.address = address;
    if (email) f.email = email; if (bank) f.bank = bank;
    const phone = text.match(/(?:telefon|tel\.?|mobil|phone)\s*:?\s*(\+?[\d ]{9,17})/i)?.[1]?.trim(); if (phone) f.phone = phone;
    const reps = [...text.matchAll(/(?:zastoupen[ýáa]|statutární zástupce|předseda|representative)\s*:?\s*([^\n\r]+)/gi)].map(x => x[1].trim());
    if (reps.length) f.representatives = reps.slice(0, 2); return f;
  }
  const number = matchLine(text, /(?:^|\n)[ \t]*(?:číslo (?:dokladu|faktury|smlouvy)|faktura(?:\s+(?:číslo|č\.?))?|doklad(?:\s+č\.?)?|smlouva\s+č\.?|(?:invoice|receipt|contract)(?:\s+(?:number|no\.?))?)\s*[:#]?\s*((?=[A-Z0-9/._-]*\d)[A-Z0-9][A-Z0-9/._-]{2,40})/i);
  if (number && /\d/.test(number)) f.number = number;
  const amount = documentTotal(text);
  if (amount.sourceAmount && amount.currency === 'CZK') { f.amount = amount.sourceAmount; if (mode === 'receipt') f.claimed = amount.sourceAmount; }
  if (mode === 'contract') return f;
  const supplier = matchLine(text, /(?:^|\n)[ \t]*(?:dodavatel|vystavil|supplier|seller|vendor|sold by|from)\s*:?\s*([^\n\r]+)/i); if (supplier) f.supplier = supplier;
  // Never silently copy the buyer's company identifier into the supplier field.
  const supplierBlock = text.match(/(?:^|\n)[ \t]*(?:dodavatel|supplier|seller|vendor|sold by|from)[^\n]*\n([\s\S]*?)(?=\n[ \t]*(?:odběratel|bill to|buyer|customer|recipient)\b|$)/i)?.[0];
  const supplierIco = supplierBlock ? matchLine(supplierBlock, /(?:IČO|IČ|ICO|company (?:id|registration number))\s*:?\s*(\d[\d ]{6,12}\d)/i)?.replace(/\s/g,'') : !/(?:odběratel|bill to|buyer|customer)/i.test(text) ? ico : undefined;
  if (supplierIco?.length === 8) f.supplierIco = supplierIco;
  const description = matchLine(text, /(?:^|\n)[ \t]*(?:popis(?: nákladu)?|předmět plnění|fakturujeme vám|účel|description|service description|purpose)\s*:?\s*([^\n\r]+)/i); if (description) f.description = description;
  const dateText = matchLine(text, /(?:^|\n)[ \t]*(?:datum (?:úhrady|platby)|uhrazeno(?: dne)?|payment date|date paid|paid on)\s*:?\s*([^\n\r]+)/i);
  if (dateText) { const date = parsePaymentDate(dateText); if (date) f.date = date; }
  if (/(?:způsob úhrady|forma úhrady|platba|payment method)\s*:?\s*(?:převod|bank|bezhotovost|wire|card|credit card|debit card)/i.test(text)) f.payment = 'bank';
  else if (/(?:způsob úhrady|forma úhrady|platba|payment method)\s*:?\s*(?:hotov|cash)/i.test(text)) f.payment = 'cash';
  const content = String(description ?? '').toLowerCase();
  if (/(osvč|služb|nájem|ubytov|doprava|trenérsk|service|rent|accommodation|transport|coaching)/i.test(content)) f.category = 'services';
  else if (/(mzda|mzdy|odvod|plat zaměstnance|salary|wages|payroll)/i.test(content)) f.category = 'wages';
  else if (/(materiál|míč|hole|dres|material|equipment|jersey|balls)/i.test(content)) f.category = 'materials';
  return f;
}
export function documentProposal(text: string, mode: ExtractionMode = 'receipt') {
  const fields = parseDocumentText(text, mode), amount = documentTotal(text), warnings: string[] = [];
  if (mode === 'receipt' && !fields.date) warnings.push('Datum skutečné úhrady nebylo spolehlivě určeno. Doplňte je podle potvrzení platby; datum vystavení ani splatnosti nestačí.');
  if (amount.sourceAmount && !amount.currency) warnings.push('Měna celkové částky není jednoznačná. Ověřte ji podle originálu.');
  return { fields, ...amount, warnings };
}
export function convertToCzk(sourceAmount: number, rate: number, source: string): { amount: number; note: string } {
  const amount = Math.round(sourceAmount * rate * 100) / 100;
  if (![sourceAmount, rate, amount].every(n => Number.isFinite(n) && n > 0) || amount >= 1_000_000_000 || !source.trim()) throw new Error('Doplňte kladný kurz a jeho zdroj / datum.');
  return { amount, note: `Přepočet ${sourceAmount} × ${rate} Kč = ${amount} Kč. Zdroj / datum kurzu: ${source.trim()}.` };
}
export async function extractDocument(file: File, mode: ExtractionMode, progress: (message: string) => void, signal?: AbortSignal): Promise<ExtractionResult> {
  if (!file.size) throw new Error('Soubor je prázdný. Vyberte jiný dokument.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Soubor může mít nejvýše 10 MB.');
  const pdfFile = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!pdfFile && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Podporujeme PDF, JPG, PNG a WebP.');
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason ?? abortError());
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error('Čtení překročilo časový limit 3 minut. Zkuste menší dokument nebo čtení opakujte.')), 180_000);
  const active = controller.signal;
  let worker: import('tesseract.js').Worker | undefined;
  let pdfTask: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
  const dispose = () => {
    const current = worker; worker = undefined;
    if (current) void current.terminate().catch(() => {});
    const loading = pdfTask; pdfTask = undefined;
    if (loading) void loading.destroy().catch(() => {});
  };
  active.addEventListener('abort', dispose, { once: true });
  const step = <T,>(promise: Promise<T>) => abortable(promise, active);
  let pageLabel = '';
  const report = (message: string) => { if (!active.aborted) progress(message); };
  const ocr = async (canvas: HTMLCanvasElement) => {
    checkAbort(active);
    if (!worker) {
      report('Připravuji OCR…');
      const { createWorker } = await step(import('tesseract.js'));
      const creating = createWorker(['ces', 'eng'], 1, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
        // Tesseract otherwise throws an uncaught exception from its worker handler.
        errorHandler: () => controller.abort(new Error('OCR se nepodařilo spustit. Zkontrolujte připojení a zkuste čtení znovu.')),
        logger: m => report(m.status === 'recognizing text' ? `${pageLabel}Čtení textu ${Math.round((m.progress ?? 0) * 100)} %` : `${pageLabel}Připravuji OCR…`),
      }).then(created => {
        if (active.aborted) { void created.terminate().catch(() => {}); checkAbort(active); }
        worker = created; return created;
      });
      await step(creating);
    }
    const result = await step(worker!.recognize(canvas));
    return { text: result.data.text, confidence: result.data.confidence };
  };
  try {
    report('Čekám na OCR…');
    return await withOcrSlot(async () => {
      if (pdfFile) {
        report('Otevírám PDF…');
        const pdfjs = await step(import('pdfjs-dist'));
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
        const bytes = await step(file.arrayBuffer());
        pdfTask = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
        const pdf = await step(pdfTask.promise);
        if (pdf.numPages > 10) throw new Error('OCR podporuje nejvýše 10 stran najednou. Nahrajte relevantní část dokumentu.');
        let text = '', confidence = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          checkAbort(active); pageLabel = `Strana ${i}/${pdf.numPages} · `;
          report(`${pageLabel}Připravuji obrázek…`);
          const page = await step(pdf.getPage(i));
          const canvas = document.createElement('canvas');
          try {
            const original = page.getViewport({ scale: 1 });
            const size = rasterSize(original.width, original.height, 2);
            const viewport = page.getViewport({ scale: size.scale });
            canvas.width = size.width; canvas.height = size.height;
            const canvasContext = canvas.getContext('2d');
            if (!canvasContext) throw new Error('Prohlížeč nepodporuje čtení obrázku.');
            await step(page.render({ canvasContext, canvas, viewport, background: 'white' }).promise);
            // Always recognize the visible page, even when the PDF has a text layer.
            const recognized = await ocr(canvas);
            text += recognized.text + '\n'; confidence += recognized.confidence;
          } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
        }
        if (!text.trim()) throw new Error('V dokumentu nebyl rozpoznán text. Zkuste ostřejší sken.');
        return { text, confidence: confidence / pdf.numPages, ...documentProposal(text, mode), method: 'PDF · OCR', pages: pdf.numPages };
      }
      report('Připravuji obrázek…');
      const decoding = createImageBitmap(file).then(bitmap => {
        if (active.aborted) { bitmap.close(); checkAbort(active); } return bitmap;
      });
      const bitmap = await step(decoding), canvas = document.createElement('canvas');
      try {
        const size = rasterSize(bitmap.width, bitmap.height);
        canvas.width = size.width; canvas.height = size.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Prohlížeč nepodporuje čtení obrázku.');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        const result = await ocr(canvas);
        if (!result.text.trim()) throw new Error('Na obrázku se nepodařilo rozpoznat text. Zkuste ostřejší fotografii.');
        return { ...result, ...documentProposal(result.text, mode), method: 'OCR', pages: 1 };
      } finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
    }, active);
  } catch (error) {
    if (active.aborted) throw active.reason;
    if (error instanceof Error && ['InvalidPDFException','PasswordException','UnknownErrorException'].includes(error.name)) throw new Error('PDF je poškozené nebo chráněné heslem. Nahrajte čitelný dokument bez hesla.');
    throw error instanceof Error ? error : new Error('Dokument se nepodařilo přečíst. Zkuste jiný soubor nebo čtení opakujte.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); active.removeEventListener('abort', dispose); dispose(); }
}
