"use client";

import { useState } from 'react';
import { ArrowRight, Check, FileText, Loader2, MessageSquare, TriangleAlert, X } from 'lucide-react';
import DocumentPreview from './dotace-document';
import { useLanguage } from './language';
import { categoryLabels, findings, money, type Contract, type Item, type StoredFile } from '@/lib/model';
import { reviewProgress } from '@/lib/review';

type Decision = Exclude<Item['sfjDecision'], 'pending'>;
export default function ReviewExpense({ item, contract, items, files, busy, onDecision }: {
  item: Item; contract: Contract; items: Item[]; files: StoredFile[]; busy: boolean;
  onDecision: (decision: Decision, reason: string) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [selectedFile, setSelectedFile] = useState(item.fileIds[0] || '');
  const [decision, setDecision] = useState<Decision | ''>(item.sfjDecision === 'pending' ? '' : item.sfjDecision);
  const [reason, setReason] = useState(item.sfjReason);
  const [error, setError] = useState('');
  const file = files.find(file => file.id === selectedFile);
  const issues = findings(item, contract);
  const progress = reviewProgress(items);
  const anotherPending = progress.pending.some(next => next.id !== item.id);
  const anotherWaiting = progress.waiting.some(next => next.id !== item.id);
  const canFinish = decision && decision !== 'supplement' && !anotherPending && !anotherWaiting;
  const valid = decision && (decision === 'accepted' || reason.trim());
  const choices = [
    { value: 'accepted', title: 'Přijmout výdaj', detail: 'Uznat uplatněnou částku.', Icon: Check },
    { value: 'rejected', title: 'Zamítnout výdaj', detail: 'Neuznat částku a uvést důvod.', Icon: X },
    { value: 'supplement', title: 'Vyžádat vysvětlení', detail: 'Uvést, co ještě potřebujete ověřit.', Icon: MessageSquare },
  ] as const;
  return <div className="item-editor review-editor">
    <div className="item-document">
      <div className="document-bar"><span><FileText size={16}/>{t('Originál dokladu')}</span>
        {file && <a className="text-link" href={`/api/files?id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">{t('Otevřít originál')} ↗</a>}
      </div>
      {item.fileIds.length > 1 && <select className="file-select" aria-label={t('Zobrazit přílohu')} value={selectedFile} onChange={event => setSelectedFile(event.target.value)}>
        {item.fileIds.map(id => <option key={id} value={id}>{files.find(file => file.id === id)?.name || id}</option>)}
      </select>}
      {file ? <div className="file-preview">{file.type.startsWith('image/') ? <img src={`/api/files?id=${encodeURIComponent(file.id)}`} alt={file.name}/> : <DocumentPreview file={file}/>}</div>
        : <div className="notice warning">{t('Chybí příloha dokladu.')}</div>}
    </div>
    <div className="item-entry">
      <div className="item-fields review-fields">
        <div className="review-kicker">{t('KROK 1 ZE 2 · KONTROLA VÝDAJŮ')}</div>
        <h3>{t('Rozhodněte o tomto výdaji')}</h3>
        <p className="review-instruction">{t('Porovnejte částku a účel s originálem. Pak vyberte rozhodnutí níže.')}</p>
        {file && <a className="text-link review-original-shortcut" href={`/api/files?id=${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer"><FileText size={15}/>{t('Otevřít originál')} ↗</a>}
        <div className="review-amount"><div><strong>{item.supplier}</strong><span>{item.number}</span></div><div><small>{t('Uplatněno')}</small><strong>{t(money(item.claimed))}</strong></div></div>
        <p className="review-purpose">{item.description}</p>
        <dl className="review-facts">
          <div><dt>{t('Částka dokladu (Kč)')}</dt><dd>{t(money(item.amount))}</dd></div>
          <div><dt>{t('Datum úhrady')}</dt><dd>{item.date || '—'}</dd></div>
          <div><dt>{t('Skupina nákladů')}</dt><dd>{t(categoryLabels[item.category])}</dd></div>
          <div><dt>{t('Způsob úhrady')}</dt><dd>{t(item.payment === 'cash' ? 'Hotovost' : 'Bezhotovostní platba')}</dd></div>
        </dl>
        {item.comment && <div className="review-comment"><strong>{t('Komentář organizace')}</strong><p>{item.comment}</p></div>}
        {issues.length > 0 && <div className="review-findings">{issues.map(issue => <p key={issue.code}><TriangleAlert size={15}/><span>{t(issue.message)}</span></p>)}</div>}
        <form id="review-decision" onSubmit={event => {
          event.preventDefault(); if (!valid || busy || !decision) return;
          setError(''); void onDecision(decision, reason).catch(error => setError(error.message));
        }}>
          <fieldset className="decision-options" disabled={busy}>
            <legend>{t('Vaše rozhodnutí')}</legend>
            {choices.map(({value, title, detail, Icon}) => <label key={value} className={`decision-option ${decision === value ? 'selected' : ''}`}>
              <input type="radio" name="review-decision" value={value} checked={decision === value} onChange={() => { setDecision(value); setReason(''); }} required/>
              <Icon size={18}/><span><strong>{t(title)}</strong><small>{t(detail)}</small></span>
            </label>)}
          </fieldset>
          {decision && <label className="field"><span>{t(decision === 'accepted' ? 'Poznámka SFJ (volitelné)' : decision === 'rejected' ? 'Proč výdaj zamítáte?' : 'Co má organizace doplnit?')}</span>
            <textarea rows={2} value={reason} required={decision !== 'accepted'} onChange={event => setReason(event.target.value)} disabled={busy}/>
          </label>}
          {error && <div className="notice error" role="alert">{t(error)}</div>}
        </form>
        <details className="review-more"><summary>{t('Další údaje dokladu')}</summary><dl className="review-facts">
          <div><dt>{t('IČO dodavatele')}</dt><dd>{item.supplierIco || '—'}</dd></div><div><dt>{t('Jméno / název odběratele')}</dt><dd>{item.recipientName || '—'}</dd></div>
        </dl></details>
      </div>
      <div className="item-savebar review-savebar"><div><strong>{progress.decided.length} / {progress.active.length} {t('výdajů posouzeno')}</strong>
        <small>{t(!decision ? 'Nejprve vyberte rozhodnutí.' : canFinish ? 'Dále: závěrečné schválení vyúčtování.' : anotherPending ? 'Po uložení otevřeme další výdaj.' : 'Žádost o vysvětlení zůstane otevřená.')}</small></div>
        <button className="button primary" type="submit" form="review-decision" disabled={busy || !valid}>
          {busy ? <Loader2 size={16} className="spin"/> : <ArrowRight size={16}/>}
          {t(busy ? 'Ukládám…' : decision === 'accepted' ? 'Přijmout a pokračovat' : decision === 'rejected' ? 'Zamítnout a pokračovat' : decision === 'supplement' ? 'Uložit žádost a pokračovat' : 'Vyberte rozhodnutí')}
        </button>
      </div>
    </div>
  </div>;
}
