'use client';
import { useEffect, useState } from 'react';
import { ScanText, LoaderCircle, Check, AlertCircle } from 'lucide-react';
import { extractDocument, type ExtractionMode, type ExtractionResult } from '@/lib/extraction';

export default function DotaceExtract({ file, mode = 'receipt', onExtract }: { file: File; mode?: ExtractionMode; onExtract: (fields: Record<string, unknown>) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [result, setResult] = useState<ExtractionResult | null>(null), [error, setError] = useState(''), [aiEnabled,setAIEnabled] = useState(false);
  useEffect(() => { fetch('/api/ai').then(r=>r.json() as Promise<{enabled:boolean}>).then(r=>setAIEnabled(r.enabled===true)).catch(()=>{}); }, []);
  useEffect(() => { setResult(null); setError(''); }, [file]);
  async function run(useAI = false) {
    setBusy(true); setError(''); setResult(null);
    try {
      if (useAI) {
        setMessage('AI čte dokument…'); const body=new FormData(); body.set('file',file); body.set('mode',mode);
        const response=await fetch('/api/extract',{method:'POST',body}); const data=await response.json() as ExtractionResult & {error?:string};
        if (!response.ok) throw new Error(data.error||'AI čtení se nezdařilo.'); setResult(data);
      } else setResult(await extractDocument(file, mode, setMessage));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Čtení se nezdařilo. Údaje lze vyplnit ručně.'); }
    finally { setBusy(false); }
  }
  return <div className="extract-panel" style={{ border: '1px solid #d9e4dc', borderRadius: 12, padding: 14, marginTop: 12, background: '#f6faf6' }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}><div><strong style={{ fontSize: 13 }}>Předvyplnit z dokumentu</strong><p style={{ fontSize: 12, color: '#66756b', margin: '3px 0 0' }}>OCR čte soubor v prohlížeči.{aiEnabled?' AI odešle vybraný soubor do OpenAI.':''} Návrh vždy ověřte.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="btn secondary" onClick={()=>run()} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ScanText size={16} />}{busy ? message : 'Přečíst OCR'}</button>{aiEnabled&&<button type="button" className="btn primary" disabled={busy} onClick={()=>run(true)}>Přečíst pomocí AI</button>}</div></div>
    {error && <p role="alert" style={{ color: '#a13e34', fontSize: 13, marginTop: 10 }}><AlertCircle size={14} style={{ display: 'inline' }} /> {error}</p>}
    {result && <div style={{ marginTop: 12 }}><p style={{ fontSize: 12 }}>{result.method} · {result.pages} stran{result.confidence !== undefined ? ` · jistota OCR ${Math.round(result.confidence)} %` : ''}</p><details><summary style={{ cursor: 'pointer', fontSize: 13 }}>Rozpoznaný text</summary><textarea aria-label="Rozpoznaný text" value={result.text} readOnly rows={7} style={{ width: '100%', marginTop: 8 }} /></details>{Object.keys(result.fields).length > 0 ? <><p style={{ fontSize: 12, color: '#66756b' }}>Rozpoznáno {Object.keys(result.fields).length} polí. Použití návrhu změní formulář; uložení potvrdíte zvlášť.</p><button type="button" className="btn primary" onClick={() => onExtract(result.fields)}><Check size={16} /> Použít rozpoznané údaje</button></> : <p style={{ fontSize: 13 }}>Text byl přečten. Označená pole se nepodařilo spolehlivě určit; zkopírujte je do formuláře ručně.</p>}</div>}
  </div>;
}
