'use client';

import {useState} from 'react';
import {Check, FileText, Loader2, MessageSquare, TriangleAlert, X} from 'lucide-react';
import DocumentPreview from './dotace-document';
import {useLanguage} from './language';
import {categoryLabels, findings, money, type Contract, type Item, type StoredFile} from '@/lib/model';
import {reviewProgress} from '@/lib/review';

type Decision=Exclude<Item['sfjDecision'],'pending'>;
export default function ReviewExpense({item,contract,items,files,busy,onDecision}:{
  item:Item; contract:Contract; items:Item[]; files:StoredFile[]; busy:boolean;
  onDecision:(decision:Decision,reason:string)=>Promise<unknown>;
}) {
  const {t}=useLanguage();
  const [selectedFile,setSelectedFile]=useState(item.fileIds[0]||'');
  const [decision,setDecision]=useState<''|'rejected'|'supplement'>('');
  const [reason,setReason]=useState('');
  const [error,setError]=useState('');
  const file=files.find(file=>file.id===selectedFile);
  const issues=findings(item,contract);
  const progress=reviewProgress(items);
  const save=async(value:Decision,note:string)=>{
    if(busy)return;
    setError('');
    try{await onDecision(value,note);}catch(error){setError(error instanceof Error?error.message:String(error));}
  };
  const choose=(value:'rejected'|'supplement')=>{
    setDecision(value);setReason(item.sfjDecision===value?item.sfjReason:'');
  };
  return <div className="item-editor review-editor">
    <div className="item-document">
      {item.fileIds.length>1 && <div className="attachment-tabs" aria-label={t('Přílohy')}>{item.fileIds.map(id=><button type="button" key={id} aria-pressed={selectedFile===id} onClick={()=>setSelectedFile(id)}>{files.find(file=>file.id===id)?.name||id}</button>)}</div>}
      {file ? <div className="file-preview">{file.type.startsWith('image/') ? <><a className="text-link" href={`/api/files?id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">{t('Otevřít originál')} ↗</a><img src={`/api/files?id=${encodeURIComponent(file.id)}`} alt={file.name}/></> : <DocumentPreview file={file}/>}</div> : <div className="notice warning">{t('Chybí příloha dokladu.')}</div>}
    </div>
    <div className="item-entry">
      <div className="item-fields review-fields">
        {file&&<a className="text-link review-original-shortcut" href={`/api/files?id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer"><FileText size={15}/>{t('Otevřít originál')} ↗</a>}
        <div className="review-amount"><strong>{item.supplier}</strong><div><small>{t('Uplatněno')}</small><strong>{t(money(item.claimed))}</strong></div></div>
        <p className="review-purpose">{item.description}</p>
        <dl className="review-facts">
          {item.amount!==item.claimed&&<div><dt>{t('Částka dokladu (Kč)')}</dt><dd>{t(money(item.amount))}</dd></div>}
          <div><dt>{t('Datum úhrady')}</dt><dd>{item.date||'—'}</dd></div>
          <div><dt>{t('Skupina nákladů')}</dt><dd>{t(categoryLabels[item.category])}</dd></div>
          <div><dt>{t('Způsob úhrady')}</dt><dd>{t(item.payment==='cash'?'Hotovost':'Bezhotovostní platba')}</dd></div>
          {item.supplierIco&&<div><dt>{t('IČO dodavatele')}</dt><dd>{item.supplierIco}</dd></div>}
          {item.recipientName&&<div><dt>{t('Jméno / název odběratele')}</dt><dd>{item.recipientName}</dd></div>}
        </dl>
        {item.comment&&<div className="review-comment"><strong>{t('Komentář organizace')}</strong><p>{item.comment}</p></div>}
        {item.sfjReason&&!decision&&<div className="review-comment"><strong>{t('Vyjádření SFJ')}</strong><p>{item.sfjReason}</p></div>}
        {issues.length>0&&<div className="review-findings">{issues.map(issue=><p key={issue.code}><TriangleAlert size={15}/><span>{t(issue.message)}</span></p>)}</div>}
        <form id="review-decision" onSubmit={event=>{event.preventDefault();if(decision&&reason.trim())void save(decision,reason);}}>
          <div className="decision-actions">
            <button className="button primary" type="button" disabled={busy} onClick={()=>void save('accepted',item.sfjDecision==='accepted'?item.sfjReason:'')}><Check size={17}/>{t('Přijmout výdaj')}</button>
            <button className="button secondary" type="button" disabled={busy} aria-pressed={decision==='rejected'} onClick={()=>choose('rejected')}><X size={17}/>{t('Zamítnout výdaj')}</button>
            <button className="button secondary" type="button" disabled={busy} aria-pressed={decision==='supplement'} onClick={()=>choose('supplement')}><MessageSquare size={17}/>{t('Vyžádat vysvětlení')}</button>
          </div>
          {decision&&<label className="field"><span>{t(decision==='rejected'?'Proč výdaj zamítáte?':'Co má organizace doplnit?')}</span><textarea autoFocus rows={3} required value={reason} onChange={event=>setReason(event.target.value)} disabled={busy}/></label>}
          {error&&<div className="notice error" role="alert">{t(error)}</div>}
        </form>
      </div>
      <div className="item-savebar review-savebar"><span>{progress.decided.length} / {progress.active.length} {t('výdajů posouzeno')}</span>
        {decision&&<button className="button primary" type="submit" form="review-decision" disabled={busy||!reason.trim()}>{busy&&<Loader2 size={16} className="spin"/>}{t(decision==='rejected'?'Zamítnout a pokračovat':'Odeslat žádost')}</button>}
        {!decision&&busy&&<Loader2 size={17} className="spin"/>}
      </div>
    </div>
  </div>;
}
