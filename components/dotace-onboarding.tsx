"use client";
import {ArrowRight, Building2, Check, FileText, Send, ShieldCheck} from "lucide-react";
import {useLanguage} from "./language";
import type {AppState} from "@/lib/model";

type Props = {state:AppState;busy:boolean;onContinue:()=>void;onAddOrganization:()=>void;onAddContract:()=>void;onInvite:()=>void;onOpen:(id:string)=>void};
export default function Onboarding({state,busy,onContinue,onAddOrganization,onAddContract,onInvite,onOpen}:Props){
  const {t}=useLanguage();
  const federation=state.membership.role==='federation';
  const editable=state.contracts.find(c=>c.status==='changes')||state.contracts.find(c=>c.status==='draft');
  const submitted=state.contracts.find(c=>c.status==='submitted');
  const setup=federation&&(!state.contracts.length||(!state.membership.onboardingCompletedAt&&!state.members.some(m=>m.role==='org_admin')));
  const steps=setup?[
    {title:'Přidejte organizaci',detail:'Komu je dotace určená.',icon:Building2,done:state.organizations.length>0},
    {title:'Založte smlouvu',detail:'Částka dotace a termín vyúčtování.',icon:FileText,done:state.contracts.length>0},
    {title:'Pozvěte správce organizace',detail:'Nahraje doklady a odešle je ke kontrole.',icon:Send,done:state.members.some(m=>m.role==='org_admin')},
  ]:federation?[
    {title:'Otevřete odeslané vyúčtování',detail:'Najdete ho ve filtru Ke kontrole.',icon:FileText},
    {title:'Posuďte každý výdaj',detail:'Přijměte, zamítněte nebo požádejte o vysvětlení.',icon:Check},
    {title:'Schvalte vyúčtování',detail:'Potvrďte závěr a případné krácení.',icon:ShieldCheck},
  ]:[
    {title:'Nahrajte doklady',detail:'Údaje se načtou automaticky.',icon:FileText},
    {title:'Zkontrolujte a uložte',detail:'Porovnejte údaje s originálem.',icon:Check},
    {title:state.membership.role==='member'?'Předejte správci organizace':'Odešlete federaci',detail:'Federace výdaje posoudí a schválí.',icon:Send},
  ];
  let action=onContinue,label='Otevřít přehled';
  if(setup){action=!state.organizations.length?onAddOrganization:!state.contracts.length?onAddContract:onInvite;label=!state.organizations.length?'Přidat organizaci':!state.contracts.length?'Založit smlouvu':'Pozvat správce organizace';}
  else if(federation&&submitted){action=()=>onOpen(submitted.id);label='Zkontrolovat vyúčtování';}
  else if(!federation&&editable){action=()=>onOpen(editable.id);label='Otevřít mé vyúčtování';}
  const waiting=!federation&&!state.contracts.length;
  return <section className="onboarding" aria-labelledby="onboarding-title">
    <div className="onboarding-heading"><span className="onboarding-role">{t(federation?'Federace':state.organizations[0]?.name||'Vaše organizace')}</span><h1 id="onboarding-title">{t(setup?'Nastavte svůj pracovní prostor':federation?'Kontrolujte vyúčtování':'Připravte své vyúčtování')}</h1><p>{t(federation?'Organizace dokládají výdaje. Vy rozhodujete o jejich uznání.':'Nahrajte výdaje ze své dotace a předejte je federaci ke kontrole.')}</p></div>
    <ol className="onboarding-steps">{steps.map((step,index)=><li key={step.title}><span className={'onboarding-number '+('done'in step&&step.done?'complete':'')}>{'done'in step&&step.done?<Check size={18}/>:index+1}</span><div><h2>{t(step.title)}</h2><p>{t(step.detail)}</p></div></li>)}</ol>
    {waiting&&<p className="notice">{t('Federace vám ještě nepřiřadila smlouvu. Požádejte ji o přidání smlouvy; potom zde nahrajete doklady.')}</p>}
    <div className="onboarding-actions"><button className="button primary" disabled={busy} onClick={action}>{t(label)}<ArrowRight size={17}/></button>{action!==onContinue&&<button className="button secondary" disabled={busy} onClick={onContinue}>{t('Otevřít přehled')}</button>}{!setup&&federation&&state.organizations.length>0&&state.contracts.length>0&&!state.members.some(m=>m.role==='org_admin')&&<button className="text-link" onClick={onInvite}>{t('Pozvat správce organizace')}</button>}</div>
  </section>;
}
