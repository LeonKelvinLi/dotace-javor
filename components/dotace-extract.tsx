'use client';
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScanText } from 'lucide-react';
import { extractDocument, convertToCzk, type ExtractionMode, type ExtractionContext, type ExtractionResult } from '@/lib/extraction';

type Props = { file: File; mode?: ExtractionMode; onExtract: (fields: Record<string, unknown>, context: ExtractionContext) => void; onBusyChange?: (busy: boolean) => void };
function DotaceExtract({ file, mode = 'receipt', onExtract, onBusyChange }: Props) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [documentResult, setResult] = useState<ExtractionResult | null>(null), [error, setError] = useState(''), [aiEnabled,setAIEnabled] = useState(false);
  const [selected, setSelected] = useState(0);
  const result = documentResult ? {...documentResult, ...(documentResult.receipts?.[selected] || {})} : null;
  const callbacks = useRef({onExtract,onBusyChange}); callbacks.current = {onExtract,onBusyChange};
  const selection = `${file.name}:${file.size}:${file.lastModified}:${selected}`;
  useEffect(()=>{callbacks.current.onBusyChange?.(busy); return ()=>callbacks.current.onBusyChange?.(false);},[busy]);
  useEffect(()=>{
    if (!documentResult) return;
    const active = documentResult.receipts?.[selected] || documentResult;
    const fields = {...active.fields};
    if (active.currency && active.currency !== 'CZK') { fields.amount=0; if(mode==='receipt') fields.claimed=0; }
    callbacks.current.onExtract(fields,{selection,isReport:Boolean(documentResult.receipts)});
  },[documentResult,selected,selection,mode]);
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
        fields.amount = converted.amount; if (mode === 'receipt') fields.claimed = convertToCzk(result.sourceClaimed ?? result.sourceAmount!, Number(rate.replace(',','.')), rateSource).amount;
        fields.extractionNote = `${result.currency}: ${converted.note}${mode === 'receipt' && fields.claimed !== converted.amount ? ` Uplatněno po přepočtu: ${fields.claimed} Kč.` : ''}`;
      }
      callbacks.current.onExtract(fields, {selection,replace:true,isReport:Boolean(documentResult?.receipts)});
    } catch (e) { setError(e instanceof Error ? e.message : 'Přepočet se nezdařil.'); }
  }
  const count = result ? Object.keys(result.fields).length : 0;
  return <section className="extract-panel" aria-label="Údaje z dokumentu">
    <div className="extract-heading">
      <strong key={`${busy}:${count}`}>{busy ? 'Čtení dokladu' : result ? `Vyplněno ${count} údajů` : 'Údaje z dokladu'}</strong>
      <div className="extract-actions">
        {busy ? <button type="button" className="btn" onClick={cancel}><span>Zastavit</span></button> : <button type="button" className="btn" onClick={()=>void run()}><ScanText size={14}/><span>Načíst znovu</span></button>}
        {aiEnabled && result && <button type="button" className="btn" disabled={busy} onClick={()=>void run(true)}><span>Ověřit pomocí AI</span></button>}
      </div>
    </div>
    <p role="status" aria-live="polite" className="extract-status"><span key={busy?message:result?'done':message}>{busy ? message : result ? 'Údaje jsou ve formuláři. Zkontrolujte je podle originálu.' : message === 'Čtení zastaveno.' ? message : ''}</span></p>
    {error && <div role="alert" className="extract-warning"><p>{error}</p><p>Rozepsané údaje zůstaly zachované.</p></div>}
    {result && <>
      {documentResult!.receipts && <label className="extract-report"><span>Vyberte doklad z vyúčtování</span><select aria-label="Doklad ve vyúčtování" value={selected} onChange={e=>{setSelected(Number(e.target.value));setRate('');setRateSource('');}}>{documentResult!.receipts.map((receipt,i)=><option key={i} value={i}>{`${i+1}. ${receipt.fields.number} · ${receipt.fields.supplier}`}</option>)}</select></label>}
      {result.warnings?.map(w=><p key={w} className="extract-warning">{w.startsWith("Datum skutečné úhrady") ? "Ověřte datum úhrady podle potvrzení platby." : w}</p>)}
      {foreign && <div className="extract-conversion">
        <strong>{`Částka v ${result.currency}${result.sourceAmount ? `: ${result.sourceAmount.toLocaleString('cs-CZ')}` : ''}`}</strong>
        <p>Pro vyúčtování doplňte přepočet do Kč.</p>
        {result.sourceAmount && mode === 'receipt' && <>
          <label className="field"><span>{`Kurz Kč za 1 ${result.currency}`}</span><input aria-label={`Kurz Kč za 1 ${result.currency}`} inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} /></label>
          <label className="field"><span>Zdroj a datum kurzu</span><input aria-label="Zdroj a datum kurzu" value={rateSource} onChange={e=>setRateSource(e.target.value)} placeholder="Použitý kurz a datum" /></label>
          <button type="button" className="btn primary" disabled={!rate.trim()||!rateSource.trim()} onClick={()=>apply(true)}>Přepočítat do Kč</button>
        </>}
      </div>}
      {!count && <p>Dokladové údaje se nepodařilo určit. Doplňte je do formuláře; přečtený text najdete níže.</p>}
      <details className="extract-details"><summary>Podrobnosti čtení</summary>
        <p>{`${result.method}${result.pages > 0 ? ` · ${result.pages} stran` : ''}${result.confidence !== undefined ? ` · jistota OCR ${Math.round(result.confidence)} %` : ''}`}</p>
        <textarea aria-label="Rozpoznaný text" translate="no" value={result.text} readOnly rows={7} style={{width:'100%'}} />
        {!!count && <div className="extract-restore"><button type="button" className="btn" onClick={()=>apply()}><span>Znovu vyplnit z dokumentu</span></button></div>}
      </details>
    </>}
  </section>;
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
export default function SafeExtraction(props: Props) {
  return <ExtractionBoundary key={`${props.file.name}:${props.file.lastModified}:${props.file.size}`}><DotaceExtract {...props} /></ExtractionBoundary>;
}
