"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileText,
  FolderOpen,
  History,
  LayoutDashboard,
  Leaf,
  Loader2,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import Extraction from "@/components/dotace-extract";
import { parsePaymentDate, type ExtractionContext } from "@/lib/extraction";
import { mergeAutofill, duplicateReceipt, type AutofillState } from "@/lib/autofill";
import DocumentPreview from "@/components/dotace-document";
import ReviewExpense from "@/components/dotace-review";
import Dashboard from "@/components/dotace-dashboard";
import { reviewProgress } from "@/lib/review";
import { LanguageProvider, LanguageSwitch, useLanguage } from "@/components/language";
import {
  AppState,
  AuditEvent,
  Category,
  Contract,
  Item,
  Organization,
  StoredFile,
  categoryLabels,
  declaration,
  findings,
  money,
  submissionErrors,
  total,
} from "@/lib/model";

type View = "contracts" | "organizations" | "activity";
type Tab = "items" | "conditions" | "summary" | "history";
type Modal =
  | { type: "organization"; organization?: Organization }
  | { type: "contract"; contract?: Contract; organizationId: string }
  | { type: "item"; item?: Item }
  | { type: "submit" }
  | { type: "approve" }
  | { type: "return" }
  | { type: "invite"; organizationId: string }
  | { type: "feedback" }
  | { type: "adviser" }
  | null;
const statusNames = {
  draft: "Rozpracováno",
  submitted: "Ke kontrole SFJ",
  changes: "K doplnění",
  approved: "Schváleno",
};
const orgNames = {
  unchecked: "Nezkontrolováno",
  checked: "Zkontrolováno",
  commented: "S komentářem",
};
const sfjNames = {
  pending: "K posouzení",
  accepted: "Akceptováno",
  rejected: "Neuznáno",
  supplement: "Doplnění",
};
const programs = ["Organizace", "Talent", "Reprezentace", "Pohár předsedy"];
const actionLabel = (action: string) =>
  (
    ({
      "organization.created": "Organizace založena",
      "organization.updated": "Profil organizace upraven",
      "contract.created": "Smlouva založena",
      "contract.updated": "Smlouva upravena",
      "item.created": "Doklad přidán",
      "item.updated": "Doklad upraven",
      "item.accepted": "Doklad akceptován",
      "item.rejected": "Doklad neuznán",
      "item.supplement": "Vyžádáno doplnění dokladu",
      "item.reply": "Odpověď organizace",
      "settlement.submit": "Vyúčtování odesláno",
      "settlement.return": "Vyúčtování vráceno k opravě",
      "settlement.approve": "Vyúčtování schváleno",
      "file.uploaded": "Příloha uložena",
      "member.invited": "Pozvánka vytvořena",
      "member.joined": "Člen přijal pozvánku",
      "feedback.created": "Návrh na zlepšení uložen",
      "demo.created": "Pilotní data připravena",
    }) as Record<string, string>
  )[action] || action;
const today = () => new Date().toISOString().slice(0, 10);
const date = (d: string) =>
  d
    ? new Date(d.includes("T") ? d : `${d}T12:00:00`).toLocaleDateString(
        "cs-CZ",
      )
    : "—";
const blankItem = (contract: Contract): Item => ({
  id: "",
  contractId: contract.id,
  number: "",
  supplier: "",
  supplierIco: "",
  description: "",
  category: "services",
  amount: 0,
  claimed: 0,
  date: "",
  payment: "bank",
  recipientType: "organization",
  recipientName: "",
  comment: "",
  orgReview: "unchecked",
  sfjDecision: "pending",
  sfjReason: "",
  excluded: false,
  fileIds: [],
  version: 0,
});

async function jsonRequest<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit,
) {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  const data = (await response
    .json()
    .catch(() => ({ error: "Server nevrátil očekávanou odpověď." }))) as {
    error?: string;
    code?: string;
    details?: string[];
  };
  if(data.code==='MFA_REQUIRED')window.location.assign('/account');
  if(response.status===401)window.dispatchEvent(new Event("dotace:session-expired"));
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Požadavek se nepodařilo dokončit."),
      { status: response.status, details: data.details },
    );
  return data as T;
}

export default function DotaceApp() {
  return <LanguageProvider><Workspace /></LanguageProvider>;
}

