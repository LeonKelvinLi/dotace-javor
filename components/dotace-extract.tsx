'use client';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScanText, LoaderCircle, Check, AlertCircle } from 'lucide-react';
import { extractDocument, convertToCzk, type ExtractionMode, type ExtractionResult } from '@/lib/extraction';

function DotaceExtract({ file, mode = 'receipt', onExtract }: { file: File; mode?: ExtractionMode; onExtract: (fields: Record<string, unknown>) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [result, setResult] = useState<ExtractionResult | null>(null), [error, setError] = useState(''), [aiEnabled,setAIEnabled] = useState(false);
  const [rate, setRate] = useState(''), [rateSource, setRateSource] = useState('');
  useEffect(() => { fetch('/api/ai').then(r=>r.json() as Promise<{enabled:boolean}>).then(r=>setAIEnabled(r.enabled===true)).catch(()=>{}); }, []);
  const current = useRef<AbortController | null>(null);
  const run = useCallback(async (useAI = false) => {
    current.current?.abort();
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setError(''); setResult(null); setMessage('Připravuji OCR…');
    try {
      // Every file passes through local OCR. Optional AI only refines an OCR result.
      const recognized = await extractDocument(file, mode, setMessage, controller.signal);
      if (controller.signal.aborted) return;
      if (useAI) {
        setMessage('AI ověřuje dokument…'); const body = new FormData(); body.set('file', file); body.set('mode', mode);
        const response = await fetch('/api/extract', { method: 'POST', body, signal: controller.signal });
        const data = await response.json() as ExtractionResult & { error?: string };
        if (!response.ok) throw new Error(data.error || 'AI čtení se nezdařilo.');
        if (!controller.signal.aborted) setResult(data);
      } else setResult(recognized);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Čtení se nezdařilo. Zkuste je znovu.');
    } finally { if (current.current === controller) setBusy(false); }
  }, [file, mode]);
  useEffect(() => {
    setRate(''); setRateSource('');
    void run();
    return () => { current.current?.abort(); };
  }, [run]);
  function cancel() { current.current?.abort(); setBusy(false); setMessage('Čtení zastaveno.'); }
  const foreign = Boolean(result?.currency && result.currency !== 'CZK');
  function apply(convert = false) {
    if (!result) return;
    try {
      setError(''); const fields = {...result.fields};
      if (foreign) { fields.amount = 0; if (mode === 'receipt') fields.claimed = 0; }
      if (convert) {
        const converted = convertToCzk(result.sourceAmount!, Number(rate.replace(',','.')), rateSource);
        fields.amount = converted.amount; if (mode === 'receipt') fields.claimed = converted.amount;
        fields.extractionNote = `${result.currency}: ${converted.note}`;
      }
      onExtract(fields);
    } catch (e) { setError(e instanceof Error ? e.message : 'Přepočet se nezdařil.'); }
  }
  return <div className="extract-panel" style={{ border: '1px solid #d9e4dc', borderRadius: 12, padding: 14, marginTop: 12, background: '#f6faf6' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div><strong style={{ fontSize: 13 }}>Automatické čtení dokumentu</strong><p style={{ fontSize: 12, color: '#66756b', margin: '3px 0 0' }}>{`OCR se spouští automaticky a čte všechny stránky v prohlížeči. PDF, JPG, PNG, WebP · do 10 MB a 10 stran.${aiEnabled?' AI odešle vybraný soubor do OpenAI.':''} Návrh ověřte podle originálu.`}</p></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button type="button" className="btn secondary" onClick={()=>void run()} disabled={busy}>
          <span aria-hidden="true" translate="no">{busy ? <LoaderCircle size={16} className="spin" /> : <ScanText size={16} />}</span>
          <span key={String(busy)}>{busy ? 'Probíhá OCR' : 'Zopakovat OCR'}</span>
        </button>
        {busy && <button type="button" className="btn secondary" onClick={cancel}><span>Zastavit</span></button>}
        {aiEnabled && result && <button type="button" className="btn primary" disabled={busy} onClick={()=>void run(true)}><span>Ověřit pomocí AI</span></button>}
      </div>
    </div>
    <p role="status" aria-live="polite" translate="no" style={{ fontSize: 12, marginTop: 10 }}>{busy ? message : result ? 'OCR dokončeno. Zkontrolujte návrh níže.' : message === 'Čtení zastaveno.' ? message : ''}</p>
    {error && <div role="alert" style={{ color: '#a13e34', fontSize: 13, marginTop: 10 }}><span aria-hidden="true"><AlertCircle size={14} /></span><p>{error}</p><p>Příloha a rozepsané údaje zůstávají zachované. Čtení můžete zopakovat.</p></div>}
    {result && <div style={{ marginTop: 12 }}>
      <p style={{ fontSize: 12 }}>{`${result.method}${result.pages > 0 ? ` · ${result.pages} stran` : ''}${result.confidence !== undefined ? ` · jistota OCR ${Math.round(result.confidence)} %` : ''}`}</p>
      {result.warnings?.map(w=><p key={w} role="status" style={{color:'#8a5919',fontSize:12}}>{w}</p>)}
      <details><summary style={{ cursor: 'pointer', fontSize: 13 }}>Rozpoznaný text</summary><textarea aria-label="Rozpoznaný text" translate="no" value={result.text} readOnly rows={7} style={{ width: '100%', marginTop: 8 }} /></details>
      {foreign && <div style={{marginTop:12,padding:12,border:'1px solid #ddd5ba',borderRadius:8}}>
        <strong style={{fontSize:13}}>{`Doklad v ${result.currency}${result.sourceAmount ? ` · ${result.sourceAmount.toLocaleString('cs-CZ')}` : ''}`}</strong>
        <p style={{fontSize:12}}>Vyúčtování je v Kč. Zadejte kurz použitý ve vaší evidenci a jeho zdroj / datum. Přepočet se uloží do komentáře dokladu.</p>
        {result.sourceAmount && mode === 'receipt' && <>
          <label style={{display:'block',fontSize:12}}><span>{`Kurz Kč za 1 ${result.currency}`}</span><input aria-label={`Kurz Kč za 1 ${result.currency}`} inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} style={{width:'100%',marginTop:4}} /></label>
          <label style={{display:'block',fontSize:12,marginTop:8}}><span>Zdroj a datum kurzu</span><input aria-label="Zdroj a datum kurzu" value={rateSource} onChange={e=>setRateSource(e.target.value)} placeholder="Např. kurz použitý v účetnictví, datum" style={{width:'100%',marginTop:4}} /></label>
          <button type="button" className="btn primary" style={{marginTop:10}} disabled={!rate.trim()||!rateSource.trim()} onClick={()=>apply(true)}>Použít údaje a přepočet do Kč</button>
        </>}
      </div>}
      {Object.keys(result.fields).length > 0 ? <><p style={{ fontSize: 12, color: '#66756b' }}>{`Rozpoznáno ${Object.keys(result.fields).length} polí. Použití návrhu změní formulář; uložení potvrdíte zvlášť.`}</p><button type="button" className="btn primary" onClick={() => apply()}><span aria-hidden="true"><Check size={16} /></span><span>{foreign?'Použít údaje bez částky':'Použít rozpoznané údaje'}</span></button></> : <p style={{ fontSize: 13 }}>Text byl přečten. Dokladové údaje nebyly nalezeny; text můžete zkopírovat. Smlouvy a obecné podklady přiložte ve Smlouva a podmínky.</p>}
    </div>}
  </div>;
}

// A broken OCR view must never unmount the receipt editor or discard its draft.
class ExtractionBoundary extends Component<{children: ReactNode}, {failed: boolean; attempt: number}> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="extract-panel" role="alert"><p>Panel OCR se nepodařilo zobrazit. Rozepsaný formulář zůstává zachovaný.</p><button type="button" className="btn secondary" onClick={()=>this.setState(s=>({failed:false,attempt:s.attempt+1}))}><span>Obnovit OCR</span></button></div>;
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
export default function SafeExtraction(props: { file: File; mode?: ExtractionMode; onExtract: (fields: Record<string, unknown>) => void }) {
  return <ExtractionBoundary key={`${props.file.name}:${props.file.lastModified}:${props.file.size}`}><DotaceExtract {...props} /></ExtractionBoundary>;
}
