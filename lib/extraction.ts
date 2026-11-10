export type ExtractionMode = 'receipt' | 'organization' | 'contract';
export type ExtractionResult = { text: string; fields: Record<string, unknown>; method: string; pages: number; confidence?: number };

function matchLine(text: string, pattern: RegExp) { return text.match(pattern)?.[1]?.trim().replace(/\s+/g, ' '); }
export function parseCzechAmount(value: string): number | undefined {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, '').replace(/(?:Kč|CZK|,-)$/i, '');
  const number = Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(?:\.\d{3})+$/.test(normalized) ? normalized.replace(/\./g, '') : normalized);
  return Number.isFinite(number) && number > 0 && number < 1_000_000_000 ? Math.round(number * 100) / 100 : undefined;
}
export function parseDocumentText(text: string, mode: ExtractionMode = 'receipt'): Record<string, unknown> {
  // Extract only labelled values. Never invent a recipient, amount, review or eligibility decision.
  const f: Record<string, unknown> = {};
  const ico = matchLine(text, /(?:IČO|IČ|ICO|I\.Č\.)\s*:?\s*(\d[\d ]{6,12}\d)/i)?.replace(/\s/g, '');
  const email = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0];
  const bank = text.match(/(?:účet|účtu|ucet|bankovní spojení)\s*:?\s*((?:\d{1,6}-)?\d{2,10}\s*\/\s*\d{4})/i)?.[1]?.replace(/\s/g, '');
  if (mode === 'organization') {
    const name = matchLine(text, /(?:název organizace|organizace|příjemce|název|objednatel)\s*:?\s*([^\n\r]+)/i);
    const address = matchLine(text, /(?:se sídlem|sídlo|adresa)\s*:?\s*([^\n\r]+)/i);
    if (name) f.name = name;
    if (ico?.length === 8) f.ico = ico;
    if (address) f.address = address;
    if (email) f.email = email;
    if (bank) f.bank = bank;
    const phone = text.match(/(?:telefon|tel\.?|mobil)\s*:?\s*(\+?[\d ]{9,17})/i)?.[1]?.trim();
    if (phone) f.phone = phone;
    const reps = [...text.matchAll(/(?:zastoupen[ýáa]|statutární zástupce|předseda)\s*:?\s*([^\n\r]+)/gi)].map(x => x[1].trim());
    if (reps.length) f.representatives = reps.slice(0, 2);
    return f;
  }
  const number = matchLine(text, /(?:číslo (?:dokladu|faktury|smlouvy)|faktura(?:\s+(?:č\.?|číslo))?|doklad(?:\s+č\.?)?|smlouva\s+č\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9/._-]{2,40})/i);
  if (number) f.number = number;
  const amount = text.match(/(?:celkem k úhradě|částka k úhradě|k úhradě|celkem včetně DPH|celková částka|výše dotace|částka dotace)\s*:?\s*(\d[\d .\u00a0\u202f]*(?:,\d{1,2})?)\s*(?:Kč|CZK)?/i)?.[1] ?? text.match(/(?:^|\n)\s*celkem\s*:?\s*(\d[\d .\u00a0\u202f]*(?:,\d{1,2})?)\s*(?:Kč|CZK)?/i)?.[1];
  if (amount) { const v = parseCzechAmount(amount); if (v !== undefined) { f.amount = v; if (mode === 'receipt') f.claimed = v; } }
  if (mode === 'contract') return f;
  const supplier = matchLine(text, /(?:dodavatel|vystavil|supplier)\s*:?\s*([^\n\r]+)/i);
  if (supplier) f.supplier = supplier;
  if (ico?.length === 8) f.supplierIco = ico;
  const description = matchLine(text, /(?:popis(?: nákladu)?|předmět plnění|fakturujeme vám|účel)\s*:?\s*([^\n\r]+)/i);
  if (description) f.description = description;
  const dateText = matchLine(text, /(?:datum (?:úhrady|platby)|uhrazeno(?: dne)?)\s*:?\s*(\d{1,4}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,4})/i);
  if (dateText) {
    const p = dateText.replace(/\s/g, '').split(/[.\/-]/);
    const date = p[0].length === 4 ? `${p[0]}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}` : `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(date))) f.date = date;
  }
  if (/(?:způsob úhrady|forma úhrady|platba)\s*:?\s*(?:převod|bank|bezhotovost)/i.test(text)) f.payment = 'bank';
  else if (/(?:způsob úhrady|forma úhrady|platba)\s*:?\s*hotov/i.test(text)) f.payment = 'cash';
  const content = String(description ?? '').toLowerCase();
  if (/\b(osvč|služb|nájem|ubytov|doprava|trenérsk)/i.test(content)) f.category = 'services';
  else if (/(mzda|mzdy|odvod|plat zaměstnance)/i.test(content)) f.category = 'wages';
  else if (/(materiál|míč|hole|dres)/i.test(content)) f.category = 'materials';
  return f;
}

export async function extractDocument(file: File, mode: ExtractionMode, progress: (message: string) => void): Promise<ExtractionResult> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Soubor může mít nejvýše 10 MB.');
  let worker: import('tesseract.js').Worker | undefined;
  const ocr = async (input: File | HTMLCanvasElement) => {
    if (!worker) {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker(['ces', 'eng'], 1, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
        logger: m => progress(`Čtení textu ${Math.round((m.progress ?? 0) * 100)} %`),
      });
    }
    const result = await worker.recognize(input);
    return { text: result.data.text, confidence: result.data.confidence };
  };
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      progress('Otevírám PDF…');
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true });
      const pdf = await task.promise;
      if (pdf.numPages > 100) { await task.destroy(); throw new Error('Automatické čtení podporuje nejvýše 100 stran. Nahrajte relevantní část nebo údaje zadejte ručně.'); }
      let text = '', scanned = 0;
      try {
        for (let i = 1; i <= pdf.numPages; i++) {
          progress(`Čtu stranu ${i} z ${pdf.numPages}…`);
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          let pageText = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
          if (pageText.trim().length < 30) {
            if (++scanned > 10) throw new Error('OCR podporuje nejvýše 10 skenovaných stran najednou. Vyberte relevantní část dokumentu.');
            const viewport = page.getViewport({ scale: 1.8 });
            const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
            const canvasContext = canvas.getContext('2d');
            if (!canvasContext) throw new Error('Prohlížeč nepodporuje čtení obrázku.');
            await page.render({ canvasContext, canvas, viewport }).promise;
            pageText = (await ocr(canvas)).text;
            canvas.width = 0; canvas.height = 0;
          }
          text += pageText + '\n'; page.cleanup();
        }
        return { text, fields: parseDocumentText(text, mode), method: scanned ? 'PDF + OCR' : 'Text PDF', pages: pdf.numPages };
      } finally { await task.destroy(); }
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Podporujeme PDF, JPG, PNG a WebP.');
    const result = await ocr(file);
    if (!result.text.trim()) throw new Error('Na obrázku se nepodařilo rozpoznat text. Zkuste ostřejší fotografii nebo ruční zápis.');
    return { ...result, fields: parseDocumentText(result.text, mode), method: 'OCR', pages: 1 };
  } finally { await worker?.terminate(); }
}
