'use client';

import { ArrowRight, ArrowUpRight, CalendarDays, Check, ClipboardCheck, FileText, FolderOpen, Plus, ShieldCheck } from 'lucide-react';
import type { AppState } from '@/lib/model';
import { dashboardSummary } from '@/lib/dashboard';
import { useLanguage } from './language';

type Props = {
  state: AppState;
  federation: boolean;
  onOpen: (id: string) => void;
  onStatus: (status: string) => void;
  onNewOrganization: () => void;
};

export default function Dashboard({ state, federation, onOpen, onStatus, onNewOrganization }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'cs-CZ';
  const amount = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const countLabel = (count: number, one: string, few: string, many: string) => `${count} ${t(count === 1 ? one : language === 'cs' && count >= 2 && count <= 4 ? few : many)}`;
  const summary = dashboardSummary(state, federation);
  const total = state.contracts.length;
  const first = summary.queue[0];
  const statuses = [
    { key: 'open', label: 'Rozpracované', count: summary.counts.open },
    { key: 'submitted', label: 'U federace', count: summary.counts.submitted },
    { key: 'approved', label: 'Schválené', count: summary.counts.approved },
  ];
  return <div className="dashboard-overview no-print">
    <section className="dashboard-totals" aria-label={t('Přehled financování')}>
      <div className="dashboard-total main-total"><span>{t('Přidělené dotace')}</span><strong>{amount(summary.awarded)} <small>CZK</small></strong><p>{countLabel(total, 'smlouva v evidenci', 'smlouvy v evidenci', 'smluv v evidenci')} <span aria-hidden="true">·</span> {countLabel(state.organizations.length, 'organizace', 'organizace', 'organizací')}</p></div>
      <div className="dashboard-total"><span>{t('Uplatněné výdaje')}</span><strong>{amount(summary.claimed)} <small>CZK</small></strong><p>{countLabel(summary.expenseCount, 'doklad v evidenci', 'doklady v evidenci', 'dokladů v evidenci')}</p></div>
      <button className="dashboard-total total-action" onClick={() => onStatus('submitted')}><span><span className="status-dot submitted" />{t(federation ? 'Čeká na vaše posouzení' : 'Odesláno federaci')}</span><strong>{summary.counts.submitted}<ArrowUpRight size={22}/></strong><p>{t(federation ? 'Otevřít frontu ke kontrole' : 'Sledovat průběh kontroly')}</p></button>
    </section>
    <div className="dashboard-panels">
      <section className="attention-panel">
        <header className="dashboard-section-heading"><div><span className="section-kicker">{t('PRACOVNÍ FRONTA')}</span><h2>{t(federation ? 'Vyúčtování ke kontrole' : 'Co je potřeba dokončit')}<span className="section-count">{summary.queue.length}</span></h2></div><span className="section-symbol">{federation ? <ShieldCheck size={20}/> : <ClipboardCheck size={20}/>}</span></header>
        {first ? <>
          <div className="attention-lead"><p>{t(federation ? 'Porovnejte doklady s originálem, rozhodněte o výdajích a uzavřete vyúčtování.' : 'Doplňte doklady, zkontrolujte částky a odešlete vyúčtování ke kontrole.')}</p><button className="button primary" onClick={() => onOpen(first.contract.id)}>{t(federation ? first.ready ? 'Dokončit schválení' : first.waiting && !first.pending ? 'Zobrazit žádost o doplnění' : 'Pokračovat v kontrole' : first.waiting || first.contract.status === 'changes' ? 'Doplnit vyúčtování' : 'Pokračovat v přípravě')}<ArrowRight size={16}/></button></div>
          <div className="attention-list">{summary.queue.slice(0, 3).map(row => {
            const organization = state.organizations.find(o => o.id === row.contract.organizationId);
            const detail = federation ? row.ready ? t('Připraveno k závěrečnému schválení') : row.pending ? countLabel(row.pending, 'výdaj k posouzení', 'výdaje k posouzení', 'výdajů k posouzení') : t('Čeká na doplnění organizace') : row.waiting ? countLabel(row.waiting, 'žádost o doplnění', 'žádosti o doplnění', 'žádostí o doplnění') : row.contract.status === 'changes' ? t('Vráceno k doplnění') : !row.items ? t('Přidejte první výdaj') : row.unchecked ? countLabel(row.unchecked, 'doklad ke kontrole', 'doklady ke kontrole', 'dokladů ke kontrole') : t('Zkontrolujte a odešlete');
            return <button key={row.contract.id} className="attention-row" onClick={() => onOpen(row.contract.id)} aria-label={`${t(federation ? 'Otevřít kontrolu' : 'Otevřít vyúčtování')} ${row.contract.number}`}><span className="queue-document"><FileText size={18}/></span><span className="queue-record"><strong>{federation ? organization?.name || row.contract.number : row.contract.number}</strong><small>{federation ? row.contract.number : t(row.contract.program)}</small></span><span className={`queue-state ${row.waiting ? 'waiting' : ''}`}>{detail}</span><ArrowUpRight size={16}/></button>;
          })}</div>
          {summary.queue.length > 3 && (federation ? <button className="queue-more" onClick={() => onStatus('submitted')}>{t('Zobrazit celou frontu')}<ArrowRight size={15}/></button> : <a className="queue-more" href="#contract-register">{t('Zobrazit všechny smlouvy')}<ArrowRight size={15}/></a>)}
        </> : <div className="dashboard-empty"><span><Check size={23}/></span><h3>{t(!total ? 'Zatím žádná smlouva' : federation ? 'Nic nečeká na vaše posouzení' : 'Vše máte připravené')}</h3><p>{t(!total ? federation ? 'Začněte organizací a její první smlouvou.' : 'Vaše smlouva se zde objeví, jakmile ji federace připraví.' : federation ? 'Nová vyúčtování se zde objeví, jakmile je organizace odešlou.' : summary.counts.submitted ? 'Odeslaná vyúčtování nyní kontroluje federace. Výsledky najdete v seznamu smluv.' : 'Všechna vaše vyúčtování jsou schválena. Rozhodnutí najdete v seznamu smluv.')}</p>{federation && !total && <button className="button secondary" onClick={onNewOrganization}><Plus size={16}/>{t('Přidat organizaci')}</button>}</div>}
      </section>
      <section className="settlement-panel"><header className="dashboard-section-heading"><div><span className="section-kicker">{t('PRŮBĚH VYÚČTOVÁNÍ')}</span><h2>{t('Od přípravy ke schválení')}</h2></div><FolderOpen size={20}/></header>
        <div className="settlement-completion"><strong>{summary.counts.approved}<span> / {total}</span></strong><span>{t('schválených vyúčtování')}</span></div>
        <div className="settlement-distribution" aria-hidden="true">{statuses.map(s => s.count > 0 && <span key={s.key} className={s.key} style={{flex:s.count}}/>)}</div>
        <div className="settlement-legend">{statuses.map(s => <button key={s.key} onClick={() => onStatus(s.key)}><span className={`status-dot ${s.key}`}/><span>{t(s.label)}</span><strong>{s.count}</strong><ArrowRight size={14}/></button>)}</div>
        {summary.nextDeadline && <div className="dashboard-deadline"><CalendarDays size={18}/><div><span>{t('Nejbližší termín odevzdání')}</span><strong>{new Intl.DateTimeFormat(locale, { day:'numeric',month:'short',year:'numeric' }).format(new Date(`${summary.nextDeadline}T12:00:00`))}</strong></div></div>}
      </section>
    </div>
  </div>;
}
