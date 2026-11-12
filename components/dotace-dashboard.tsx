'use client';
import type { AppState } from '@/lib/model';
import { dashboardSummary } from '@/lib/dashboard';
import { useLanguage } from './language';

export default function Dashboard({state}:{state:AppState}) {
  const {t,language}=useLanguage();
  const summary=dashboardSummary(state,state.membership.role==='federation');
  const amount=(value:number)=>new Intl.NumberFormat(language==='en'?'en-GB':'cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:2}).format(value);
  if(!state.contracts.length)return null;
  return <dl className="funding-summary no-print" aria-label={t('Přehled financování')}>
    <div><dt>{t('Přidělené dotace')}</dt><dd>{amount(summary.awarded)}</dd></div>
    <div><dt>{t('Uplatněné výdaje')}</dt><dd>{amount(summary.claimed)}</dd></div>
  </dl>;
}