function Workspace() {
  const { t } = useLanguage();
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [sessionExpired,setSessionExpired]=useState(false);
  useEffect(()=>{const expired=()=>setSessionExpired(true);window.addEventListener('dotace:session-expired',expired);return()=>window.removeEventListener('dotace:session-expired',expired);},[]);
  const [view, setView] = useState<View>("contracts");
  const [contractId, setContractId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [tab, setTab] = useState<Tab>("items");
  const [preview, setPreview] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [inviteToken, setInviteToken] = useState("");
  useEffect(()=>{ window.scrollTo(0,0); },[Boolean(state),view,contractId,organizationId]);
  const load = useCallback(async () => {
    try {
      const data = await jsonRequest<AppState>("/api/app");
      setState(data);
      setError("");
      setUnauthorized(false);
      return data as AppState;
    } catch (e) {
      const x = e as Error & { status?: number };
      setError(x.message);
      setUnauthorized(x.status === 401);
      throw e;
    }
  }, []);
  const readLocation = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const nextView = params.get('view');
    const nextTab = params.get('tab');
    setView(nextView === 'organizations' || nextView === 'activity' ? nextView : 'contracts');
    setContractId(params.get('contract') || '');
    setOrganizationId(params.get('organization') || '');
    setTab(['conditions', 'summary', 'history'].includes(nextTab || '') ? nextTab as Tab : 'items');
    setStatusFilter(['open', 'submitted', 'approved'].includes(params.get('status') || '') ? params.get('status')! : '');
    setInviteToken(params.get('invite') || '');
    setQuery(''); setSelected([]); setItemFilter('all'); setModal(null);
  }, []);
  useEffect(() => {
    void load().catch(() => {});
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, [load, readLocation]);
  const navigate = (values: Record<string, string>) => {
    const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
    const target = window.location.pathname + (params.size ? `?${params}` : '');
    if (target !== window.location.pathname + window.location.search) window.history.pushState(null, '', target);
    readLocation();
  };
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const mutate = async <T = Record<string, unknown>,>(
    action: string,
    payload: unknown,
    message = "Změna je uložená.",
    afterLoad?: (fresh: AppState) => void,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await jsonRequest<T>("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const fresh = await load();
      afterLoad?.(fresh);
      if (message) setToast(message);
      return result;
    } catch (e) {
      const x = e as Error & { details?: string[] };
      setError(
        [x.message, ...(Array.isArray(x.details) ? x.details : [])].join("\n"),
      );
      if ((e as { status?: number }).status === 409)
        await load().catch(() => {});
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const openContract = (id: string) => { setPreview(false); navigate({contract:id,tab:state?.contracts.find(c=>c.id===id)?.status==='approved'?'summary':''}); };
  const openOrganization = (id: string) => navigate({view:'organizations',organization:id});
  const goHome = (newView: View) => navigate({view:newView === 'contracts' ? '' : newView,
    organization:newView === 'organizations' && state?.membership.role !== 'federation' && state?.organizations.length === 1 ? state.organizations[0].id : ''});
  const showTab = (nextTab: Tab) => navigate({contract:contractId,tab:nextTab === 'items' ? '' : nextTab});
  const sessionRecovery=sessionExpired&&<div className="session-recovery" role="alert"><strong>{t('Přihlášení vypršelo. Rozepsaný formulář zůstává otevřený.')}</strong><a className="button primary" href="/login" target="_blank" rel="noopener noreferrer">{t('Přihlásit se v nové kartě')}</a><button className="button secondary" onClick={()=>void load().then(()=>setSessionExpired(false)).catch(()=>{})}>{t('Už jsem přihlášený · pokračovat')}</button></div>;
  useEffect(()=>{if(sessionExpired)document.querySelector<HTMLAnchorElement>('.session-recovery a')?.focus();},[sessionExpired]);
  const closeModal = () => {
    if (!busy) setModal(null);
  };
  const upload = async (
    file: File,
    contract: Contract,
    kind: StoredFile["kind"] = "receipt",
  ) => {
    const data = new FormData();
    data.append("file", file);
    data.append("contractId", contract.id);
    data.append("kind", kind);
    const result = await jsonRequest<{ file: StoredFile }>("/api/files", {
      method: "POST",
      body: data,
    });
    await load();
    return result.file as StoredFile;
  };
  const federation = state?.membership.role === "federation";
  const demo = Boolean(state?.capabilities.demo);
  const orgMode = !federation || preview;
  const contract = state?.contracts.find((c) => c.id === contractId);
  const organization = state?.organizations.find(
    (o) => o.id === (contract?.organizationId || organizationId),
  );
  const contractItems =
    state?.items.filter((i) => i.contractId === contractId) || [];
  const matchesSearch = (text: string) => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs');
    const haystack = normalize(text);
    return normalize(query).trim().split(/\s+/).every(word => haystack.includes(word));
  };
  const filteredItems = contractItems.filter((i) => {
    if (!matchesSearch(`${i.number} ${i.supplier} ${i.description}`)) return false;
    if (itemFilter === "missing") return !i.fileIds.length;
    if (itemFilter === "comments") return !!i.comment;
    if (itemFilter === "warnings")
      return contract && findings(i, contract).length > 0;
    if (itemFilter === "unchecked")
      return !i.excluded && (contract?.status === 'submitted' && federation && !preview ? i.sfjDecision === 'pending' : i.orgReview === 'unchecked');
    if (itemFilter === "supplement") return i.sfjDecision === "supplement";
    if (itemFilter === "sample") return selected.includes(i.id);
    return true;
  });
  const filteredContracts =
    state?.contracts.filter(
      (c) =>
        (!statusFilter || (statusFilter === "open" ? ["draft", "changes"].includes(c.status) : c.status === statusFilter)) &&
        matchesSearch(`${c.number} ${c.year} ${c.program} ${t(c.program)} ${state.organizations.find((o) => o.id === c.organizationId)?.name}`),
    ) || [];
  const editable =
    contract && (contract.status === "draft" || contract.status === "changes");
  const reviewing = federation && !preview && contract?.status === "submitted";
  const showFederationDecision = contract?.status !== "draft" || contractItems.some(item => item.sfjDecision !== "pending");
  const canSubmit =
    (federation || state?.membership.role === "org_admin") && editable;
  const exportCsv = () => {
    if (!contract) return;
    const escape = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[\s]*[=+@-]/.test(s)) s = `'${s}`;
      return `"${s.replaceAll('"', '""')}"`;
    };
    const rows: unknown[][] = [
      [
        "Smlouva",
        "Číslo dokladu",
        "Dodavatel",
        "IČO",
        "Popis výdaje",
        "Skupina",
        "Částka dokladu Kč",
        "Uplatněno Kč",
        "Datum úhrady",
        "Úhrada",
        "Kontrola organizace",
        "Kontrola SFJ",
        "Komentář",
        "Důvod SFJ",
        "Vyřazeno",
        "Přílohy",
      ],
    ];
    for (const item of contractItems)
      rows.push([
        contract.number,
        item.number,
        item.supplier,
        item.supplierIco,
        item.description,
        categoryLabels[item.category],
        item.amount.toFixed(2).replace(".", ","),
        item.claimed.toFixed(2).replace(".", ","),
        item.date,
        item.payment === "bank" ? "Bezhotovostní platba" : "Hotovost",
        orgNames[item.orgReview],
        sfjNames[item.sfjDecision],
        item.comment,
        item.sfjReason,
        item.excluded ? "Ano" : "Ne",
        item.fileIds
          .map((id) => state?.files.find((f) => f.id === id)?.name || id)
          .join(", "),
      ]);
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((row) => row.map(escape).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${contract.number.replace(/[^a-zA-Z0-9-]/g, "-")}-vyuctovani.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const randomSample = () => {
    const ids = contractItems
      .filter((i) => !i.excluded && i.sfjDecision !== "supplement")
      .map((i) => i.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setSelected(ids.slice(0, Math.max(1, Math.ceil(ids.length * 0.2))));
    setItemFilter("sample");
    setToast("Vybraný náhodný vzorek je označený. Rozhodnutí zůstává na vás.");
  };

  if (!state)
    return (
      <div className="welcome">
        <div className="welcome-brand">
          <Leaf size={34} />
          <span>{t("Dotace")}<span className="muted">{t(" / Javor")}</span>
          </span>
        </div>
        {error ? (
          <>
            <h1>
              {t(inviteToken
                ? "Pozvánka do organizace"
                : unauthorized
                  ? "Přihlaste se do svého prostoru"
                  : "Aplikaci se nepodařilo načíst")}
            </h1>
            <p>
              {t(inviteToken
                ? "Přijměte osobní pozvánku pod přihlášeným účtem se stejným e-mailem, pro který byla vytvořena."
                : error)}
            </p>
            {inviteToken && !unauthorized && (
              <>
                <div className="notice error" role="alert">
                  {t(error)}
                </div>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      "acceptInvite",
                      { token: inviteToken },
                      "Pozvánka přijata.",
                    )
                      .then(() => {
                        setInviteToken("");
                        window.history.replaceState(null, "", "/");
                      })
                      .catch(() => {})
                  }
                >
                  <Users size={16} />{t("Přijmout pozvánku")}</button>
              </>
            )}
            {unauthorized ? (
              <a
                className="button primary"
                href={`/signin-with-chatgpt?return_to=${encodeURIComponent(inviteToken ? "/?invite=" + inviteToken : "/")}`}
                target="_top"
              >{t("Přihlásit přes ChatGPT ")}<ArrowRight size={16} />
              </a>
            ) : (
              !inviteToken && (
                <button
                  className="button primary"
                  onClick={() => void load().catch(() => {})}
                >{t("Zkusit znovu")}</button>
              )
            )}
          </>
        ) : (
          <>
            <Loader2 className="spin" size={28} />
            <h1>{t("Připravujeme váš přehled")}</h1>
            <p>{t("Načítání smluv a uložených dokladů…")}</p>
          </>
        )}
      </div>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar no-print">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            goHome("contracts");
          }}
        >
          <span className="brand-icon" translate="no">{t("J")}</span>
          <span><strong translate="no">{t("JAVOR")}</strong><span className="brand-sub">{t("Evidence dotací")}</span></span>
        </a>

        <nav aria-label={t("Hlavní navigace")}>
          <button
            className={`nav-item ${view === "contracts" ? "active" : ""}`}
            onClick={() => goHome("contracts")}
          >
            <LayoutDashboard size={18} />
            <span>{t("Vyúčtování")}</span>
          </button>
          <button
            className={`nav-item ${view === "organizations" ? "active" : ""}`}
            onClick={() => goHome("organizations")}
          >
            <Building2 size={18} />
            <span>{t(!federation && state.organizations.length === 1 ? "Moje organizace" : "Organizace")}</span>
          </button>
          <button
            className={`nav-item ${view === "activity" ? "active" : ""}`}
            onClick={() => goHome("activity")}
          >
            <History size={18} />
            <span>{t("Historie")}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-help" onClick={()=>setModal({type:"adviser"})}><BookOpen size={17}/><span>{t("Pravidla a nápověda")}</span></button>
          <button
            className="feedback-link"
            onClick={() => setModal({ type: "feedback" })}
          >
            <MessageSquare size={16} />
            <span>{t("Zpětná vazba")}</span>
          </button>
          <div className="profile">
            <span className="avatar">
              {t(state.user.displayName.slice(0, 2).toUpperCase())}
            </span>
            <span>
              <strong>{t(state.user.displayName)}</strong>
              <small>
                {t(federation
                  ? "Administrátor SFJ"
                  : state.membership.role === "org_admin"
                    ? "Správce organizace"
                    : "Člen organizace")}
              </small>
            </span>
            <a
              aria-label={t(demo ? "Změnit účet" : "Odhlásit")}
              title={t(demo ? "Změnit účet" : "Odhlásit")}
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
            >
              <LogOut size={16} /><span className="account-link-label">{t(demo ? "Změnit účet" : "Odhlásit")}</span>
            </a>
          </div>
        </div>
      </aside>
      {!modal&&sessionRecovery}
      <div className="app-main">
        <header className="topbar no-print">
          <span className="workspace-role">{t(federation ? "Federace" : "Účet organizace")}</span>
          <div className="top-actions">
            <LanguageSwitch />
            {demo&&<span className="pilot">{t("Demo · fiktivní data")}</span>}
            {!demo&&<a href="/account" className="button secondary">{t('Můj účet')}</a>}
            {!demo&&state.membership.role!=='member'&&<a href="/access" className="button secondary">{t('Správa přístupů')}</a>}
          </div>
        </header>
        <main className="main-content" key={contractId ? `contract-${contractId}` : `${view}-${organizationId}`}>
          {error && (
            <div className="notice error no-print" role="alert">
              <TriangleAlert size={18} />
              <div style={{ whiteSpace: "pre-line" }}>{t(error)}</div>
              <button
                className="icon-button"
                aria-label={t("Zavřít upozornění")}
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {inviteToken && !demo && (
            <div className="notice warning no-print">
              <Users size={19} />
              <div>
                <strong>{t("Pozvánka do organizace")}</strong>
                <p>{t("Po přijetí získáte oprávnění uvedená v pozvánce pro přihlášený e-mail ")}{t(state.user.email)}{t(".")}</p>
              </div>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void mutate(
                    "acceptInvite",
                    { token: inviteToken },
                    "Pozvánka přijata.",
                  )
                    .then(() => {
                      setInviteToken("");
                      window.history.replaceState(null, "", "/");
                    })
                    .catch(() => {})
                }
              >{t("Přijmout pozvánku")}</button>
              <button
                className="icon-button"
                aria-label={t("Skrýt pozvánku")}
                onClick={() => setInviteToken("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {preview && (
            <div className="preview-notice no-print">
              <Eye size={14} />{t("Náhled organizace pro administrátora SFJ. Přístupová práva ověřuje server.")}</div>
          )}
          {contract && organization ? (
            <>
              <button
                className="back-link no-print"
                onClick={() => goHome("contracts")}
              >
                <ArrowLeft size={15} />{t("Všechna vyúčtování")}</button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {t(organization.name)} <span>{t(" /")}{contract.year}</span>
                  </div>
                  <h1>
                    {t(contract.number)}
                    <span className={`badge ${contract.status}`}>
                      {t(statusNames[contract.status])}
                    </span>
                  </h1>
                </div>
                <div className="heading-actions no-print">
                  {federation && !preview && editable && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        setModal({
                          type: "contract",
                          contract,
                          organizationId: organization.id,
                        })
                      }
                    >
                      <SlidersHorizontal size={16} />{t("Upravit smlouvu")}</button>
                  )}
                  {reviewing && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: "return" })}
                      >
                        <RotateCcw size={16} />{t("Vrátit k opravě")}</button>
                    </>
                  )}
                </div>
              </div>
              {contract.status === 'submitted' && federation && preview && <div className="notice review-mode-notice"><div><strong>{t('Nyní vidíte pohled organizace.')}</strong><p>{t('Pro kontrolu a schválení přepněte na kontrolora.')}</p></div><button className="button primary" onClick={() => setPreview(false)}>{t('Přejít ke kontrole')}</button></div>}
              {tab === "items" && <NextStep
                contract={contract}
                items={contractItems}
                canReview={Boolean(reviewing)}
                canSubmit={Boolean(canSubmit)}
                onOpen={(item) => setModal({ type: "item", item })}
                onSubmit={() => setModal({ type: "submit" })}
                onApprove={() => setModal({ type: "approve" })}
              />}
              <div className="contract-metrics">
                <Metric
                  label="Přidělená dotace"
                  value={money(contract.amount)}
                  icon={<FileText size={18} />}
                />
                <Metric
                  label="Uplatněné náklady"
                  value={money(total(contractItems))}
                  icon={<FolderOpen size={18} />}
                />
                <Metric
                  label="Termín vyúčtování"
                  value={date(contract.deadline)}
                  icon={<Clock3 size={18} />}
                />
              </div>
              <div
                className="tabs no-print"
                role="tablist"
                aria-label={t("Detail smlouvy")}
              >
                {(
                  [
                    ["items", "Doklady", FileText],
                    ["conditions", "Smlouva a podmínky", ShieldCheck],
                    ["summary", "Souhrn", LayoutDashboard],
                    ["history", "Historie", History],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    role="tab"
                    aria-selected={tab === key}
                    className={tab === key ? "selected" : ""}
                    key={key}
                    onClick={() => {
                      showTab(key);
                    }}
                  >
                    <Icon size={16} />
                    {t(label)}
                    {key === "items" && <span>{contractItems.length}</span>}
                  </button>
                ))}
              </div>
              {tab === "items" && (
                <section className="panel ledger no-print">
                  <div className="panel-header">
                    <div>
                      <h2>{t(reviewing ? 'Výdaje ke kontrole' : "Doklady")}</h2>

                    </div>
                    <div className="row-actions">
                      {editable && (
                        <button
                          className="button primary"
                          onClick={() => setModal({ type: "item" })}
                        >
                          <Plus size={17} />{t("Přidat doklad")}</button>
                      )}
                    </div>
                  </div>
                  {contract.status === "changes" && (
                    <div className="inline-banner warning">
                      <TriangleAlert size={17} />{t("SFJ vrátila vyúčtování k doplnění. Podrobnosti najdete v historii.")}</div>
                  )}
                  {contract.status === "submitted" && orgMode && (
                    <div className="inline-banner">
                      <ShieldCheck size={17} />{t("Vyúčtování je odeslané. U vyžádaných doplnění můžete přidat odpověď a přílohy.")}</div>
                  )}
                  <div className="table-toolbar">
                    <div className="search-field">
                      <Search size={16} />
                      <input
                        aria-label={t("Hledat doklad")}
                        placeholder={t("Číslo, dodavatel nebo popis dokladu")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label={t("Filtr dokladů")}
                      value={itemFilter}
                      onChange={(e) => setItemFilter(e.target.value)}
                    >
                      <option value="all">{t("Všechny doklady")}</option>
                      <option value="unchecked">{t(reviewing ? 'Bez rozhodnutí' : "Nezkontrolované")}</option>
                      <option value="warnings">{t("S upozorněním")}</option>
                      <option value="comments">{t("S komentářem")}</option>
                      <option value="missing">{t("Bez přílohy")}</option>
                      <option value="supplement">{t("Vyžádané doplnění")}</option>
                      {itemFilter === "sample" && <option value="sample">{t("Náhodný vzorek")}</option>}
                    </select>
                    {reviewing && <details className="review-tools"><summary>{t("Nástroje kontroly")}</summary><button className="button secondary" onClick={randomSample}>{t("Namátková kontrola")}</button></details>}
                  </div>
                  {reviewing && selected.length > 0 && (
                    <div className="selection-bar">
                      <span>{selected.length}{t(" označených dokladů")}</span>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            "bulkAccept",
                            { contractId: contract.id, ids: selected },
                            "Vybrané doklady jsou akceptované.",
                          )
                            .then(() => setSelected([]))
                            .catch(() => {})
                        }
                      >
                        <CheckCheck size={16} />{t("Hromadně akceptovat")}</button>
                      <button
                        className="text-link"
                        onClick={() => setSelected([])}
                      >{t("Zrušit výběr")}</button>
                    </div>
                  )}
                  <div className="table-scroll">
                    <table className="item-table">
                      <thead>
                        <tr>
                          {reviewing && (
                            <th className="check-column">
                              <input
                                type="checkbox"
                                aria-label={t("Vybrat všechny viditelné doklady")}
                                checked={
                                  filteredItems.some(
                                    (i) =>
                                      !i.excluded &&
                                      i.sfjDecision !== "supplement",
                                  ) &&
                                  filteredItems
                                    .filter(
                                      (i) =>
                                        !i.excluded &&
                                        i.sfjDecision !== "supplement",
                                    )
                                    .every((i) => selected.includes(i.id))
                                }
                                onChange={(e) =>
                                  setSelected(
                                    e.target.checked
                                      ? filteredItems
                                          .filter(
                                            (i) =>
                                              !i.excluded &&
                                              i.sfjDecision !== "supplement",
                                          )
                                          .map((i) => i.id)
                                      : [],
                                  )
                                }
                              />
                            </th>
                          )}
                          <th>{t("Doklad / dodavatel")}</th>
                          <th>{t("Skupina nákladů")}</th>
                          <th className="numeric">{t("Uplatněno")}</th>
                          <th>{t("Příloha")}</th>
                          <th>{t("Kontrola organizace")}</th>
                          {showFederationDecision && <th>{t("Kontrola SFJ")}</th>}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.map((item) => (
                          <tr
                            key={item.id}
                            className={item.excluded ? "excluded" : ""}
                          >
                            {reviewing && (
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={t(`Vybrat ${item.number}`)}
                                  checked={selected.includes(item.id)}
                                  disabled={
                                    item.excluded ||
                                    item.sfjDecision === "supplement"
                                  }
                                  onChange={(e) =>
                                    setSelected(
                                      e.target.checked
                                        ? [...selected, item.id]
                                        : selected.filter(
                                            (id) => id !== item.id,
                                          ),
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td>
                              <button
                                className="document-link"
                                onClick={() => setModal({ type: "item", item })}
                              >
                                {t(item.number || "Nový doklad")}
                                {contract &&
                                  findings(item, contract).length > 0 && (
                                    <TriangleAlert
                                      size={13}
                                      className="amber"
                                    />
                                  )}
                              </button>
                              <strong className="supplier-name">
                                {t(item.supplier)}
                              </strong>
                              <p className="full-description">
                                {t(item.description)}
                              </p>
                              {item.excluded && (
                                <span className="small-muted">{t("Vyřazeno z vyúčtování")}</span>
                              )}
                            </td>
                            <td>
                              <span className="category-label">
                                {t(categoryLabels[item.category])}
                              </span>
                              <small className="small-muted">
                                {t(date(item.date))}{t(" ·")}{t(" ")}
                                {t(item.payment === "bank" ? "Bezhotovostní platba" : "Hotovost")}
                              </small>
                            </td>
                            <td className="numeric">
                              <strong>{t(money(item.claimed))}</strong>
                              {item.claimed !== item.amount && (
                                <small className="small-muted">{t("z ")}{t(money(item.amount))}
                                </small>
                              )}
                            </td>
                            <td>
                              {item.fileIds.length ? (
                                <button
                                  className="attachment-link"
                                  onClick={() =>
                                    setModal({ type: "item", item })
                                  }
                                >
                                  <Paperclip size={14} />
                                  {item.fileIds.length}
                                </button>
                              ) : (
                                <span className="missing-file">{t("Chybí")}</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-dot org-${item.orgReview}`}
                              />
                              <span className="status-text">
                                {t(orgNames[item.orgReview])}
                              </span>
                            </td>
                            {showFederationDecision && <td>
                              <span className={`badge sfj-${item.sfjDecision}`}>
                                {t(sfjNames[item.sfjDecision])}
                              </span>
                            </td>}
                            <td>
                              <button
                                className={reviewing && !item.excluded ? 'button secondary review-row-action' : 'icon-button'}
                                aria-label={t(`${reviewing && !item.excluded ? 'Posoudit výdaj' : 'Otevřít doklad'} ${item.number}`)}
                                onClick={() => setModal({ type: "item", item })}
                              >
                                {reviewing && !item.excluded && t(['accepted','rejected'].includes(item.sfjDecision) ? 'Upravit rozhodnutí' : 'Posoudit výdaj')}<ChevronRight size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredItems.length && (
                      <Empty
                        icon={<FileText size={28} />}
                        title={
                          t(contractItems.length
                            ? "Žádný doklad neodpovídá filtru"
                            : "Začněte prvním dokladem")
                        }
                        text={
                          contractItems.length
                            ? "Změňte hledání nebo nastavený filtr."
                            : "Nahrajte PDF nebo fotografii účtenky a doplňte údaje."
                        }
                      />
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {filteredItems.length}{t(" z ")}{contractItems.length}{t(" dokladů")}</span>
                    <strong>{t("Celkem uplatněno ")}{t(money(total(contractItems)))}
                    </strong>
                  </div>
                </section>
              )}
              {tab === "conditions" && (
                <Conditions
                  contract={contract}
                  state={state}
                  canUpload={!!federation && !preview && !!editable}
                  upload={upload}
                  setToast={setToast}
                  setError={setError}
                />
              )}
              {tab === "summary" && (
                <Summary
                  contract={contract}
                  organization={organization}
                  items={contractItems}
                  state={state}
                  exportCsv={exportCsv}
                />
              )}
              {tab === "history" && (
                <Audit
                  events={state.audit.filter(
                    (a) => a.contractId === contract.id,
                  )}
                />
              )}
              <div
                className={`print-only ${tab === "summary" ? "print-duplicated" : ""}`}
              >
                <Summary
                  contract={contract}
                  organization={organization}
                  items={contractItems}
                  state={state}
                  exportCsv={exportCsv}
                />
              </div>
            </>
          ) : view === "contracts" ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>{t("Vyúčtování")}</h1>
                </div>
                <div className="heading-actions">
                  {federation && <button className="button primary" onClick={()=>setModal(state.organizations.length ? {type:"contract",organizationId:state.organizations.length===1?state.organizations[0].id:""} : {type:"organization"})}><Plus size={16}/><span>{t(state.organizations.length ? "Nová smlouva" : "Přidat organizaci")}</span></button>}
                </div>
              </div>
              <Dashboard state={state}/>
              <section className="panel contracts-panel" id="contract-register">
                <div className="contract-status-filters" aria-label={t("Stav vyúčtování")}>
                  {[["","Všechny"],["open","Rozpracované"],["submitted",federation ? "Ke kontrole" : "Odeslané"],["approved","Schválené"]].map(([value,label])=><button key={value} type="button" aria-pressed={statusFilter===value} onClick={()=>navigate({status:value})}><span>{t(label)}</span><span translate="no">{state.contracts.filter(c=>!value || (value==='open'?['draft','changes'].includes(c.status):c.status===value)).length}</span></button>)}
                </div>
                <div className="table-toolbar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label={t("Hledat smlouvu")}
                      placeholder={t("Hledat organizaci nebo smlouvu…")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="contract-table">
                    <thead>
                      <tr>
                        <th>{t("Organizace a smlouva")}</th>
                        <th>{t("Program")}</th>
                        <th className="numeric">{t("Přidělená dotace")}</th>
                        <th>{t("Stav")}</th>
                        <th>{t("Termín")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContracts.map((c) => {
                        const org = state.organizations.find(
                          (o) => o.id === c.organizationId,
                        );
                        return (
                          <tr key={c.id}>
                            <td>
                              <button
                                className="organization-link"
                                onClick={() => openContract(c.id)}
                              >
                                <span className="organization-avatar">
                                  {t(org?.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((x) => x[0])
                                    .join(""))}
                                </span>
                                <span>
                                  <strong>{t(org?.name)}</strong>
                                  <small>
                                    {t(c.number)} <span>{t("·")}{c.year}</span>
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="program-tag">{t(c.program)}</span>
                            </td>
                            <td className="numeric">
                              <strong>{t(money(c.amount))}</strong>
                            </td>
                            <td>
                              <span className={`badge ${c.status}`}>
                                {c.status === "approved" ? (
                                  <Check size={12} />
                                ) : c.status === "submitted" ? (
                                  <Clock3 size={12} />
                                ) : null}
                                {t(statusNames[c.status])}
                              </span>
                            </td>
                            <td className="nowrap"><span className="mobile-deadline-label">{t("Termín:")}</span>{t(date(c.deadline))}</td>
                            <td>
                              <button
                                className="text-link contract-action"
                                aria-label={`${t(c.status === 'submitted' && federation ? 'Zkontrolovat výdaje' : 'Otevřít smlouvu')} ${c.number}`}
                                onClick={() => openContract(c.id)}
                              >
                                {t(c.status === 'approved' ? 'Výsledek' : c.status === 'submitted' && federation ? 'Zkontrolovat' : 'Otevřít')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!filteredContracts.length && (
                    <Empty
                      icon={<FileText size={28} />}
                      title={t("Žádné smlouvy")}
                      text={
                        state.contracts.length
                          ? "Upravte hledání nebo filtry."
                          : federation ? "Přidejte první smlouvu." : "Smlouvu vám přidá federace."
                      }
                    />
                  )}
                </div>
                <div className="table-footer">
                  <span key={`${filteredContracts.length}:${state.contracts.length}`}>{t(`${filteredContracts.length} z ${state.contracts.length} smluv`)}</span>
                  {(query||statusFilter) && <button className="text-link" onClick={()=>goHome('contracts')}>{t("Zrušit filtry")}</button>}
                </div>
              </section>
            </>
          ) : view === "organizations" ? (
            organization ? (
              <>
                {(federation || state.organizations.length > 1) && <button
                  className="back-link"
                  onClick={() => navigate({view:"organizations"})}
                >
                  <ArrowLeft size={15} />{t("Všechny organizace")}</button>}
                <div className="page-heading">
                  <div>
                    <h1>{t(organization.name)}</h1>
                    <p>{t("IČO ")}{t(organization.ico)}{t(" · ")}{organization.address}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {federation && !preview && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({ type: "organization", organization })
                        }
                      >{t("Upravit profil")}</button>
                    )}
                    {!demo && (federation || state.membership.role === "org_admin") && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({
                            type: "invite",
                            organizationId: organization.id,
                          })
                        }
                      >
                        <Users size={16} />{t("Pozvat člena")}</button>
                    )}
                    {federation && !preview && (
                      <button
                        className="button primary"
                        onClick={() =>
                          setModal({
                            type: "contract",
                            organizationId: organization.id,
                          })
                        }
                      >
                        <Plus size={17} />{t("Založit smlouvu")}</button>
                    )}
                  </div>
                </div>
                <div className="organization-detail-grid">
                  <section className="panel padded">
                    <h2>{t("Kontaktní údaje")}</h2>
                    <dl className="detail-list">
                      <dt>{t("E-mail")}</dt>
                      <dd>{t(organization.email || "—")}</dd>
                      <dt>{t("Telefon")}</dt>
                      <dd>{t(organization.phone || "—")}</dd>
                      <dt>{t("Bankovní účet")}</dt>
                      <dd>{t(organization.bank || "—")}</dd>
                      <dt>{t("Statutární zástupci")}</dt>
                      <dd>{t(organization.representatives.join(", ") || "—")}</dd>
                    </dl>
                  </section>
                  <section className="panel padded">
                    <h2>{t("Lidé a oprávnění")}</h2>
                    {state.members
                      .filter((m) => m.organizationId === organization.id)
                      .map((m) => (
                        <div className="member-row" key={m.id}>
                          <span className="avatar light">
                            {t(m.name.slice(0, 2).toUpperCase())}
                          </span>
                          <span>
                            <strong>{t(m.name)}</strong>
                            <small>{t(m.email)}</small>
                          </span>
                          <span className="badge neutral">
                            {t(m.role === "org_admin" ? "Správce" : "Člen")}
                          </span>
                        </div>
                      ))}
                    {!state.members.some(
                      (m) => m.organizationId === organization.id,
                    ) && (
                      <p className="muted">{t(demo ? "Zkušební účet organizace je přiřazen klubu FK Háj. Ostatní organizace slouží jako příklady pro federaci." : "Zatím žádný člen. Pozvěte správce organizace.")}</p>
                    )}
                  </section>
                </div>
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{t("Smlouvy organizace")}</h2>
                    </div>
                  </div>
                  {state.contracts
                    .filter((c) => c.organizationId === organization.id)
                    .map((c) => (
                      <button
                        className="organization-contract"
                        key={c.id}
                        onClick={() => openContract(c.id)}
                      >
                        <FileText size={21} />
                        <span>
                          <strong>{t(c.number)}</strong>
                          <small>
                            {t(c.program)}{t(" ·")}{c.year}
                          </small>
                        </span>
                        <strong>{t(money(c.amount))}</strong>
                        <span className={`badge ${c.status}`}>
                          {t(statusNames[c.status])}
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  {!state.contracts.some(
                    (c) => c.organizationId === organization.id,
                  ) && (
                    <Empty
                      title={t("Zatím bez smlouvy")}
                      text="Přidejte podepsanou smlouvu a její podmínky."
                      icon={<FileText size={26} />}
                    />
                  )}
                </section>
              </>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <h1>{t("Organizace a lidé")}</h1>
                  </div>
                  {federation && !preview && (
                    <div className="heading-actions">
                      {!demo && <button
                        className="button secondary"
                        onClick={() =>
                          setModal({ type: "invite", organizationId: "" })
                        }
                      >
                        <Users size={16} />{t("Pozvat správce SFJ")}</button>}
                      <button
                        className="button primary"
                        onClick={() => setModal({ type: "organization" })}
                      >
                        <Plus size={17} />{t("Přidat organizaci")}</button>
                    </div>
                  )}
                </div>
                <div className="organization-grid">
                  {state.organizations.map((o) => (
                    <button
                      key={o.id}
                      className="organization-card panel"
                      onClick={() => openOrganization(o.id)}
                    >
                      <div className="organization-card-top">
                        <span className="organization-avatar large">
                          <Building2 size={25} />
                        </span>
                        <ArrowUpRight size={18} />
                      </div>
                      <h2>{t(o.name)}</h2>
                      <p>{t("IČO ")}{o.ico}</p>
                      <p>{t(o.address)}</p>
                      <div className="organization-card-bottom">
                        <span>
                          {
                            state.contracts.filter(
                              (c) => c.organizationId === o.id,
                            ).length
                          }{t(" ")}{t("smluv")}</span>
                        <span>{t("Zobrazit profil ")}<ArrowRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>{t("Historie činností")}</h1>
                </div>
              </div>
              <Audit events={state.audit} />
            </>
          )}

        </main>
      </div>
      {toast && (
        <div className="toast no-print" role="status">
          <CircleCheck size={18} />
          <span key={toast}>{t(toast)}</span>
          <button
            className="icon-button"
            aria-label={t("Zavřít oznámení")}
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="saving no-print" role="status">
          <Loader2 className="spin" size={15} />{t("Ukládání…")}</div>
      )}
      {modal && (
        <ModalShell
          sessionRecovery={sessionRecovery}
          title={
            t(modal.type === "organization"
              ? modal.organization
                ? "Upravit organizaci"
                : "Nová organizace"
              : modal.type === "contract"
                ? modal.contract
                  ? "Upravit smlouvu"
                  : "Nová smlouva"
                : modal.type === "item"
                  ? modal.item?.number || "Nový doklad"
                  : modal.type === "submit"
                    ? "Odeslat vyúčtování"
                    : modal.type === "approve"
                      ? "Schválit vyúčtování"
                      : modal.type === "return"
                        ? "Vrátit vyúčtování"
                        : modal.type === "invite"
                          ? modal.organizationId
                            ? "Pozvat člena organizace"
                            : "Pozvat správce SFJ"
                          : modal.type === "adviser"
                            ? "Pravidla a nápověda"
                            : "Návrh na zlepšení")
          }
          wide={modal.type === "item" || modal.type === "adviser"}
          editor={modal.type === "item"}
          onClose={closeModal}
        >
          {modal.type === "organization" && (
            <OrganizationForm
              organization={modal.organization}
              busy={busy}
              onSave={(o) =>
                mutate<{id: string}>("saveOrganization", { organization: o }).then(({id}) => {
                  setModal(null); openOrganization(id);
                })
              }
            />
          )}
          {modal.type === "contract" && (
            <ContractForm
              organizationId={modal.organizationId}
              organizations={state.organizations}
              contract={modal.contract}
              busy={busy}
              onSave={(c) =>
                mutate<{id: string}>("saveContract", { contract: c }).then(({id}) => {
                  setModal(null); openContract(id);
                })
              }
            />
          )}
          {modal.type === 'item' && contract && reviewing && modal.item && !modal.item.excluded && <ReviewExpense
            key={modal.item.id} item={modal.item} contract={contract} items={contractItems} files={state.files} busy={busy}
            onDecision={async (decision, reason) => {
              await mutate('reviewItem', {id:modal.item!.id, version:modal.item!.version, decision, reason}, 'Rozhodnutí je uložené.', fresh => {
                const progress = reviewProgress(fresh.items.filter(item => item.contractId === contract.id));
                if (progress.pending.length) setModal({type:'item', item:progress.pending[0]});
                else if (progress.ready) setModal({type:'approve'});
                else setModal(null);
              });
            }}
          />}
          {modal.type === "item" && contract && !(reviewing && modal.item && !modal.item.excluded) && (
            <ItemForm
              key={modal.item?.id || "new"}
              item={modal.item || blankItem(contract)}
              contract={contract}
              state={state}
              editable={!!editable}
              reviewing={!!reviewing}
              busy={busy}
              upload={(file) => upload(file, contract)}
              onSave={(i) =>
                mutate("saveItem", { item: i }).then(() => setModal(null))
              }
              onOpenExisting={(existing) => setModal({type:"item",item:existing})}
              onDecision={(decision, reason) =>
                mutate("reviewItem", {
                  id: modal.item?.id,
                  version: modal.item?.version,
                  decision,
                  reason,
                }).then(() => setModal(null))
              }
              onReply={(text, fileIds) =>
                mutate("reply", { itemId: modal.item?.id, text, fileIds }).then(
                  () => setModal(null),
                )
              }
            />
          )}
          {modal.type === "submit" && contract && (
            <SubmitForm
              contract={contract}
              items={contractItems}
              busy={busy}
              onSubmit={() =>
                mutate(
                  "submit",
                  {
                    contractId: contract.id,
                    version: contract.version,
                    declaration: true,
                  },
                  "Vyúčtování bylo odeslané SFJ.",
                ).then(() => { setModal(null); showTab('items'); if (demo) setPreview(false); })
              }
            />
          )}
          {modal.type === "approve" && contract && (
            <ApprovalForm
              contract={contract}
              items={contractItems}
              busy={busy}
              onSubmit={(conclusion, reduction) =>
                mutate(
                  "approve",
                  {
                    contractId: contract.id,
                    version: contract.version,
                    conclusion,
                    reduction,
                  },
                  "Kontrola byla uzavřena.",
                ).then(() => { setModal(null); showTab('summary'); })
              }
            />
          )}
          {modal.type === "return" && contract && (
            <TextForm
              label="Co má organizace opravit nebo doplnit?"
              button="Vrátit k opravě"
              busy={busy}
              onSubmit={(reason) =>
                mutate(
                  "return",
                  {
                    contractId: contract.id,
                    version: contract.version,
                    reason,
                  },
                  "Vyúčtování vráceno organizaci.",
                ).then(() => setModal(null))
              }
            />
          )}
          {modal.type === "invite" && (
            <InviteForm
              emailEnabled={Boolean(state.capabilities.email)}
              organizationId={modal.organizationId}
              federation={!!federation}
              busy={busy}
              onInvite={(email, role) =>
                mutate<{ inviteUrl?: string }>(
                  "invite",
                  { organizationId: modal.organizationId, email, role },
                  "Pozvánka byla vytvořená. Odkaz pošlete členovi.",
                )
              }
            />
          )}
          {modal.type === "feedback" && (
            <TextForm
              label="Co by vám pomohlo při práci s dotacemi?"
              button="Uložit návrh"
              busy={busy}
              onSubmit={(text) =>
                mutate(
                  "feedback",
                  {
                    text,
                    organizationId:
                      organization?.id || state.membership.organizationId || "",
                  },
                  "Děkujeme, návrh je uložený.",
                ).then(() => setModal(null))
              }
            />
          )}
          {modal.type === "adviser" && (
            <Adviser contract={contract} contracts={state.contracts} />
          )}
        </ModalShell>
      )}
    </div>
  );
}

function NextStep({ contract, items, canReview, canSubmit, onOpen, onSubmit, onApprove }: {
  contract: Contract; items: Item[]; canReview: boolean; canSubmit: boolean;
  onOpen: (item: Item) => void; onSubmit: () => void; onApprove: () => void;
}) {
  const {t}=useLanguage();
  const progress=reviewProgress(items);
  if(canReview) return <section className="workflow-action no-print" aria-label={t('Další krok')}>
    <span><strong>{progress.decided.length} / {progress.active.length}</strong> {t('výdajů posouzeno')}</span>
    {progress.ready ? <button className="button primary" onClick={onApprove}>{t('Schválit vyúčtování')}<ArrowRight size={16}/></button>
      : progress.next && <button className="button primary" onClick={()=>onOpen(progress.next!)}>{t(progress.pending.length ? 'Posoudit další výdaj' : 'Zobrazit žádost o doplnění')}<ArrowRight size={16}/></button>}
  </section>;
  const active=items.filter(item=>!item.excluded);
  const reply=active.find(item=>item.sfjDecision==='supplement');
  if(contract.status==='submitted') return reply ? <section className="workflow-action no-print"><span>{t('Federace žádá doplnění')}</span><button className="button primary" onClick={()=>onOpen(reply)}>{t('Doplnit vyúčtování')}<ArrowRight size={16}/></button></section> : null;
  if(contract.status==='approved'||!active.length)return null;
  const unfinished=active.filter(item=>submissionErrors(contract,[item]).length>0);
  if(unfinished.length) return <section className="workflow-action no-print"><span>{t('Doklady ke kontrole')}: <strong>{unfinished.length}</strong></span><button className="button secondary" onClick={()=>onOpen(unfinished[0])}>{t('Zkontrolovat')}<ArrowRight size={16}/></button></section>;
  const errors=submissionErrors(contract,items);
  return <section className="workflow-action no-print"><span>{errors.length ? t(errors[0]) : t('Připraveno k odeslání')}</span>{canSubmit && <button className="button primary" disabled={!!errors.length} onClick={onSubmit}>{t('Odeslat federaci')}<ArrowRight size={16}/></button>}</section>;
}

function Metric({
  label,
  value,
  hint,
  icon, onClick, active,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const { t } = useLanguage();
  const contents = <>
      <div className="metric-top">
        <span>{t(label)}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong key={value}>{t(value)}</strong>
      {hint && <small>{t(hint)}</small>}
    </>;
  return onClick ? <button type="button" className={`metric metric-action ${active?'active':''}`} aria-pressed={active} onClick={onClick}>{contents}</button> : <div className="metric">{contents}</div>;
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {action}
    </div>
  );
}
function ModalShell({
  title,
  children,
  onClose,
  wide, editor, sessionRecovery,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  editor?: boolean;
  sessionRecovery?: React.ReactNode;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  const [confirmClose,setConfirmClose]=useState(false);
  const dirty=useRef(false);
  const requestClose=()=>dirty.current?setConfirmClose(true):onClose();
  const closeRef = useRef(requestClose); closeRef.current = requestClose;
  useEffect(()=>{const protect=(event:BeforeUnloadEvent)=>{if(dirty.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("button, input, select, textarea")
      ?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      before?.focus();
    };
  }, []);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("#modal-title")?.focus();
  }, [title]);
  return (
    <div
      className="modal-backdrop no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={ref}
        onChangeCapture={()=>{dirty.current=true;}}
        className={`modal ${wide ? "wide" : ""} ${editor?"receipt-modal":""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {sessionRecovery}
        <div className="modal-header">
          <h2 id="modal-title" tabIndex={-1}>{t(title)}</h2>
          <button
            className="icon-button"
            aria-label={t("Zavřít dialog")}
            onClick={requestClose}
          >
            <X size={20} />
          </button>
        </div>
        {confirmClose&&<div className="notice warning" role="alert"><div><strong>{t('Změny ještě nejsou uložené do evidence.')}</strong><p>{t('Pokračujte v úpravách a uložte formulář, nebo jej zavřete.')}</p><button type="button" className="button primary" onClick={()=>setConfirmClose(false)}>{t('Pokračovat v úpravách')}</button><button type="button" className="button secondary" onClick={onClose}>{t('Přesto zavřít')}</button></div></div>}
        {children}
      </div>
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const { t } = useLanguage();
  return (
    <label className="field">
      <span>{t(label)}</span>
      {children}
      {hint && <small>{t(hint)}</small>}
    </label>
  );
}
function FormError({ error }: { error: string }) {
  const { t } = useLanguage();
  return error ? (
    <div
      className="notice error"
      role="alert"
      style={{ whiteSpace: "pre-line" }}
    >
      <TriangleAlert size={17} />
      {t(error)}
    </div>
  ) : null;
}

function OrganizationForm({
  organization,
  busy,
  onSave,
}: {
  organization?: Organization;
  busy: boolean;
  onSave: (o: Partial<Organization>) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [o, setO] = useState<Organization>(
    organization || {
      id: "",
      name: "",
      ico: "",
      address: "",
      email: "",
      phone: "",
      bank: "",
      representatives: ["", ""],
    },
  );
  const manualFields = useRef(new Set<string>());
  const autoFields = useRef<AutofillState>({values:{},selection:''});
  const [ocrBusy, setOcrBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [source, setSource] = useState("");
  const registry = async () => {
    setLookingUp(true);
    setError("");
    try {
      if (!/^[0-9]{8}$/.test(o.ico))
        throw new Error("Pro vyhledání v ARES zadejte osmimístné IČO.");
      const result = await jsonRequest<{
        fields: Partial<Organization>;
        source: string;
      }>(`/api/registry?ico=${encodeURIComponent(o.ico)}`);
      setO((old) => ({ ...old, ...result.fields }));
      setSource(result.source);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setLookingUp(false);
    }
  };
  const change = (key: keyof Organization, value: unknown) => {
    manualFields.current.add(key); setO(old=>({...old,[key]:value}));
  };
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (ocrBusy) return;
        void onSave({
          ...o,
          representatives: o.representatives.filter((x) => x.trim()),
        }).catch((x) => setError(x.message));
      }}
    >
      <FormError error={error} />
      <div className="organization-onboarding">
        <label className="button secondary upload-button">
          <Upload size={15} />{t("Předvyplnit z podepsané smlouvy")}<input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setSourceFile(e.target.files?.[0] || null);
              e.target.value = "";
            }}
          />
        </label>
        {sourceFile && (
          <Extraction
            file={sourceFile}
            mode="organization"
            onBusyChange={setOcrBusy}
            onExtract={(fields,context) => {
              const allowed = [
                "name",
                "ico",
                "address",
                "email",
                "phone",
                "bank",
                "representatives",
              ];
              const proposed = Object.fromEntries(Object.entries(fields).filter(([key])=>allowed.includes(key)));
              setO(old=>{const merged=mergeAutofill(old,proposed,autoFields.current,{selection:context.selection,manual:manualFields.current,isNew:!organization,replace:context.replace});autoFields.current=merged.state;return merged.value;});
              setSource("Návrh z dokumentu · ověřte podle originálu");
            }}
          />
        )}
        {source && (
          <p className="onboarding-source">
            <CircleCheck size={13} />
            {t(source)}
          </p>
        )}
      </div>
      <Field label="Název organizace">
        <input
          required
          value={o.name}
          onChange={(e) => change("name", e.target.value)}
          placeholder={t("Sportovní klub Javor, z. s.")}
        />
      </Field>
      <div className="form-grid">
        <Field label="IČO">
          <div className="registry-input">
            <input
              required
              pattern="[0-9]{8}"
              title={t("IČO má osm číslic")}
              value={o.ico}
              onChange={(e) => change("ico", e.target.value)}
              placeholder={t("12345678")}
            />
            <button
              type="button"
              className="registry-button"
              disabled={lookingUp || busy || !/^[0-9]{8}$/.test(o.ico)}
              onClick={() => void registry()}
            >
              <span aria-hidden="true">{lookingUp ? <Loader2 className="spin" size={13} /> : <Search size={13} />}</span>
              <span>{t("ARES")}</span>
            </button>
          </div>
        </Field>
        <Field label="Bankovní účet">
          <input
            value={o.bank}
            onChange={(e) => change("bank", e.target.value)}
          />
        </Field>
      </div>
      <Field label="Sídlo organizace">
        <input
          required
          value={o.address}
          onChange={(e) => change("address", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="Kontaktní e-mail">
          <input
            type="email"
            value={o.email}
            onChange={(e) => change("email", e.target.value)}
          />
        </Field>
        <Field label="Telefon">
          <input
            value={o.phone}
            onChange={(e) => change("phone", e.target.value)}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Statutární zástupce">
          <input
            value={o.representatives[0] || ""}
            onChange={(e) =>
              change("representatives", [
                e.target.value,
                o.representatives[1] || "",
              ])
            }
          />
        </Field>
        <Field label="Druhý zástupce (volitelné)">
          <input
            value={o.representatives[1] || ""}
            onChange={(e) =>
              change("representatives", [
                o.representatives[0] || "",
                e.target.value,
              ])
            }
          />
        </Field>
      </div>

      <div className="form-footer">
        <button className="button primary" type="submit" disabled={busy || ocrBusy}>
          <span aria-hidden="true">{busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}</span>
          <span>{t("Uložit organizaci")}</span>
        </button>
      </div>
    </form>
  );
}
function ContractForm({
  contract,
  organizationId, organizations,
  busy,
  onSave,
}: {
  contract?: Contract;
  organizationId: string;
  organizations: Organization[];
  busy: boolean;
  onSave: (c: Partial<Contract>) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [c, setC] = useState<Contract>(
    contract || {
      id: "",
      organizationId,
      number: "",
      program: "Organizace",
      year: new Date().getFullYear(),
      amount: 0,
      validFrom: `${new Date().getFullYear()}-01-01`,
      validTo: `${new Date().getFullYear()}-12-31`,
      deadline: `${new Date().getFullYear() + 1}-01-31`,
      conditions: "",
      cashLimit: null,
      status: "draft",
      conclusion: "",
      reduction: 0,
      declaredBy: "",
      declaredAt: "",
      version: 0,
    },
  );
  const [error, setError] = useState("");
  const change = (key: keyof Contract, value: unknown) =>
    setC({ ...c, [key]: value });
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        void onSave(c).catch((x) => setError(x.message));
      }}
    >
      <FormError error={error} />
      {!contract && <Field label="Organizace"><select required value={c.organizationId} onChange={e=>change('organizationId',e.target.value)}><option value="">{t("Vyberte organizaci")}</option>{organizations.map(o=><option key={o.id} value={o.id}>{t(o.name)}</option>)}</select></Field>}
      <div className="form-grid">
        <Field label="Číslo smlouvy">
          <input
            required
            value={c.number}
            onChange={(e) => change("number", e.target.value)}
            placeholder={t("SFJ/2026/001")}
          />
        </Field>
        <Field label="Program">
          <select
            value={c.program}
            onChange={(e) => change("program", e.target.value)}
          >
            {programs.map((p) => (
              <option key={p} value={p}>{t(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Rok">
          <input
            type="number"
            min="2020"
            max="2100"
            required
            value={c.year}
            onChange={(e) => change("year", Number(e.target.value))}
          />
        </Field>
        <Field label="Částka dotace (Kč)">
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={c.amount || ""}
            onChange={(e) => change("amount", Number(e.target.value))}
          />
        </Field>
        <Field label="Začátek období">
          <input
            type="date"
            required
            value={c.validFrom}
            onChange={(e) => change("validFrom", e.target.value)}
          />
        </Field>
        <Field label="Konec období">
          <input
            type="date"
            required
            value={c.validTo}
            onChange={(e) => change("validTo", e.target.value)}
          />
        </Field>
        <Field label="Termín vyúčtování">
          <input
            type="date"
            required
            value={c.deadline}
            onChange={(e) => change("deadline", e.target.value)}
          />
        </Field>
      </div>
      <details className="advanced-options">
        <summary>{t("Další podmínky a hotovost (volitelné)")}</summary>
        <Field
          label="Kontrolní hranice hotovosti (Kč)"
          hint="Prázdné = pravidlo není potvrzené; každá hotovost vyžaduje vysvětlení."
        >
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={c.cashLimit ?? ""}
            onChange={(e) =>
              change(
                "cashLimit",
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
          />
        </Field>
      <Field
        label="Podmínky a poznámky ke smlouvě"
        hint="Uveďte konkrétní zdroj a znění pravidla; pokyny a rozhodnutí přiložte jako dokument."
      >
        <textarea
          rows={5}
          value={c.conditions}
          onChange={(e) => change("conditions", e.target.value)}
        />
      </Field>
      <div className="notice warning">
        <TriangleAlert size={17} />
        <span>{t("Limit hotovosti musí potvrdit federace.")}</span>
      </div>
      </details>
      <div className="form-footer">
        <button className="button primary" type="submit" disabled={busy}>
          <Check size={16} />{t("Uložit smlouvu")}</button>
      </div>
    </form>
  );
}

function ItemForm({
  item,
  contract,
  state,
  editable,
  reviewing,
  busy,
  upload,
  onSave,
  onOpenExisting,
  onDecision,
  onReply,
}: {
  item: Item;
  contract: Contract;
  state: AppState;
  editable: boolean;
  reviewing: boolean;
  busy: boolean;
  upload: (file: File) => Promise<StoredFile>;
  onSave: (i: Item) => Promise<unknown>;
  onOpenExisting: (i: Item) => void;
  onDecision: (d: Item["sfjDecision"], reason: string) => Promise<unknown>;
  onReply: (text: string, fileIds: string[]) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const organizationName = state.organizations.find(o=>o.id===contract.organizationId)?.name || '';
  const draftKey=`dotace-draft:${state.user.userId}:${contract.id}:${item.id||'new'}`;
  const [restored,setRestored]=useState(false);
  const [draft, setDraft] = useState<Item>(()=>{
    const initial={...item,recipientName:item.recipientName||(item.recipientType==='organization'?organizationName:''),fileIds:[...item.fileIds]};
    try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved&&saved.version===item.version&&Date.now()-saved.at<8*3600000&&saved.value?.contractId===contract.id&&Array.isArray(saved.value.fileIds))return {...initial,...saved.value};}catch{}
    return initial;
  });
  const [noteOpen,setNoteOpen]=useState(Boolean(draft.comment));
  useEffect(()=>{try{if(sessionStorage.getItem(draftKey))setRestored(true);}catch{}},[draftKey]);
  useEffect(()=>{if(!editable)return;try{sessionStorage.setItem(draftKey,JSON.stringify({version:item.version,at:Date.now(),value:draft,manual:Array.from(editedFields.current)}));}catch{}},[draft,draftKey,editable,item.version]);
  const editedFields = useRef(new Set<string>((()=>{try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');return Array.isArray(saved?.manual)?saved.manual:[];}catch{return [];}})()));
  const autofill = useRef<AutofillState>({values: item.recipientName ? {} : {recipientName:organizationName},selection:''});
  const [extractionBusy, setExtractionBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newFiles, setNewFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState(draft.fileIds[0] || "");
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [readingSource, setReadingSource] = useState(false);
  const sourceFiles = useRef(new Map<string, File>());
  const [sourceAttempt, setSourceAttempt] = useState(0);
  const [decision, setDecision] = useState<Item["sfjDecision"]>(
    item.sfjDecision === "pending" ? "accepted" : item.sfjDecision,
  );
  const [reason, setReason] = useState(item.sfjReason);
  const [reply, setReply] = useState("");
  const change = (key: keyof Item, value: unknown) => {
    editedFields.current.add(key);
    setDraft((prev) => ({ ...prev, [key]: value, ...(key !== "orgReview" && key !== "excluded" ? {orgReview: "unchecked" as const} : {}) }));
  };
  const allFiles = [
    ...state.files,
    ...newFiles.filter((f) => !state.files.some((s) => s.id === f.id)),
  ];
  const file = allFiles.find((f) => f.id === selectedFile);
  const duplicate = duplicateReceipt(state.items, draft);
  const issues = findings(draft, contract);
  const needsComment = issues.some((i) => i.severity === "warning");
  const showFindings = Boolean(item.id || editedFields.current.size || draft.fileIds.length && !uploading && !readingSource && !extractionBusy);
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    setUploading(true);
    setError("");
    try {
      for (const [index,f] of selectedFiles.entries()) {
        const uploaded = await upload(f);
        sourceFiles.current.set(uploaded.id, f);
        setNewFiles(old=>[...old,uploaded]);
        setDraft(old=>({...old,fileIds:[...old.fileIds,uploaded.id]}));
        if (index === 0) { setSelectedFile(uploaded.id); if (editable) setExtractFile(f); }
      }
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    if (!file || !editable) { setExtractFile(null); return; }
    const cached = sourceFiles.current.get(file.id);
    if (cached) { setExtractFile(cached); setReadingSource(false); return; }
    const source = file, controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let disposed = false;
    setExtractFile(null); setReadingSource(true);
    void (async () => {
      try {
        const response = await fetch(`/api/files?id=${encodeURIComponent(source.id)}`, { credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 ? 'Přihlášení vypršelo. Přihlaste se znovu v nové záložce a opakujte čtení.' : 'Přílohu se nepodařilo načíst. Zkuste čtení znovu.');
        const blob = await response.blob();
        if (!disposed) {
          const loaded = new File([blob], source.name, { type: source.type });
          sourceFiles.current.set(source.id, loaded); setExtractFile(loaded);
        }
      } catch (e) { if (!disposed) setError(controller.signal.aborted ? 'Načtení přílohy trvá příliš dlouho. Zkuste čtení znovu.' : e instanceof Error ? e.message : 'Přílohu se nepodařilo načíst.'); }
      finally { clearTimeout(timer); if (!disposed) setReadingSource(false); }
    })();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [selectedFile, editable, file?.id, file?.name, file?.type, sourceAttempt]);
  const applyExtraction = (fields: Record<string, unknown>, context: ExtractionContext) => {
    const allowed = [
      "number",
      "supplier",
      "supplierIco",
      "description",
      "category",
      "amount",
      "claimed",
      "date",
      "payment",
      "recipientType",
      "recipientName", "comment", "excluded",
    ];
    const patch = Object.fromEntries(
      Object.entries(fields).filter(
        ([k, v]) => allowed.includes(k) && v !== undefined && v !== null,
      ),
    );
    setDraft((old) => {
      const known = duplicateReceipt(state.items, {...old,...patch} as Item);
      const available = known ? Object.fromEntries(allowed.map(key=>[key,known[key as keyof Item]])) : {};
      const proposed = {...available,...patch};
      if (!proposed.recipientName && (proposed.recipientType ?? old.recipientType) === 'organization') proposed.recipientName = organizationName;
      const sameName=(a:string,b:string)=>a.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')===b.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
      if (proposed.recipientName && !sameName(String(proposed.recipientName),organizationName) && (context.isReport && proposed.recipientType==='organization' || /s\.\s*r\.\s*o|ltd|inc\b|a\.\s*s\./i.test(String(proposed.recipientName)))) proposed.recipientType = 'other';
      const merged = mergeAutofill(old, proposed, autofill.current, {selection:context.selection,manual:editedFields.current,isNew:!item.id,replace:context.replace});
      autofill.current = merged.state;
      const next = merged.value;
      if (typeof fields.extractionNote === 'string' && !next.comment.includes(fields.extractionNote)) next.comment = [next.comment,fields.extractionNote].filter(Boolean).join('\n');
      const changed = allowed.some(key=>next[key as keyof Item]!==old[key as keyof Item]);
      return {...next, orgReview: changed ? 'unchecked' : old.orgReview};
    });
  };
  return (
    <div className={`item-editor ${editable && !draft.fileIds.length ? "upload-first" : ""}`}>
      <div className="item-document">
        {file?.type.startsWith("image/") && <div className="document-bar">
          <span>
            <Paperclip size={15} />{t("Originál dokladu")}</span>
          {file && (
            <a
              className="text-link"
              href={`/api/files?id=${encodeURIComponent(file.id)}`}
              target="_blank"
              rel="noreferrer"
            >{t("Otevřít ")}<ArrowUpRight size={14} />
            </a>
          )}
        </div>}
        {extractFile && editable && (
          <div className="extraction-wrap">
            <Extraction file={extractFile} onExtract={applyExtraction} onBusyChange={setExtractionBusy} onReload={()=>{
              try {
                sessionStorage.setItem(draftKey,JSON.stringify({version:item.version,at:Date.now(),value:draft,manual:Array.from(editedFields.current)}));
                window.location.reload();
              } catch { setError('Rozepsané údaje nelze uchovat pro obnovení stránky. Nejprve doklad uložte.'); }
            }} />
          </div>
        )}
        {file ? (
          <div className="file-preview">
            {file.type.startsWith("image/") ? (
              <img
                src={`/api/files?id=${encodeURIComponent(file.id)}`}
                alt={t(`Příloha ${file.name}`)}
              />
            ) : (
              <DocumentPreview file={file} />
            )}

          </div>
        ) : (
          null
        )}
        {(editable ||
          (item.sfjDecision === "supplement" &&
            state.membership.role !== "federation")) && (
          <label className={`upload-zone ${file ? "has-file" : ""} ${uploading ? "disabled" : ""}`}>
            <Upload size={22} />
            <strong key={String(uploading)}>
              {t(uploading ? "Nahrávám…" : file ? "Přidat další přílohu" : "Vybrat doklad")}
            </strong>
            <span>{t(file ? "PDF nebo obrázek · do 10 MB" : "PDF, JPG, PNG, WebP · do 10 MB")}</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              disabled={uploading || busy}
              onChange={(e) => {
                void uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {!draft.fileIds.length && <FormError error={error} />}
        {file && editable && !extractFile && (
          <button
            type="button"
            className="button secondary read-stored-file"
            disabled={readingSource || uploading || busy}
            onClick={() => { setError(""); setSourceAttempt(n => n + 1); }}
          >
            <span aria-hidden="true">{readingSource ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}</span>
            <span>{t(readingSource ? "Načítání pro OCR…" : "Znovu načíst pro OCR")}</span>
          </button>
        )}
        {draft.fileIds.length > 0 && editable && (
          <div className="attached-list">
            {draft.fileIds.map((id) => (
              <div key={id}>
                <Paperclip size={13} />
                <button type="button" className={`attachment-name ${selectedFile===id?"selected":""}`} onClick={()=>setSelectedFile(id)} aria-pressed={selectedFile===id}>{t(allFiles.find((f) => f.id === id)?.name || id)}</button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Odpojit přílohu z dokladu")}
                  onClick={() => {
                    change(
                      "fileIds",
                      draft.fileIds.filter((f) => f !== id),
                    );
                    if (selectedFile === id)
                      setSelectedFile(
                        draft.fileIds.find((f) => f !== id) || "",
                      );
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {(!editable || draft.fileIds.length > 0) && <div className="item-entry"><div className="item-fields">
        {editable && restored && <p className="draft-status" role="status">{t("Rozepsaný doklad obnoven.")}</p>}
        <FormError error={error} />
        {duplicate && <div className="notice warning" role="status"><div><strong>{t("Doklad už je v evidenci")}</strong><p>{t(`${duplicate.number} · ${duplicate.supplier}. Nalezené údaje jsou vyplněné; uložený doklad můžete otevřít bez vytvoření kopie.`)}</p><button type="button" className="button secondary" onClick={()=>onOpenExisting(duplicate)}><span>{t("Otevřít uložený doklad")}</span></button></div></div>}
        <form id="receipt-form"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            if (duplicate) { setError('Tento doklad již je v evidenci. Otevřete uložený doklad.'); return; }
            if (!editable || busy || extractionBusy || readingSource || uploading) return;
            void onSave(draft).then(()=>{try{sessionStorage.removeItem(draftKey);}catch{}}).catch((x) => setError(x.message));
          }}
        >
          <div className="item-section-title">

            <div>
              <h3>{t("Údaje dokladu")}</h3>

            </div>
          </div>
          <fieldset disabled={!editable || busy}>
            <div className="form-grid">
              <Field label="Číslo dokladu">
                <input
                  required
                  value={draft.number}
                  onChange={(e) => change("number", e.target.value)}
                  placeholder={t("FA-2026-001")}
                />
              </Field>
              <Field label="Datum úhrady">
                <input
                  type="text"
                  required
                  placeholder={t("RRRR-MM-DD nebo D. M. RRRR")}
                  value={draft.date}
                  onChange={(e) => change("date", e.target.value)}
                  onBlur={(e) => { const parsed = parsePaymentDate(e.target.value); if (parsed) change("date", parsed); }}
                />
              </Field>
              <Field label="Dodavatel">
                <input
                  required
                  value={draft.supplier}
                  onChange={(e) => change("supplier", e.target.value)}
                />
              </Field>
              <Field label="IČO dodavatele">
                <input
                  value={draft.supplierIco}
                  onChange={(e) => change("supplierIco", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Popis výdaje">
              <textarea
                required
                rows={2}
                value={draft.description}
                onChange={(e) => change("description", e.target.value)}
                placeholder={t("K čemu byl výdaj použit?")}
              />
            </Field>
            <Field label="Skupina nákladů">
              <select
                value={draft.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Částka dokladu (Kč)">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={draft.amount || ""}
                  onChange={(e) => {
                    const amount = Number(e.target.value);
                    editedFields.current.add('amount'); editedFields.current.add('claimed');
                    setDraft((old) => ({
                      ...old,
                      amount,
                      orgReview: "unchecked",
                      claimed:
                        old.claimed === old.amount ? amount : old.claimed,
                    }));
                  }}
                />
              </Field>
              <Field label="Uplatněná částka (Kč)">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={draft.claimed || ""}
                  onChange={(e) => change("claimed", Number(e.target.value))}
                />
              </Field>
              <Field label="Způsob úhrady">
                <select
                  value={draft.payment}
                  onChange={(e) => change("payment", e.target.value)}
                >
                  <option value="bank">{t("Bezhotovostní platba")}</option>
                  <option value="cash">{t("Hotovost")}</option>
                </select>
              </Field>
              <Field label="Komu je doklad vystaven">
                <select
                  value={draft.recipientType}
                  onChange={(e) => { change("recipientType",e.target.value); change("recipientName",e.target.value === "organization" ? organizationName : ""); }}
                >
                  <option value="organization">{t("Na naši organizaci")}</option>
                  <option value="person">{t("Na osobu")}</option>
                  <option value="none">{t("Bez uvedení odběratele")}</option>
                  <option value="other">{t("Na jinou firmu")}</option>
                </select>
              </Field>
            </div>
            {draft.recipientType !== "none" && (
              <Field label="Jméno nebo název příjemce dokladu">
                <input
                  value={draft.recipientName}
                  onChange={(e) => change("recipientName", e.target.value)}
                />
              </Field>
            )}
          </fieldset>
          {!showFindings ? null : issues.length > 0 ? (
            <div className="finding-list">
              {issues.map((f) => (
                <div className={`finding ${f.severity}`} key={f.code}>
                  <TriangleAlert size={15} />
                  <span>{t(f.message)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <fieldset disabled={!editable || busy}>
            {needsComment ? <Field
              label={
                needsComment
                  ? "Vysvětlení upozornění (povinné pro kontrolu)"
                  : "Komentář organizace"
              }
            >
              <textarea
                rows={2}
                value={draft.comment}
                onChange={(e) => change("comment", e.target.value)}
                placeholder={t("Uveďte souvislost, důvod částečného uplatnění nebo jiné vysvětlení.")}
              />
            </Field> : <details className="optional-note" open={noteOpen} onToggle={event=>setNoteOpen(event.currentTarget.open)}><summary>{t("Přidat poznámku")}</summary><Field label="Komentář organizace"><textarea rows={2} value={draft.comment} onChange={e=>change("comment",e.target.value)}/></Field></details>}
            <label className="checkbox-label review-confirmation">
              <input type="checkbox" checked={draft.orgReview !== 'unchecked'}
                onChange={e => change('orgReview', e.target.checked ? (needsComment ? 'commented' : 'checked') : 'unchecked')} />
              <span>{t("Údaje odpovídají dokladu.")}</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.excluded}
                onChange={(e) => change("excluded", e.target.checked)}
              />
              <span>{t("Vyřadit z vyúčtování")}{t(" ")}

              </span>
            </label>
          </fieldset>
        </form>
        {!!item.id && (item.sfjDecision !== "pending" || contract.status === "submitted" || contract.status === "approved") && (
          <>
            <div className="item-section-title">

              <div>
                <h3>{t("Posouzení SFJ")}</h3>
                <p>
                  <span className={`badge sfj-${item.sfjDecision}`}>
                    {t(sfjNames[item.sfjDecision])}
                  </span>
                </p>
              </div>
            </div>
            {item.sfjReason && (
              <div className="review-reason">
                <strong>{t("Vyjádření SFJ")}</strong>
                <p>{t(item.sfjReason)}</p>
              </div>
            )}
            {reviewing && !item.excluded && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  void onDecision(decision, reason).catch((x) =>
                    setError(x.message),
                  );
                }}
              >
                <Field label="Rozhodnutí">
                  <select
                    value={decision}
                    onChange={(e) =>
                      setDecision(e.target.value as Item["sfjDecision"])
                    }
                  >
                    <option value="accepted">{t("Akceptováno")}</option>
                    <option value="rejected">{t("Neuznáno")}</option>
                    <option value="supplement">{t("Vyžádáno doplnění")}</option>
                  </select>
                </Field>
                <Field
                  label={
                    decision === "accepted"
                      ? "Poznámka SFJ (volitelné)"
                      : "Důvod / co má organizace doplnit"
                  }
                >
                  <textarea
                    required={decision !== "accepted"}
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <button className="button primary" disabled={busy}>
                  <ShieldCheck size={16} />{t("Uložit rozhodnutí")}</button>
              </form>
            )}
            {item.sfjDecision === "supplement" &&
              !reviewing &&
              state.membership.role === "federation" && (
                <div className="inline-banner">
                  <Users size={16} />{t("Odpověď na dožádání vkládá přihlášený člen organizace.")}</div>
              )}
            {item.sfjDecision === "supplement" &&
              !reviewing &&
              state.membership.role !== "federation" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError("");
                    void onReply(
                      reply,
                      draft.fileIds.filter((id) => !item.fileIds.includes(id)),
                    ).catch((x) => setError(x.message));
                  }}
                >
                  <Field label="Odpověď organizace">
                    <textarea
                      required
                      rows={4}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder={t("Odpovězte na požadované doplnění. Přílohu můžete přidat vlevo.")}
                    />
                  </Field>
                  <button
                    className="button primary"
                    disabled={busy || uploading || readingSource || extractionBusy || !!duplicate}
                  >
                    <Send size={16} />{t("Odeslat doplnění")}</button>
                </form>
              )}
            {state.audit.some((a) => a.itemId === item.id) && (
              <details className="item-history">
                <summary>{t("Historie dokladu")}</summary>
                {state.audit
                  .filter((a) => a.itemId === item.id)
                  .map((a) => (
                    <div key={a.id}>
                      <small>
                        {t(date(a.at))}{t(" ·")}{t(a.actor)}
                      </small>
                      <strong>{t(actionLabel(a.action))}</strong>
                      <p>{t(a.detail.replace(/ · \d+ B · SHA-256 [a-f0-9]{64}/i, ""))}</p>
                    </div>
                  ))}
              </details>
            )}
          </>
        )}
      </div>
      {editable && <div className="item-savebar"><div><strong>{t(duplicate ? 'Doklad už je v evidenci' : extractionBusy || readingSource ? 'Načítání dokladu…' : issues.some(i=>i.severity==='error') ? 'Doplňte povinné údaje' : '')}</strong></div><button className="button primary" type="submit" form="receipt-form" disabled={busy || uploading || readingSource || extractionBusy || !!duplicate}><span aria-hidden="true">{busy ? <Loader2 size={16} className="spin"/> : <Check size={16}/>}</span><span>{t(busy?'Ukládám…':'Uložit doklad')}</span></button></div>}
      </div>}
    </div>
  );
}

function Conditions({
  contract,
  state,
  canUpload,
  upload,
  setToast,
  setError,
}: {
  contract: Contract;
  state: AppState;
  canUpload: boolean;
  upload: (f: File, c: Contract, k: StoredFile["kind"]) => Promise<StoredFile>;
  setToast: (s: string) => void;
  setError: (s: string) => void;
}) {
  const { t } = useLanguage();
  const [kind, setKind] = useState<StoredFile["kind"]>("contract");
  const [uploading, setUploading] = useState(false);
  const files = state.files.filter(
    (f) => f.contractId === contract.id && f.kind !== "receipt",
  );
  const names = {
    contract: "Podepsaná smlouva",
    instructions: "Pokyny SFJ",
    decision: "Rozhodnutí ASP",
    amendment: "Dodatek ke smlouvě",
    receipt: "Doklad",
  };
  return (
    <div className="conditions-grid">
      <section className="panel padded">
        <div className="section-heading">
          <ShieldCheck size={21} />
          <div>
            <h2>{t("Podmínky smlouvy")}</h2>

          </div>
        </div>
        <dl className="detail-list">
          <dt>{t("Program")}</dt>
          <dd>{t(contract.program)}</dd>
          <dt>{t("Období úhrad")}</dt>
          <dd>
            {t(date(contract.validFrom))}{t(" –")}{t(date(contract.validTo))}
          </dd>
          <dt>{t("Termín vyúčtování")}</dt>
          <dd>{t(date(contract.deadline))}</dd>
          <dt>{t("Dotace")}</dt>
          <dd>{t(money(contract.amount))}</dd>
          <dt>{t("Kontrolní hranice hotovosti")}</dt>
          <dd>
            {t(contract.cashLimit === null
              ? "Nepotvrzená"
              : money(contract.cashLimit))}
          </dd>
        </dl>
        <div className="conditions-text">
          {t(contract.conditions ||
            "Konkrétní podmínky dosud nebyly doplněné. Vycházejte z podepsané smlouvy a přiložených pokynů.")}
        </div>
        {contract.cashLimit === null && <div className="notice warning">
          <TriangleAlert size={17} />
          <div>
            <strong>{t("Hotovost vyžaduje ověření")}</strong>
            <p>{t("Limit hotovosti musí potvrdit federace.")}</p>
          </div>
        </div>}
      </section>
      <section className="panel padded">
        <h2>{t("Dokumenty a zdroje pravidel")}</h2>

        <div className="source-files">
          {files.map((f) => (
            <a
              key={f.id}
              href={`/api/files?id=${encodeURIComponent(f.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="source-icon">
                <FileText size={19} />
              </span>
              <span>
                <strong>{t(names[f.kind])}</strong>
                <small>
                  {t(f.name)}{t(" ·")}{t(date(f.createdAt))}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </a>
          ))}
        </div>
        {!files.length && (
          <div className="inline-banner">
            <FileText size={17} />{t("Ke smlouvě zatím nejsou přiložené zdrojové dokumenty.")}</div>
        )}
        {canUpload && (
          <div className="source-upload">
            <label className="field">
              <span>{t("Druh dokumentu")}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as StoredFile["kind"])}
              >
                <option value="contract">{t("Podepsaná smlouva")}</option>
                <option value="instructions">{t("Pokyny SFJ")}</option>
                <option value="decision">{t("Rozhodnutí ASP")}</option>
                <option value="amendment">{t("Dodatek")}</option>
              </select>
            </label>
            <label className="button secondary upload-button">
              <Upload size={16} />
              <span key={String(uploading)}>{t(uploading ? "Ukládání…" : "Přiložit PDF nebo fotografii")}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  void upload(file, contract, kind)
                    .then(() => setToast("Zdrojový dokument je uložený."))
                    .catch((x) => setError(x.message))
                    .finally(() => setUploading(false));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}

function Summary({
  contract,
  organization,
  items,
  state,
  exportCsv,
}: {
  contract: Contract;
  organization: Organization;
  items: Item[];
  state: AppState;
  exportCsv: () => void;
}) {
  const { t } = useLanguage();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const downloadPdf = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const { downloadSettlementPdf } = await import("@/lib/report-pdf");
      await downloadSettlementPdf({
        contract,
        organization,
        items,
        files: state.files.filter((file) => file.contractId === contract.id),
      });
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "PDF se nepodařilo vytvořit. Zkuste to znovu.",
      );
    } finally {
      setDownloading(false);
    }
  };
  const rejected =
    items
      .filter((i) => !i.excluded && i.sfjDecision === "rejected")
      .reduce((s, i) => s + Math.round(i.claimed * 100), 0) / 100;
  return (
    <div className="summary-stack">
      <div className="summary-toolbar no-print">
        <div>
          <h2>{t("Souhrn vyúčtování")}</h2>
        </div>
        <div className="row-actions">
          <button className="button secondary" onClick={exportCsv}>
            <Download size={16} />{t("CSV export")}</button>
          <button
            className="button primary"
            disabled={downloading}
            onClick={() => void downloadPdf()}
          >
            <span aria-hidden="true">{downloading ? <Loader2 size={16} className="spin" /> : <Download size={16} />}</span>
            <span key={String(downloading)}>{t(downloading ? "Připravuji PDF…" : "Stáhnout PDF")}</span>
          </button>
        </div>
      </div>
      {downloadError && (
        <div className="no-print">
          <FormError error={downloadError} />
        </div>
      )}
      <section className="report panel">
        <div className="report-header">
          <div className="report-brand">
            <Leaf size={24} />
            <span>{t("SFJ / Dotace")}</span>
          </div>
          <span className={`badge ${contract.status}`}>
            {t(statusNames[contract.status])}
          </span>
        </div>
        <div className="report-title">
          <div className="eyebrow">{t("VYÚČTOVÁNÍ DOTACE")}</div>
          <h2>{t(organization.name)}</h2>
          <p>{t("Smlouva ")}{t(contract.number)}{t(" ·")}{t(contract.program)}{t(" ·")}{contract.year}
          </p>
          <p className="small-muted">{t("IČO ")}{t(organization.ico)}{t(" · ")}{organization.address}
          </p>
        </div>
        <div className="report-totals">
          <div>
            <span>{t("Přidělená dotace")}</span>
            <strong>{t(money(contract.amount))}</strong>
          </div>
          <div>
            <span>{t("Uplatněné náklady")}</span>
            <strong>{t(money(total(items)))}</strong>
          </div>
          <div>
            <span>{t("Krácení dotace")}</span>
            <strong>{t(money(contract.reduction))}</strong>
          </div>
          <div>
            <span>{t("Dotace po krácení")}</span>
            <strong>
              {t(money(Math.max(0, contract.amount - contract.reduction)))}
            </strong>
          </div>
        </div>
        <h3>{t("Souhrn podle skupin nákladů")}</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>{t("Skupina nákladů")}</th>
              <th className="numeric">{t("Dokladů")}</th>
              <th className="numeric">{t("Uplatněno")}</th>
              <th className="numeric">{t("Akceptováno")}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(categoryLabels) as Category[]).map((category) => {
              const list = items.filter(
                (i) => i.category === category && !i.excluded,
              );
              return (
                <tr key={category}>
                  <td>{t(categoryLabels[category])}</td>
                  <td className="numeric">{list.length}</td>
                  <td className="numeric">{t(money(total(list)))}</td>
                  <td className="numeric">
                    {t(money(
                      total(list.filter((i) => i.sfjDecision === "accepted")),
                    ))}
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>{t("Celkem")}</td>
              <td className="numeric">
                {items.filter((i) => !i.excluded).length}
              </td>
              <td className="numeric">{t(money(total(items)))}</td>
              <td className="numeric">
                {t(money(
                  total(items.filter((i) => i.sfjDecision === "accepted")),
                ))}
              </td>
            </tr>
          </tbody>
        </table>
        <h3>{t("Položky vyúčtování")}</h3>
        <div className="table-scroll">
          <table className="report-table small">
            <thead>
              <tr>
                <th>{t("Doklad / popis")}</th>
                <th>{t("Skupina")}</th>
                <th>{t("Úhrada")}</th>
                <th className="numeric">{t("Uplatněno")}</th>
                <th>{t("SFJ")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.excluded ? "excluded" : ""}>
                  <td>
                    <strong>
                      {t(i.number)}{t(" ·")}{t(i.supplier)}
                    </strong>
                    <p>{t(i.description)}</p>
                    {i.comment && <small>{t("Komentář:")}{t(i.comment)}</small>}
                    {i.sfjReason && <small>{t("SFJ:")}{t(i.sfjReason)}</small>}
                    {i.excluded && <small>{t("Vyřazeno z vyúčtování")}</small>}
                  </td>
                  <td>{t(categoryLabels[i.category])}</td>
                  <td>
                    {t(date(i.date))}
                    <small>{t(i.payment === "bank" ? "Bezhotovostní platba" : "Hotovost")}</small>
                  </td>
                  <td className="numeric">{t(money(i.claimed))}</td>
                  <td>{t(i.excluded ? "Vyřazeno" : sfjNames[i.sfjDecision])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="report-declaration">
          <h3>{t("Prohlášení příjemce")}</h3>
          <p>{t(declaration)}</p>
          <small>
            {t(contract.declaredAt
              ? `Potvrzeno: ${contract.declaredBy} · ${new Date(contract.declaredAt).toLocaleString("cs-CZ")}`
              : "Vyúčtování dosud nebylo odeslané a prohlášení nebylo potvrzené.")}
          </small>
        </div>
        <div className="report-conclusion">
          <h3>{t("Závěr kontroly SFJ")}</h3>
          <p>{t(contract.conclusion || "Kontrola dosud nebyla uzavřená.")}</p>
          <div>{t("Neuznané položky: ")}<strong>{t(money(rejected))}</strong>{t(" ")}
            <span className="dot-separator">{t("·")}</span>{t(" Krácení dotace:")}{t(" ")}
            <strong>{t(money(contract.reduction))}</strong>
          </div>
        </div>
        <div className="report-foot">
          <span>{t("Fiktivní pilotní data · SFJ provádí formální kontrolu.")}</span>
          <span>{t("Vytvořeno ")}{t(date(today()))}{t(" ·")}{t(" ")}
            {state.files.filter((f) => f.contractId === contract.id).length}{t(" ")}{t("příloh")}</span>
        </div>
      </section>
    </div>
  );
}
function Audit({ events }: { events: AuditEvent[] }) {
  const { t } = useLanguage();
  return (
    <section className="panel padded audit-panel">
      {events.length ? (
        <div className="timeline">
          {events.map((a) => (
            <article key={a.id}>
              <span className="timeline-dot" />
              <div>
                <div className="timeline-top">
                  <strong>{t(actionLabel(a.action))}</strong>
                  <time>{t(new Date(a.at).toLocaleString("cs-CZ"))}</time>
                </div>
                <p>{t(a.detail.replace(/ · \d+ B · SHA-256 [a-f0-9]{64}/i, ""))}</p>
                <small>{t(a.actor)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<History size={27} />}
          title={t("Zatím bez změn")}
          text="Zde se objeví uložené úpravy, kontroly a odpovědi."
        />
      )}
    </section>
  );
}
function SubmitForm({
  contract,
  items,
  busy,
  onSubmit,
}: {
  contract: Contract;
  items: Item[];
  busy: boolean;
  onSubmit: () => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const errors = submissionErrors(contract, items);
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit().catch((x) => setError(x.message));
      }}
    >
      <p className="form-intro">{t("Po odeslání lze doklady upravit až po vrácení federací.")}</p>
      <FormError error={error} />
      {errors.length ? (
        <div className="submission-errors">
          <h3>{t("Ještě je potřeba doplnit")}</h3>
          <ul>
            {errors.map((s, i) => (
              <li key={i}>{t(s)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="notice success">
          <CircleCheck size={19} />
          <span>
            {items.filter((i) => !i.excluded).length}{t(" dokladů ·")}{t(" ")}
            {t(money(total(items)))}
          </span>
        </div>
      )}
      <label className="checkbox-label declaration">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{t(declaration)}</span>
      </label>
      <div className="form-footer">
        <button
          className="button primary"
          disabled={busy || !confirmed || errors.length > 0}
        >
          <Send size={16} />{t("Odeslat vyúčtování SFJ")}</button>
      </div>
    </form>
  );
}
function ApprovalForm({
  contract,
  items,
  busy,
  onSubmit,
}: {
  contract: Contract;
  items: Item[];
  busy: boolean;
  onSubmit: (s: string, n: number) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const progress = reviewProgress(items);
  const rejected = total(items.filter((i) => !i.excluded && i.sfjDecision === "rejected"));
  const pending = items.filter(
    (i) =>
      !i.excluded &&
      (i.sfjDecision === "pending" || i.sfjDecision === "supplement"),
  );
  const [conclusion, setConclusion] = useState(contract.conclusion);
  const [reduction, setReduction] = useState(rejected);
  const [error, setError] = useState("");
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(conclusion, reduction).catch((x) => setError(x.message));
      }}
    >
      <FormError error={error} />

      <div className="approval-counts"><span><strong>{progress.active.filter(item => item.sfjDecision === 'accepted').length}</strong> {t('přijatých výdajů')}</span><span><strong>{progress.active.filter(item => item.sfjDecision === 'rejected').length}</strong> {t('zamítnutých výdajů')}</span></div>
      {pending.length > 0 && (
        <div className="notice warning">
          <TriangleAlert size={18} />
          <span>
            {pending.length}{t(" dokladů ještě nemá konečné rozhodnutí. Před uzavřením je posuďte.")}</span>
        </div>
      )}
      <div className="approval-summary">
        <span>{t("Neuznané položky")}</span>
        <strong>{t(money(rejected))}</strong>
      </div>
      <Field
        label="Krácení dotace (Kč)"
        hint="Předvyplněno podle neuznaných položek. Případné další krácení odůvodněte v závěru."
      >
        <input
          type="number"
          min={rejected}
          max={contract.amount}
          step="0.01"
          required
          value={reduction}
          onChange={(e) => setReduction(Number(e.target.value))}
        />
      </Field>
      <Field label="Závěr kontroly">
        <textarea
          required
          rows={3}
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          placeholder={t("Uveďte závěr formální kontroly a případné odůvodnění krácení.")}
        />
      </Field>

      <div className="form-footer">
        <button
          className="button primary"
          disabled={busy || !progress.ready || !conclusion.trim()}
        >
          <ShieldCheck size={16} />{t("Schválit a uzavřít vyúčtování")}</button>
      </div>
    </form>
  );
}
function TextForm({
  label,
  button,
  busy,
  onSubmit,
}: {
  label: string;
  button: string;
  busy: boolean;
  onSubmit: (s: string) => Promise<unknown>;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(text).catch((x) => setError(x.message));
      }}
    >
      <FormError error={error} />
      <Field label={label}>
        <textarea
          required
          minLength={3}
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className="form-footer">
        <button className="button primary" disabled={busy || !text.trim()}>
          <Send size={16} />
          {t(button)}
        </button>
      </div>
    </form>
  );
}
function InviteForm({
  organizationId,
  federation,
  emailEnabled,
  busy,
  onInvite,
}: {
  organizationId: string;
  federation: boolean;
  emailEnabled: boolean;
  busy: boolean;
  onInvite: (email: string, role: string) => Promise<{ inviteUrl?: string }>;
}) {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const sfjInvite = federation && !organizationId;
  const [role, setRole] = useState(
    sfjInvite ? "federation" : federation ? "org_admin" : "member",
  );
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        void onInvite(email, role)
          .then((r) => {
            if (!r.inviteUrl) throw new Error("Odkaz pozvánky není dostupný.");
            setLink(new URL(r.inviteUrl, window.location.origin).href);
          })
          .catch((x) => setError(x.message));
      }}
    >
      <FormError error={error} />
      <Field label="E-mail pozvaného">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Oprávnění">
        {sfjInvite ? (
          <input readOnly value="Správce SFJ · všechny organizace" />
        ) : (
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {federation && (
              <option value="org_admin">{t("Správce organizace · odesílá vyúčtování")}</option>
            )}
            <option value="member">{t("Člen · připravuje doklady")}</option>
          </select>
        )}
      </Field>
      {sfjInvite && (
        <div className="notice warning">
          <ShieldCheck size={17} />
          <span>{t("Správce SFJ získá stejné oprávnění ke všem organizacím, smlouvám i rozhodnutím jako vy.")}</span>
        </div>
      )}
      <div className="inline-banner">
        <Users size={17} />{t(emailEnabled?'Po vytvoření bude pozvánka zařazena k odeslání e-mailem. Odkaz můžete také zkopírovat.':'E-mail není nastavený. Zkopírujte odkaz a předejte jej pozvanému členovi.')}</div>
      {link && (
        <div className="invite-result">
          <strong>{t("Pozvánka je připravená")}</strong>
          <input
            aria-label={t("Odkaz pozvánky")}
            value={link}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() => setError("Zkopírujte odkaz ručně z pole."))
            }
          >
            <Copy size={15} />
            {t(copied ? "Zkopírováno" : "Kopírovat odkaz")}
          </button>
        </div>
      )}
      <div className="form-footer">
        <button
          className="button primary"
          disabled={busy || (!organizationId && !sfjInvite)}
        >
          <Plus size={16} />{t("Vytvořit pozvánku")}</button>
      </div>
    </form>
  );
}
function Adviser({
  contract,
  contracts,
}: {
  contract?: Contract;
  contracts: Contract[];
}) {
  const { t } = useLanguage();
  const [id, setId] = useState(contract?.id || contracts[0]?.id || "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    answer: string;
    sources?: { title: string; url?: string; excerpt?: string }[];
    mode?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const ask = async (q: string) => {
    setLoading(true);
    setError("");
    setQuestion(q);
    try {
      const data = await jsonRequest<{
        answer: string;
        sources?: { title: string; url?: string; excerpt?: string }[];
        mode?: string;
      }>("/api/adviser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId: id, question: q }),
      });
      setAnswer(data);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="adviser-body">
      <Field label="Smlouva">
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setAnswer(null);
          }}
        >
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {t(c.number)}{t(" ·")}{t(c.program)}
            </option>
          ))}
        </select>
      </Field>
      <div className="suggested-questions">
        {[
          "Jak vysvětlit částečné uplatnění dokladu?",
          "Mohu použít hotovost?",
        ].map((q) => (
          <button key={q} onClick={() => void ask(q)} disabled={loading || !id}>
            {t(q)}
            <ArrowUpRight size={13} />
          </button>
        ))}
      </div>
      <FormError error={error} />
      {answer && (
        <div className="adviser-answer">
          <span className="answer-label">
            <Leaf size={16} />{t("Odpověď podle dostupných podkladů")}</span>
          <p style={{ whiteSpace: "pre-line" }}>{t(answer.answer)}</p>
          {answer.sources && answer.sources.length > 0 && (
            <div className="answer-sources">
              <h4>{t("Zdroje a související podklady")}</h4>
              {answer.sources.map((s, i) => (
                <div key={i}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <FileText size={14} />
                      {t(s.title)}
                      <ArrowUpRight size={12} />
                    </a>
                  ) : (
                    <strong>{t(s.title)}</strong>
                  )}
                  {s.excerpt && <p>{t(s.excerpt)}</p>}
                </div>
              ))}
            </div>
          )}
          {answer.mode && <small className="small-muted">{t(answer.mode)}</small>}
        </div>
      )}
      {loading && (
        <div className="adviser-loading">
          <Loader2 className="spin" size={18} />{t("Procházím dostupné podklady…")}</div>
      )}
      <form
        className="adviser-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <textarea
          required
          aria-label={t("Dotaz na rádce")}
          rows={2}
          placeholder={t("Na co se chcete zeptat k této smlouvě?")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          className="button primary"
          disabled={loading || !question.trim() || !id}
          aria-label={t("Odeslat dotaz")}
        >
          <Send size={18} />
        </button>
      </form>
      <small className="small-muted">{t("Pokud ve zdrojích odpověď chybí, ověřte ji se SFJ. Rádce nepřidává vlastní pravidla.")}</small>
    </div>
  );
}
