"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileCheck2,
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
  Printer,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import Extraction from "@/components/dotace-extract";
import DocumentPreview from "@/components/dotace-document";
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
  date: today(),
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
    details?: string[];
  };
  if (!response.ok)
    throw Object.assign(
      new Error(data.error || "Požadavek se nepodařilo dokončit."),
      { status: response.status, details: data.details },
    );
  return data as T;
}

export default function DotaceApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [view, setView] = useState<View>("contracts");
  const [contractId, setContractId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [tab, setTab] = useState<Tab>("items");
  const [preview, setPreview] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [itemFilter, setItemFilter] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [inviteToken, setInviteToken] = useState("");
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
  useEffect(() => {
    void load().catch(() => {});
    const params = new URLSearchParams(window.location.search);
    setContractId(params.get("contract") || "");
    setInviteToken(params.get("invite") || "");
    const initialTab = params.get("tab");
    if (
      ["items", "conditions", "summary", "history"].includes(initialTab || "")
    )
      setTab(initialTab as Tab);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const mutate = async <T = Record<string, unknown>,>(
    action: string,
    payload: unknown,
    message = "Změna je uložená.",
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await jsonRequest<T>("/api/app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      await load();
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
  const openContract = (id: string) => {
    setContractId(id);
    setOrganizationId("");
    setTab("items");
    setSelected([]);
    setItemFilter("all");
    window.history.replaceState(
      null,
      "",
      `?contract=${encodeURIComponent(id)}`,
    );
  };
  const goHome = (newView: View) => {
    setView(newView);
    setContractId("");
    setOrganizationId("");
    setQuery("");
    window.history.replaceState(null, "", window.location.pathname);
  };
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
  const orgMode = !federation || preview;
  const contract = state?.contracts.find((c) => c.id === contractId);
  const organization = state?.organizations.find(
    (o) => o.id === (contract?.organizationId || organizationId),
  );
  const contractItems =
    state?.items.filter((i) => i.contractId === contractId) || [];
  const filteredItems = contractItems.filter((i) => {
    const q = query.trim().toLocaleLowerCase("cs");
    if (
      q &&
      !`${i.number} ${i.supplier} ${i.description}`
        .toLocaleLowerCase("cs")
        .includes(q)
    )
      return false;
    if (itemFilter === "missing") return !i.fileIds.length;
    if (itemFilter === "comments") return !!i.comment;
    if (itemFilter === "warnings")
      return contract && findings(i, contract).length > 0;
    if (itemFilter === "unchecked")
      return i.orgReview === "unchecked" && !i.excluded;
    if (itemFilter === "supplement") return i.sfjDecision === "supplement";
    if (itemFilter === "sample") return selected.includes(i.id);
    return true;
  });
  const filteredContracts =
    state?.contracts.filter(
      (c) =>
        (!program || c.program === program) &&
        (!year || c.year === Number(year)) &&
        (!orgFilter || c.organizationId === orgFilter) &&
        (!query ||
          `${c.number} ${c.program} ${state.organizations.find((o) => o.id === c.organizationId)?.name}`
            .toLocaleLowerCase("cs")
            .includes(query.toLocaleLowerCase("cs"))),
    ) || [];
  const editable =
    contract && (contract.status === "draft" || contract.status === "changes");
  const reviewing = federation && !preview && contract?.status === "submitted";
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
        "Popis nákladu",
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
        item.payment === "bank" ? "Banka" : "Hotovost",
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
          <span>
            Dotace<span className="muted"> / Javor</span>
          </span>
        </div>
        {error ? (
          <>
            <h1>
              {inviteToken
                ? "Pozvánka do organizace"
                : unauthorized
                  ? "Přihlaste se do svého prostoru"
                  : "Aplikaci se nepodařilo načíst"}
            </h1>
            <p>
              {inviteToken
                ? "Přijměte osobní pozvánku pod přihlášeným účtem se stejným e-mailem, pro který byla vytvořena."
                : error}
            </p>
            {inviteToken && !unauthorized && (
              <>
                <div className="notice error" role="alert">
                  {error}
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
                  <Users size={16} />
                  Přijmout pozvánku
                </button>
              </>
            )}
            {unauthorized ? (
              <a
                className="button primary"
                href={`/signin-with-chatgpt?return_to=${encodeURIComponent(inviteToken ? "/?invite=" + inviteToken : "/")}`}
                target="_top"
              >
                Přihlásit přes ChatGPT <ArrowRight size={16} />
              </a>
            ) : (
              !inviteToken && (
                <button
                  className="button primary"
                  onClick={() => void load().catch(() => {})}
                >
                  Zkusit znovu
                </button>
              )
            )}
          </>
        ) : (
          <>
            <Loader2 className="spin" size={28} />
            <h1>Připravujeme váš přehled</h1>
            <p>Načítání smluv a uložených dokladů…</p>
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
          <span className="brand-icon">
            <Leaf size={27} />
          </span>
          <span>
            dotace<span className="brand-sub">SPORTOVNÍ FEDERACE JAVOR</span>
          </span>
        </a>
        <div className="workspace-label">PRACOVNÍ PROSTOR</div>
        <nav aria-label="Hlavní navigace">
          <button
            className={`nav-item ${view === "contracts" ? "active" : ""}`}
            onClick={() => goHome("contracts")}
          >
            <LayoutDashboard size={18} />
            Smlouvy a vyúčtování
            <span className="nav-count">{state.contracts.length}</span>
          </button>
          <button
            className={`nav-item ${view === "organizations" ? "active" : ""}`}
            onClick={() => goHome("organizations")}
          >
            <Building2 size={18} />
            Organizace a lidé
          </button>
          <button
            className={`nav-item ${view === "activity" ? "active" : ""}`}
            onClick={() => goHome("activity")}
          >
            <History size={18} />
            Historie činností
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon">
              <Sparkles size={19} />
            </span>
            <h3>Jistota při vyúčtování</h3>
            <p>Podklady, kontroly a vysvětlení na jednom místě.</p>
            <button onClick={() => setModal({ type: "adviser" })}>
              Otevřít rádce <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className="feedback-link"
            onClick={() => setModal({ type: "feedback" })}
          >
            <MessageSquare size={16} />
            Návrh na zlepšení
          </button>
          <div className="profile">
            <span className="avatar">
              {state.user.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{state.user.displayName}</strong>
              <small>
                {federation
                  ? "Administrátor SFJ"
                  : state.membership.role === "org_admin"
                    ? "Správce organizace"
                    : "Člen organizace"}
              </small>
            </span>
            <a
              aria-label="Odhlásit"
              title="Odhlásit"
              href="/signout-with-chatgpt?return_to=/"
              target="_top"
            >
              <LogOut size={16} />
            </a>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar no-print">
          <div className="breadcrumb">
            <Leaf size={15} />
            <span>Sportovní federace Javor</span>
            <ChevronRight size={14} />
            <strong>
              {contract
                ? contract.number
                : view === "contracts"
                  ? "Smlouvy a vyúčtování"
                  : view === "organizations"
                    ? "Organizace a lidé"
                    : "Historie"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="pilot">
              <span />
              Pilot · fiktivní data
            </span>
            {federation && (
              <label className="preview-switch">
                <input
                  type="checkbox"
                  checked={preview}
                  onChange={(e) => setPreview(e.target.checked)}
                />
                <Eye size={14} />
                Pohled organizace (náhled)
              </label>
            )}
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="notice error no-print" role="alert">
              <TriangleAlert size={18} />
              <div style={{ whiteSpace: "pre-line" }}>{error}</div>
              <button
                className="icon-button"
                aria-label="Zavřít upozornění"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {inviteToken && (
            <div className="notice warning no-print">
              <Users size={19} />
              <div>
                <strong>Pozvánka do organizace</strong>
                <p>
                  Po přijetí získáte oprávnění uvedená v pozvánce pro přihlášený
                  e-mail {state.user.email}.
                </p>
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
                Přijmout pozvánku
              </button>
              <button
                className="icon-button"
                aria-label="Skrýt pozvánku"
                onClick={() => setInviteToken("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {preview && (
            <div className="preview-notice no-print">
              <Eye size={14} />
              Náhled organizace pro administrátora SFJ. Přístupová práva ověřuje
              server.
            </div>
          )}
          {contract && organization ? (
            <>
              <button
                className="back-link no-print"
                onClick={() => goHome("contracts")}
              >
                <ArrowLeft size={15} />
                Všechny smlouvy
              </button>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {organization.name} <span> / {contract.year}</span>
                  </div>
                  <h1>
                    {contract.number}
                    <span className={`badge ${contract.status}`}>
                      {statusNames[contract.status]}
                    </span>
                  </h1>
                  <p>
                    {contract.program} <span className="dot-separator">·</span>{" "}
                    Vyúčtování dotace
                  </p>
                </div>
                <div className="heading-actions no-print">
                  <button
                    className="button secondary"
                    onClick={() => setModal({ type: "adviser" })}
                  >
                    <Sparkles size={16} />
                    Rádce
                  </button>
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
                      <SlidersHorizontal size={16} />
                      Upravit smlouvu
                    </button>
                  )}
                  {canSubmit && (
                    <button
                      className="button primary"
                      onClick={() => setModal({ type: "submit" })}
                    >
                      <Send size={16} />
                      Zkontrolovat a odeslat
                    </button>
                  )}
                  {reviewing && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => setModal({ type: "return" })}
                      >
                        <RotateCcw size={16} />
                        Vrátit k opravě
                      </button>
                      <button
                        className="button primary"
                        onClick={() => setModal({ type: "approve" })}
                      >
                        <ShieldCheck size={16} />
                        Uzavřít kontrolu
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="contract-metrics">
                <Metric
                  label="Přidělená dotace"
                  value={money(contract.amount)}
                  icon={<FileText size={18} />}
                />
                <Metric
                  label="Uplatněné náklady"
                  value={money(total(contractItems))}
                  hint={`${contractItems.filter((i) => !i.excluded).length} dokladů`}
                  icon={<FolderOpen size={18} />}
                />
                <Metric
                  label="Ke kontrole organizace"
                  value={String(
                    contractItems.filter(
                      (i) => !i.excluded && i.orgReview === "unchecked",
                    ).length,
                  )}
                  hint="dokladů"
                  icon={<CheckCheck size={18} />}
                />
                <Metric
                  label="Termín vyúčtování"
                  value={date(contract.deadline)}
                  hint={
                    contract.status === "approved"
                      ? "Kontrola uzavřena"
                      : "Dle nastavení smlouvy"
                  }
                  icon={<Clock3 size={18} />}
                />
              </div>
              <div
                className="tabs no-print"
                role="tablist"
                aria-label="Detail smlouvy"
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
                      setTab(key);
                      setQuery("");
                    }}
                  >
                    <Icon size={16} />
                    {label}
                    {key === "items" && <span>{contractItems.length}</span>}
                  </button>
                ))}
              </div>
              {tab === "items" && (
                <section className="panel ledger no-print">
                  <div className="panel-header">
                    <div>
                      <h2>Doklady k vyúčtování</h2>
                      <p>Nahrajte doklad, ověřte údaje a potvrďte kontrolu.</p>
                    </div>
                    <div className="row-actions">
                      <button className="button secondary" onClick={exportCsv}>
                        <Download size={15} />
                        CSV export
                      </button>
                      {editable && (
                        <button
                          className="button primary"
                          onClick={() => setModal({ type: "item" })}
                        >
                          <Plus size={17} />
                          Přidat doklad
                        </button>
                      )}
                    </div>
                  </div>
                  {contract.status === "changes" && (
                    <div className="inline-banner warning">
                      <TriangleAlert size={17} />
                      SFJ vrátila vyúčtování k doplnění. Podrobnosti najdete v
                      historii.
                    </div>
                  )}
                  {contract.status === "submitted" && orgMode && (
                    <div className="inline-banner">
                      <ShieldCheck size={17} />
                      Vyúčtování je odeslané. U vyžádaných doplnění můžete
                      přidat odpověď a přílohy.
                    </div>
                  )}
                  <div className="table-toolbar">
                    <div className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Hledat doklad"
                        placeholder="Číslo, dodavatel nebo popis dokladu"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filtr dokladů"
                      value={itemFilter}
                      onChange={(e) => setItemFilter(e.target.value)}
                    >
                      <option value="all">Všechny doklady</option>
                      <option value="unchecked">Nezkontrolované</option>
                      <option value="warnings">S upozorněním</option>
                      <option value="comments">S komentářem</option>
                      <option value="missing">Bez přílohy</option>
                      <option value="supplement">Vyžádané doplnění</option>
                      {itemFilter === "sample" && (
                        <option value="sample">Náhodný vzorek</option>
                      )}
                    </select>
                    {reviewing && (
                      <button
                        className="button text-button"
                        onClick={randomSample}
                      >
                        <Eye size={16} />
                        Namátková kontrola
                      </button>
                    )}
                  </div>
                  {reviewing && selected.length > 0 && (
                    <div className="selection-bar">
                      <span>{selected.length} označených dokladů</span>
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
                        <CheckCheck size={16} />
                        Hromadně akceptovat
                      </button>
                      <button
                        className="text-link"
                        onClick={() => setSelected([])}
                      >
                        Zrušit výběr
                      </button>
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
                                aria-label="Vybrat všechny viditelné doklady"
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
                          <th>Doklad / dodavatel</th>
                          <th>Skupina nákladů</th>
                          <th className="numeric">Uplatněno</th>
                          <th>Příloha</th>
                          <th>Organizace</th>
                          <th>Kontrola SFJ</th>
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
                                  aria-label={`Vybrat ${item.number}`}
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
                                {item.number || "Nový doklad"}
                                {contract &&
                                  findings(item, contract).length > 0 && (
                                    <TriangleAlert
                                      size={13}
                                      className="amber"
                                    />
                                  )}
                              </button>
                              <strong className="supplier-name">
                                {item.supplier}
                              </strong>
                              <p className="full-description">
                                {item.description}
                              </p>
                              {item.excluded && (
                                <span className="small-muted">
                                  Vyřazeno z vyúčtování
                                </span>
                              )}
                            </td>
                            <td>
                              <span className="category-label">
                                {categoryLabels[item.category]}
                              </span>
                              <small className="small-muted">
                                {date(item.date)} ·{" "}
                                {item.payment === "bank" ? "Banka" : "Hotovost"}
                              </small>
                            </td>
                            <td className="numeric">
                              <strong>{money(item.claimed)}</strong>
                              {item.claimed !== item.amount && (
                                <small className="small-muted">
                                  z {money(item.amount)}
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
                                <span className="missing-file">Chybí</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-dot org-${item.orgReview}`}
                              />
                              <span className="status-text">
                                {orgNames[item.orgReview]}
                              </span>
                            </td>
                            <td>
                              <span className={`badge sfj-${item.sfjDecision}`}>
                                {sfjNames[item.sfjDecision]}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Otevřít doklad ${item.number}`}
                                onClick={() => setModal({ type: "item", item })}
                              >
                                <ChevronRight size={17} />
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
                          contractItems.length
                            ? "Žádný doklad neodpovídá filtru"
                            : "Začněte prvním dokladem"
                        }
                        text={
                          contractItems.length
                            ? "Změňte hledání nebo nastavený filtr."
                            : "Nahrajte PDF nebo fotografii účtenky a doplňte údaje."
                        }
                        action={
                          editable ? (
                            <button
                              className="button primary"
                              onClick={() => setModal({ type: "item" })}
                            >
                              <Plus size={16} />
                              Přidat doklad
                            </button>
                          ) : undefined
                        }
                      />
                    )}
                  </div>
                  <div className="table-footer">
                    <span>
                      {filteredItems.length} z {contractItems.length} dokladů
                    </span>
                    <strong>
                      Celkem uplatněno {money(total(contractItems))}
                    </strong>
                  </div>
                </section>
              )}
              {tab === "conditions" && (
                <Conditions
                  contract={contract}
                  organization={organization}
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
                  <div className="eyebrow">PŘEHLED DOTACÍ</div>
                  <h1>Smlouvy a vyúčtování</h1>
                  <p>
                    Všechny podklady. Přehledná kontrola. Včasné vyúčtování.
                  </p>
                </div>
                <div className="heading-actions">
                  <span className="today-label">
                    {new Intl.DateTimeFormat("cs-CZ", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())}
                  </span>
                  {federation && !preview && (
                    <button
                      className="button primary"
                      onClick={() => {
                        goHome("organizations");
                        setModal({ type: "organization" });
                      }}
                    >
                      <Plus size={17} />
                      Přidat organizaci
                    </button>
                  )}
                </div>
              </div>
              <div className="overview-metrics">
                <Metric
                  label="Objem přidělených dotací"
                  value={money(
                    state.contracts.reduce(
                      (s, c) => s + Math.round(c.amount * 100),
                      0,
                    ) / 100,
                  )}
                  hint={`${state.contracts.length} smluv v evidenci`}
                  icon={<FileText size={19} />}
                />
                <Metric
                  label="Čeká na kontrolu SFJ"
                  value={String(
                    state.contracts.filter((c) => c.status === "submitted")
                      .length,
                  )}
                  hint="odeslaných vyúčtování"
                  icon={<Clock3 size={19} />}
                />
                <Metric
                  label="Úspěšně uzavřeno"
                  value={String(
                    state.contracts.filter((c) => c.status === "approved")
                      .length,
                  )}
                  hint="schválených vyúčtování"
                  icon={<ShieldCheck size={19} />}
                />
              </div>
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>
                      Přehled smluv{" "}
                      <span className="count-pill">
                        {state.contracts.length}
                      </span>
                    </h2>
                    <p>Otevřete smlouvu a pokračujte ve vyúčtování.</p>
                  </div>
                  <span className="live-label">
                    <span />
                    Průběžně ukládáno
                  </span>
                </div>
                <div className="table-toolbar">
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Hledat smlouvu"
                      placeholder="Hledat organizaci nebo smlouvu…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Rok smlouvy"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  >
                    <option value="">Všechny roky</option>
                    {[...new Set(state.contracts.map((c) => c.year))]
                      .sort()
                      .reverse()
                      .map((y) => (
                        <option key={y}>{y}</option>
                      ))}
                  </select>
                  <select
                    aria-label="Program dotace"
                    value={program}
                    onChange={(e) => setProgram(e.target.value)}
                  >
                    <option value="">Všechny programy</option>
                    {programs.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Organizace"
                    value={orgFilter}
                    onChange={(e) => setOrgFilter(e.target.value)}
                  >
                    <option value="">Všechny organizace</option>
                    {state.organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table className="contract-table">
                    <thead>
                      <tr>
                        <th>Organizace a smlouva</th>
                        <th>Program</th>
                        <th className="numeric">Přidělená dotace</th>
                        <th>Vyúčtování</th>
                        <th>Termín</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContracts.map((c) => {
                        const org = state.organizations.find(
                          (o) => o.id === c.organizationId,
                        );
                        return (
                          <tr key={c.id} onClick={() => openContract(c.id)}>
                            <td>
                              <button
                                className="organization-link"
                                onClick={() => openContract(c.id)}
                              >
                                <span className="organization-avatar">
                                  {org?.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((x) => x[0])
                                    .join("")}
                                </span>
                                <span>
                                  <strong>{org?.name}</strong>
                                  <small>
                                    {c.number} <span>· {c.year}</span>
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="program-tag">{c.program}</span>
                            </td>
                            <td className="numeric">
                              <strong>{money(c.amount)}</strong>
                            </td>
                            <td>
                              <span className={`badge ${c.status}`}>
                                {c.status === "approved" ? (
                                  <Check size={12} />
                                ) : c.status === "submitted" ? (
                                  <Clock3 size={12} />
                                ) : null}
                                {statusNames[c.status]}
                              </span>
                            </td>
                            <td className="nowrap">{date(c.deadline)}</td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`Otevřít smlouvu ${c.number}`}
                                onClick={() => openContract(c.id)}
                              >
                                <ArrowUpRight size={18} />
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
                      title="Žádné smlouvy"
                      text={
                        state.contracts.length
                          ? "Upravte hledání nebo filtry."
                          : "Založte organizaci a přidejte k ní první smlouvu."
                      }
                    />
                  )}
                </div>
                <div className="table-footer">
                  <span>
                    {filteredContracts.length} z {state.contracts.length} smluv
                  </span>
                  <span>Každá smlouva má samostatné vyúčtování.</span>
                </div>
              </section>
              <div className="bottom-note">
                <ShieldCheck size={17} />
                <span>
                  Originály dokladů i průběh kontroly zůstávají uložené u
                  příslušné smlouvy.
                </span>
              </div>
            </>
          ) : view === "organizations" ? (
            organization ? (
              <>
                <button
                  className="back-link"
                  onClick={() => setOrganizationId("")}
                >
                  <ArrowLeft size={15} />
                  Všechny organizace
                </button>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">PROFIL ORGANIZACE</div>
                    <h1>{organization.name}</h1>
                    <p>
                      IČO {organization.ico} · {organization.address}
                    </p>
                  </div>
                  <div className="heading-actions">
                    {federation && !preview && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({ type: "organization", organization })
                        }
                      >
                        Upravit profil
                      </button>
                    )}
                    {(federation || state.membership.role === "org_admin") && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({
                            type: "invite",
                            organizationId: organization.id,
                          })
                        }
                      >
                        <Users size={16} />
                        Pozvat člena
                      </button>
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
                        <Plus size={17} />
                        Založit smlouvu
                      </button>
                    )}
                  </div>
                </div>
                <div className="organization-detail-grid">
                  <section className="panel padded">
                    <h2>Kontaktní údaje</h2>
                    <dl className="detail-list">
                      <dt>E-mail</dt>
                      <dd>{organization.email || "—"}</dd>
                      <dt>Telefon</dt>
                      <dd>{organization.phone || "—"}</dd>
                      <dt>Bankovní účet</dt>
                      <dd>{organization.bank || "—"}</dd>
                      <dt>Statutární zástupci</dt>
                      <dd>{organization.representatives.join(", ") || "—"}</dd>
                    </dl>
                  </section>
                  <section className="panel padded">
                    <h2>Lidé a oprávnění</h2>
                    {state.members
                      .filter((m) => m.organizationId === organization.id)
                      .map((m) => (
                        <div className="member-row" key={m.id}>
                          <span className="avatar light">
                            {m.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span>
                            <strong>{m.name}</strong>
                            <small>{m.email}</small>
                          </span>
                          <span className="badge neutral">
                            {m.role === "org_admin" ? "Správce" : "Člen"}
                          </span>
                        </div>
                      ))}
                    {!state.members.some(
                      (m) => m.organizationId === organization.id,
                    ) && (
                      <p className="muted">
                        Zatím žádný člen. Pozvěte správce organizace.
                      </p>
                    )}
                  </section>
                </div>
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>Smlouvy organizace</h2>
                      <p>Nová smlouva se zakládá přímo v tomto profilu.</p>
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
                          <strong>{c.number}</strong>
                          <small>
                            {c.program} · {c.year}
                          </small>
                        </span>
                        <strong>{money(c.amount)}</strong>
                        <span className={`badge ${c.status}`}>
                          {statusNames[c.status]}
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  {!state.contracts.some(
                    (c) => c.organizationId === organization.id,
                  ) && (
                    <Empty
                      title="Zatím bez smlouvy"
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
                    <div className="eyebrow">SPOLUPRÁCE</div>
                    <h1>Organizace a lidé</h1>
                    <p>Profily příjemců, jejich smlouvy a přístupy členů.</p>
                  </div>
                  {federation && !preview && (
                    <button
                      className="button primary"
                      onClick={() => setModal({ type: "organization" })}
                    >
                      <Plus size={17} />
                      Přidat organizaci
                    </button>
                  )}
                </div>
                <div className="organization-grid">
                  {state.organizations.map((o) => (
                    <button
                      key={o.id}
                      className="organization-card panel"
                      onClick={() => setOrganizationId(o.id)}
                    >
                      <div className="organization-card-top">
                        <span className="organization-avatar large">
                          <Building2 size={25} />
                        </span>
                        <ArrowUpRight size={18} />
                      </div>
                      <h2>{o.name}</h2>
                      <p>IČO {o.ico}</p>
                      <p>{o.address}</p>
                      <div className="organization-card-bottom">
                        <span>
                          {
                            state.contracts.filter(
                              (c) => c.organizationId === o.id,
                            ).length
                          }{" "}
                          smluv
                        </span>
                        <span>
                          Zobrazit profil <ArrowRight size={14} />
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
                  <div className="eyebrow">AUDITNÍ STOPA</div>
                  <h1>Historie činností</h1>
                  <p>Kdo, kdy a co změnil. Záznamy se uchovávají na serveru.</p>
                </div>
              </div>
              <Audit events={state.audit} />
            </>
          )}
          <footer className="page-footer no-print">
            <span>Dotace / SFJ</span>
            <span>
              Pilotní aplikace s fiktivními údaji · Podmínky vždy ověřte ve své
              smlouvě
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast no-print" role="status">
          <CircleCheck size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Zavřít oznámení"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="saving no-print" role="status">
          <Loader2 className="spin" size={15} />
          Ukládání…
        </div>
      )}
      {modal && (
        <ModalShell
          title={
            modal.type === "organization"
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
                      ? "Uzavřít kontrolu SFJ"
                      : modal.type === "return"
                        ? "Vrátit vyúčtování"
                        : modal.type === "invite"
                          ? "Pozvat člena organizace"
                          : modal.type === "adviser"
                            ? "Rádce k vyúčtování"
                            : "Návrh na zlepšení"
          }
          wide={modal.type === "item" || modal.type === "adviser"}
          onClose={closeModal}
        >
          {modal.type === "organization" && (
            <OrganizationForm
              organization={modal.organization}
              busy={busy}
              onSave={(o) =>
                mutate("saveOrganization", { organization: o }).then(() =>
                  setModal(null),
                )
              }
            />
          )}
          {modal.type === "contract" && (
            <ContractForm
              organizationId={modal.organizationId}
              contract={modal.contract}
              busy={busy}
              onSave={(c) =>
                mutate("saveContract", { contract: c }).then(() =>
                  setModal(null),
                )
              }
            />
          )}
          {modal.type === "item" && contract && (
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
                ).then(() => setModal(null))
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
                ).then(() => setModal(null))
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

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
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
  return (
    <div className="empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function ModalShell({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
  }, [onClose]);
  return (
    <div
      className="modal-backdrop no-print"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            aria-label="Zavřít dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
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
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function FormError({ error }: { error: string }) {
  return error ? (
    <div
      className="notice error"
      role="alert"
      style={{ whiteSpace: "pre-line" }}
    >
      <TriangleAlert size={17} />
      {error}
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
  const change = (key: keyof Organization, value: unknown) =>
    setO({ ...o, [key]: value });
  return (
    <form
      className="form-body"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        void onSave({
          ...o,
          representatives: o.representatives.filter((x) => x.trim()),
        }).catch((x) => setError(x.message));
      }}
    >
      <p className="form-intro">
        Základní údaje příjemce dotace. Organizace může mít dva statutární
        zástupce.
      </p>
      <FormError error={error} />
      <div className="organization-onboarding">
        <label className="button secondary upload-button">
          <Upload size={15} />
          Předvyplnit z podepsané smlouvy
          <input
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
            onExtract={(fields) => {
              const allowed = [
                "name",
                "ico",
                "address",
                "email",
                "phone",
                "bank",
                "representatives",
              ];
              setO((old) => ({
                ...old,
                ...Object.fromEntries(
                  Object.entries(fields).filter(([key]) =>
                    allowed.includes(key),
                  ),
                ),
              }));
              setSource("Návrh z dokumentu · ověřte podle originálu");
            }}
          />
        )}
        {source && (
          <p className="onboarding-source">
            <CircleCheck size={13} />
            {source}
          </p>
        )}
      </div>
      <Field label="Název organizace">
        <input
          required
          value={o.name}
          onChange={(e) => change("name", e.target.value)}
          placeholder="Sportovní klub Javor, z. s."
        />
      </Field>
      <div className="form-grid">
        <Field label="IČO">
          <div className="registry-input">
            <input
              required
              pattern="[0-9]{8}"
              title="IČO má osm číslic"
              value={o.ico}
              onChange={(e) => change("ico", e.target.value)}
              placeholder="12345678"
            />
            <button
              type="button"
              className="registry-button"
              disabled={lookingUp || busy || !/^[0-9]{8}$/.test(o.ico)}
              onClick={() => void registry()}
            >
              {lookingUp ? (
                <Loader2 className="spin" size={13} />
              ) : (
                <Search size={13} />
              )}
              ARES
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
      <div className="inline-banner">
        <ShieldCheck size={16} />
        Údaje ověřte podle podepsané smlouvy. Zdrojové dokumenty připojíte ke
        smlouvě v profilu organizace.
      </div>
      <div className="form-footer">
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
          Uložit organizaci
        </button>
      </div>
    </form>
  );
}
function ContractForm({
  contract,
  organizationId,
  busy,
  onSave,
}: {
  contract?: Contract;
  organizationId: string;
  busy: boolean;
  onSave: (c: Partial<Contract>) => Promise<unknown>;
}) {
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
      <div className="form-grid">
        <Field label="Číslo smlouvy">
          <input
            required
            value={c.number}
            onChange={(e) => change("number", e.target.value)}
            placeholder="SFJ/2026/001"
          />
        </Field>
        <Field label="Program">
          <select
            value={c.program}
            onChange={(e) => change("program", e.target.value)}
          >
            {programs.map((p) => (
              <option key={p}>{p}</option>
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
      </div>
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
        <span>
          Podklady 2025 vyžadují bezhotovostní úhrady; pozdější domluva
          připouští hotovost. Nastavená hranice je kontrolní upozornění, ne
          potvrzení způsobilosti.
        </span>
      </div>
      <div className="form-footer">
        <button className="button primary" type="submit" disabled={busy}>
          <Check size={16} />
          Uložit smlouvu
        </button>
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
  onDecision: (d: Item["sfjDecision"], reason: string) => Promise<unknown>;
  onReply: (text: string, fileIds: string[]) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Item>({
    ...item,
    fileIds: [...item.fileIds],
  });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newFiles, setNewFiles] = useState<StoredFile[]>([]);
  const [selectedFile, setSelectedFile] = useState(item.fileIds[0] || "");
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [readingSource, setReadingSource] = useState(false);
  const sourceId = useRef(selectedFile);
  sourceId.current = selectedFile;
  const [decision, setDecision] = useState<Item["sfjDecision"]>(
    item.sfjDecision === "pending" ? "accepted" : item.sfjDecision,
  );
  const [reason, setReason] = useState(item.sfjReason);
  const [reply, setReply] = useState("");
  const change = (key: keyof Item, value: unknown) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const allFiles = [
    ...state.files,
    ...newFiles.filter((f) => !state.files.some((s) => s.id === f.id)),
  ];
  const file = allFiles.find((f) => f.id === selectedFile);
  const issues = findings(draft, contract);
  const needsComment = issues.some((i) => i.severity === "warning");
  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    setUploading(true);
    setError("");
    try {
      const added: StoredFile[] = [];
      for (const f of selectedFiles) {
        const uploaded = await upload(f);
        added.push(uploaded);
      }
      setNewFiles((old) => [...old, ...added]);
      setDraft((old) => ({
        ...old,
        fileIds: [...old.fileIds, ...added.map((f) => f.id)],
      }));
      setSelectedFile(added[0].id);
      if (editable) setExtractFile(selectedFiles[0]);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const readStoredFile = async () => {
    if (!file) return;
    const source = file;
    setReadingSource(true);
    setError("");
    try {
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(source.id)}`,
        { credentials: "same-origin" },
      );
      if (!response.ok)
        throw new Error(
          "Přílohu se nepodařilo načíst. Zkuste ji otevřít znovu.",
        );
      const blob = await response.blob();
      if (sourceId.current === source.id)
        setExtractFile(new File([blob], source.name, { type: source.type }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Přílohu se nepodařilo načíst.",
      );
    } finally {
      setReadingSource(false);
    }
  };
  const applyExtraction = (fields: Record<string, unknown>) => {
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
      "recipientName",
    ];
    const patch = Object.fromEntries(
      Object.entries(fields).filter(
        ([k, v]) => allowed.includes(k) && v !== undefined && v !== null,
      ),
    );
    setDraft((old) => ({ ...old, ...patch, orgReview: "unchecked" }));
  };
  return (
    <div className="item-editor">
      <div className="item-document">
        <div className="document-bar">
          <span>
            <Paperclip size={15} />
            Originál dokladu
          </span>
          {file && (
            <a
              className="text-link"
              href={`/api/files?id=${encodeURIComponent(file.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              Otevřít <ArrowUpRight size={14} />
            </a>
          )}
        </div>
        {draft.fileIds.length > 0 && (
          <select
            className="file-select"
            aria-label="Zobrazit přílohu"
            value={selectedFile}
            onChange={(e) => {
              setSelectedFile(e.target.value);
              setExtractFile(null);
            }}
          >
            {draft.fileIds.map((id) => (
              <option key={id} value={id}>
                {allFiles.find((f) => f.id === id)?.name || id}
              </option>
            ))}
          </select>
        )}
        {file ? (
          <div className="file-preview">
            {file.type.startsWith("image/") ? (
              <img
                src={`/api/files?id=${encodeURIComponent(file.id)}`}
                alt={`Příloha ${file.name}`}
              />
            ) : (
              <DocumentPreview file={file} />
            )}
            <div className="file-meta">
              <FileText size={14} />
              <span>{file.name}</span>
              <span>{Math.ceil(file.size / 1024)} kB</span>
            </div>
          </div>
        ) : (
          <div className="empty-file">
            <FileText size={43} />
            <h3>Připojte originál dokladu</h3>
            <p>
              PDF, JPG, PNG nebo WebP
              <br />
              Maximálně 10 MB na soubor
            </p>
          </div>
        )}
        {(editable ||
          (item.sfjDecision === "supplement" &&
            state.membership.role !== "federation")) && (
          <label className={`upload-zone ${uploading ? "disabled" : ""}`}>
            <Upload size={22} />
            <strong>
              {uploading ? "Ukládání souboru…" : "Nahrát PDF nebo fotografii"}
            </strong>
            <span>Vyberte soubor · lze přiložit více příloh</span>
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
        {file && editable && !extractFile && (
          <button
            type="button"
            className="button secondary read-stored-file"
            disabled={readingSource || uploading || busy}
            onClick={() => void readStoredFile()}
          >
            {readingSource ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <FileText size={15} />
            )}{" "}
            {readingSource ? "Načítání přílohy…" : "Přečíst stávající přílohu"}
          </button>
        )}
        {extractFile && editable && (
          <div className="extraction-wrap">
            <Extraction file={extractFile} onExtract={applyExtraction} />
          </div>
        )}
        {draft.fileIds.length > 0 && editable && (
          <div className="attached-list">
            {draft.fileIds.map((id) => (
              <div key={id}>
                <Paperclip size={13} />
                <span>{allFiles.find((f) => f.id === id)?.name || id}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Odpojit přílohu z dokladu"
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
      <div className="item-fields">
        <FormError error={error} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            void onSave(draft).catch((x) => setError(x.message));
          }}
        >
          <div className="item-section-title">
            <span className="step-circle">1</span>
            <div>
              <h3>Údaje dokladu</h3>
              <p>Ověřte údaje podle přiloženého originálu.</p>
            </div>
          </div>
          <fieldset disabled={!editable || busy}>
            <div className="form-grid">
              <Field label="Číslo dokladu">
                <input
                  required
                  value={draft.number}
                  onChange={(e) => change("number", e.target.value)}
                  placeholder="FA-2026-001"
                />
              </Field>
              <Field label="Datum úhrady">
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(e) => change("date", e.target.value)}
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
            <Field label="Popis nákladu">
              <textarea
                required
                rows={2}
                value={draft.description}
                onChange={(e) => change("description", e.target.value)}
                placeholder="K čemu byl výdaj použit?"
              />
            </Field>
            <Field label="Skupina nákladů">
              <select
                value={draft.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {Object.entries(categoryLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
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
                    setDraft((old) => ({
                      ...old,
                      amount,
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
                  <option value="bank">Banka</option>
                  <option value="cash">Hotovost</option>
                </select>
              </Field>
              <Field label="Doklad vystaven na">
                <select
                  value={draft.recipientType}
                  onChange={(e) => change("recipientType", e.target.value)}
                >
                  <option value="organization">Na naši organizaci</option>
                  <option value="person">Na osobu</option>
                  <option value="none">Bez uvedení odběratele</option>
                  <option value="other">Na jinou firmu</option>
                </select>
              </Field>
            </div>
            {draft.recipientType !== "none" && (
              <Field label="Název / jméno odběratele">
                <input
                  value={draft.recipientName}
                  onChange={(e) => change("recipientName", e.target.value)}
                />
              </Field>
            )}
          </fieldset>
          <div className="item-section-title">
            <span className="step-circle">2</span>
            <div>
              <h3>Kontrola organizace</h3>
              <p>Vysvětlení zůstává součástí vyúčtování.</p>
            </div>
          </div>
          {issues.length > 0 ? (
            <div className="finding-list">
              {issues.map((f) => (
                <div className={`finding ${f.severity}`} key={f.code}>
                  <TriangleAlert size={15} />
                  <span>{f.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="finding success">
              <CircleCheck size={16} />
              <span>
                {draft.excluded
                  ? "Položka je vyřazená; částka se nezapočítává."
                  : "Základní formální kontrola bez upozornění. Způsobilost ověřte podle smlouvy."}
              </span>
            </div>
          )}
          <fieldset disabled={!editable || busy}>
            <Field
              label={
                needsComment
                  ? "Vysvětlení upozornění (povinné pro kontrolu)"
                  : "Komentář organizace"
              }
            >
              <textarea
                rows={3}
                value={draft.comment}
                onChange={(e) => change("comment", e.target.value)}
                placeholder="Uveďte souvislost, důvod částečného uplatnění nebo jiné vysvětlení."
              />
            </Field>
            <Field label="Stav kontroly organizace">
              <select
                value={draft.orgReview}
                onChange={(e) => change("orgReview", e.target.value)}
              >
                <option value="unchecked">Nezkontrolováno</option>
                <option value="checked">Zkontrolováno</option>
                <option value="commented">Zkontrolováno s komentářem</option>
              </select>
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.excluded}
                onChange={(e) => change("excluded", e.target.checked)}
              />
              <span>
                Vyřadit z vyúčtování{" "}
                <small>Doklad zůstane v evidenci, částka se nezapočítá.</small>
              </span>
            </label>
          </fieldset>
          {editable && (
            <div className="form-footer">
              <button
                className="button primary"
                type="submit"
                disabled={busy || uploading}
              >
                <Check size={16} />
                Uložit doklad
              </button>
            </div>
          )}
        </form>
        {!!item.id && (
          <>
            <div className="item-section-title">
              <span className="step-circle">3</span>
              <div>
                <h3>Posouzení SFJ</h3>
                <p>
                  <span className={`badge sfj-${item.sfjDecision}`}>
                    {sfjNames[item.sfjDecision]}
                  </span>
                </p>
              </div>
            </div>
            {item.sfjReason && (
              <div className="review-reason">
                <strong>Vyjádření SFJ</strong>
                <p>{item.sfjReason}</p>
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
                    <option value="accepted">Akceptováno</option>
                    <option value="rejected">Neuznáno</option>
                    <option value="supplement">Vyžádáno doplnění</option>
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
                  <ShieldCheck size={16} />
                  Uložit rozhodnutí
                </button>
              </form>
            )}
            {item.sfjDecision === "supplement" &&
              !reviewing &&
              state.membership.role === "federation" && (
                <div className="inline-banner">
                  <Users size={16} />
                  Odpověď na dožádání vkládá přihlášený člen organizace.
                </div>
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
                      placeholder="Odpovězte na požadované doplnění. Přílohu můžete přidat vlevo."
                    />
                  </Field>
                  <button
                    className="button primary"
                    disabled={busy || uploading}
                  >
                    <Send size={16} />
                    Odeslat doplnění
                  </button>
                </form>
              )}
            {state.audit.some((a) => a.itemId === item.id) && (
              <details className="item-history">
                <summary>Historie dokladu</summary>
                {state.audit
                  .filter((a) => a.itemId === item.id)
                  .map((a) => (
                    <div key={a.id}>
                      <small>
                        {date(a.at)} · {a.actor}
                      </small>
                      <strong>{actionLabel(a.action)}</strong>
                      <p>{a.detail}</p>
                    </div>
                  ))}
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Conditions({
  contract,
  organization,
  state,
  canUpload,
  upload,
  setToast,
  setError,
}: {
  contract: Contract;
  organization: Organization;
  state: AppState;
  canUpload: boolean;
  upload: (f: File, c: Contract, k: StoredFile["kind"]) => Promise<StoredFile>;
  setToast: (s: string) => void;
  setError: (s: string) => void;
}) {
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
            <h2>Podmínky smlouvy</h2>
            <p>
              Platí pro {contract.number} · {organization.name}
            </p>
          </div>
        </div>
        <dl className="detail-list">
          <dt>Program</dt>
          <dd>{contract.program}</dd>
          <dt>Období úhrad</dt>
          <dd>
            {date(contract.validFrom)} – {date(contract.validTo)}
          </dd>
          <dt>Termín vyúčtování</dt>
          <dd>{date(contract.deadline)}</dd>
          <dt>Dotace</dt>
          <dd>{money(contract.amount)}</dd>
          <dt>Kontrolní hranice hotovosti</dt>
          <dd>
            {contract.cashLimit === null
              ? "Nepotvrzená"
              : money(contract.cashLimit)}
          </dd>
        </dl>
        <div className="conditions-text">
          {contract.conditions ||
            "Konkrétní podmínky dosud nebyly doplněné. Vycházejte z podepsané smlouvy a přiložených pokynů."}
        </div>
        <div className="notice warning">
          <TriangleAlert size={17} />
          <div>
            <strong>Hotovost vyžaduje ověření</strong>
            <p>
              Podklady 2025 vyžadují bezhotovostní úhradu. Pozdější domluva
              připouští drobné hotovostní výdaje; konečné pravidlo musí potvrdit
              SFJ.
            </p>
          </div>
        </div>
      </section>
      <section className="panel padded">
        <h2>Dokumenty a zdroje pravidel</h2>
        <p className="muted">
          Vždy pracujte s konkrétní podepsanou smlouvou a platnými pokyny.
        </p>
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
                <strong>{names[f.kind]}</strong>
                <small>
                  {f.name} · {date(f.createdAt)}
                </small>
              </span>
              <ArrowUpRight size={17} />
            </a>
          ))}
        </div>
        {!files.length && (
          <div className="inline-banner">
            <FileText size={17} />
            Ke smlouvě zatím nejsou přiložené zdrojové dokumenty.
          </div>
        )}
        {canUpload && (
          <div className="source-upload">
            <label className="field">
              <span>Druh dokumentu</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as StoredFile["kind"])}
              >
                <option value="contract">Podepsaná smlouva</option>
                <option value="instructions">Pokyny SFJ</option>
                <option value="decision">Rozhodnutí ASP</option>
                <option value="amendment">Dodatek</option>
              </select>
            </label>
            <label className="button secondary upload-button">
              <Upload size={16} />
              {uploading ? "Ukládání…" : "Přiložit PDF nebo fotografii"}
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
        <div className="reference-sources">
          <h3>Podklady dodané v zadání</h3>
          <p>
            Adaptované výňatky z roku 2025. Nejsou aktuálními právními pokyny
            ani náhradou smlouvy.
          </p>
          {["organizace", "talent", "reprezentace"].map((s) => (
            <a
              href={`/reference/prehled-nakladu-${s}-2025.txt`}
              key={s}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={14} />
              Přehled nákladů · {s}
              <ArrowUpRight size={13} />
            </a>
          ))}
        </div>
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
  const rejected =
    items
      .filter((i) => !i.excluded && i.sfjDecision === "rejected")
      .reduce((s, i) => s + Math.round(i.claimed * 100), 0) / 100;
  return (
    <div className="summary-stack">
      <div className="summary-toolbar no-print">
        <div>
          <h2>Souhrn vyúčtování</h2>
          <p>Podklad pro předání, archivaci a tisk do PDF.</p>
        </div>
        <div className="row-actions">
          <button className="button secondary" onClick={exportCsv}>
            <Download size={16} />
            CSV export
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Printer size={16} />
            Tisk / uložit PDF
          </button>
        </div>
      </div>
      <section className="report panel">
        <div className="report-header">
          <div className="report-brand">
            <Leaf size={24} />
            <span>SFJ / Dotace</span>
          </div>
          <span className={`badge ${contract.status}`}>
            {statusNames[contract.status]}
          </span>
        </div>
        <div className="report-title">
          <div className="eyebrow">VYÚČTOVÁNÍ DOTACE</div>
          <h2>{organization.name}</h2>
          <p>
            Smlouva {contract.number} · {contract.program} · {contract.year}
          </p>
          <p className="small-muted">
            IČO {organization.ico} · {organization.address}
          </p>
        </div>
        <div className="report-totals">
          <div>
            <span>Přidělená dotace</span>
            <strong>{money(contract.amount)}</strong>
          </div>
          <div>
            <span>Uplatněné náklady</span>
            <strong>{money(total(items))}</strong>
          </div>
          <div>
            <span>Krácení dotace</span>
            <strong>{money(contract.reduction)}</strong>
          </div>
          <div>
            <span>Dotace po krácení</span>
            <strong>
              {money(Math.max(0, contract.amount - contract.reduction))}
            </strong>
          </div>
        </div>
        <h3>Souhrn podle skupin nákladů</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>Skupina nákladů</th>
              <th className="numeric">Dokladů</th>
              <th className="numeric">Uplatněno</th>
              <th className="numeric">Akceptováno</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(categoryLabels) as Category[]).map((category) => {
              const list = items.filter(
                (i) => i.category === category && !i.excluded,
              );
              return (
                <tr key={category}>
                  <td>{categoryLabels[category]}</td>
                  <td className="numeric">{list.length}</td>
                  <td className="numeric">{money(total(list))}</td>
                  <td className="numeric">
                    {money(
                      total(list.filter((i) => i.sfjDecision === "accepted")),
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="total-row">
              <td>Celkem</td>
              <td className="numeric">
                {items.filter((i) => !i.excluded).length}
              </td>
              <td className="numeric">{money(total(items))}</td>
              <td className="numeric">
                {money(
                  total(items.filter((i) => i.sfjDecision === "accepted")),
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Položky vyúčtování</h3>
        <div className="table-scroll">
          <table className="report-table small">
            <thead>
              <tr>
                <th>Doklad / popis</th>
                <th>Skupina</th>
                <th>Úhrada</th>
                <th className="numeric">Uplatněno</th>
                <th>SFJ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={i.excluded ? "excluded" : ""}>
                  <td>
                    <strong>
                      {i.number} · {i.supplier}
                    </strong>
                    <p>{i.description}</p>
                    {i.comment && <small>Komentář: {i.comment}</small>}
                    {i.sfjReason && <small>SFJ: {i.sfjReason}</small>}
                    {i.excluded && <small>Vyřazeno z vyúčtování</small>}
                  </td>
                  <td>{categoryLabels[i.category]}</td>
                  <td>
                    {date(i.date)}
                    <small>{i.payment === "bank" ? "Banka" : "Hotovost"}</small>
                  </td>
                  <td className="numeric">{money(i.claimed)}</td>
                  <td>{i.excluded ? "Vyřazeno" : sfjNames[i.sfjDecision]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="report-declaration">
          <h3>Prohlášení příjemce</h3>
          <p>{declaration}</p>
          <small>
            {contract.declaredAt
              ? `Potvrzeno: ${contract.declaredBy} · ${new Date(contract.declaredAt).toLocaleString("cs-CZ")}`
              : "Vyúčtování dosud nebylo odeslané a prohlášení nebylo potvrzené."}
          </small>
        </div>
        <div className="report-conclusion">
          <h3>Závěr kontroly SFJ</h3>
          <p>{contract.conclusion || "Kontrola dosud nebyla uzavřená."}</p>
          <div>
            Neuznané položky: <strong>{money(rejected)}</strong>{" "}
            <span className="dot-separator">·</span> Krácení dotace:{" "}
            <strong>{money(contract.reduction)}</strong>
          </div>
        </div>
        <div className="report-foot">
          <span>Fiktivní pilotní data · SFJ provádí formální kontrolu.</span>
          <span>
            Vytvořeno {date(today())} ·{" "}
            {state.files.filter((f) => f.contractId === contract.id).length}{" "}
            příloh
          </span>
        </div>
      </section>
    </div>
  );
}
function Audit({ events }: { events: AuditEvent[] }) {
  return (
    <section className="panel padded audit-panel">
      <h2>Průběh a uložené změny</h2>
      {events.length ? (
        <div className="timeline">
          {events.map((a) => (
            <article key={a.id}>
              <span className="timeline-dot" />
              <div>
                <div className="timeline-top">
                  <strong>{actionLabel(a.action)}</strong>
                  <time>{new Date(a.at).toLocaleString("cs-CZ")}</time>
                </div>
                <p>{a.detail}</p>
                <small>{a.actor}</small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<History size={27} />}
          title="Zatím bez změn"
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
      <p className="form-intro">
        Odesláním předáte vyúčtování do kontroly SFJ. Úpravy dokladů budou
        uzamčené, dokud SFJ vyúčtování nevrátí.
      </p>
      <FormError error={error} />
      {errors.length ? (
        <div className="submission-errors">
          <h3>Ještě je potřeba doplnit</h3>
          <ul>
            {errors.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="notice success">
          <CircleCheck size={19} />
          <span>
            Formální kontrola je připravená.{" "}
            {items.filter((i) => !i.excluded).length} dokladů ·{" "}
            {money(total(items))}
          </span>
        </div>
      )}
      <label className="checkbox-label declaration">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>{declaration}</span>
      </label>
      <div className="form-footer">
        <button
          className="button primary"
          disabled={busy || !confirmed || errors.length > 0}
        >
          <Send size={16} />
          Odeslat vyúčtování SFJ
        </button>
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
  const rejected = total(items.filter((i) => i.sfjDecision === "rejected"));
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
      {pending.length > 0 && (
        <div className="notice warning">
          <TriangleAlert size={18} />
          <span>
            {pending.length} dokladů ještě nemá konečné rozhodnutí. Před
            uzavřením je posuďte.
          </span>
        </div>
      )}
      <div className="approval-summary">
        <span>Neuznané položky</span>
        <strong>{money(rejected)}</strong>
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
          rows={5}
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          placeholder="Uveďte závěr formální kontroly a případné odůvodnění krácení."
        />
      </Field>
      <div className="form-footer">
        <button
          className="button primary"
          disabled={busy || pending.length > 0}
        >
          <ShieldCheck size={16} />
          Schválit a uzavřít vyúčtování
        </button>
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
          {button}
        </button>
      </div>
    </form>
  );
}
function InviteForm({
  organizationId,
  federation,
  busy,
  onInvite,
}: {
  organizationId: string;
  federation: boolean;
  busy: boolean;
  onInvite: (email: string, role: string) => Promise<{ inviteUrl?: string }>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(federation ? "org_admin" : "member");
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
      <p className="form-intro">
        Vytvořte osobní odkaz pro přihlášení člena. Pozvánka je vázaná na
        e-mail, má omezenou platnost a lze ji přijmout jednou.
      </p>
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
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {federation && (
            <option value="org_admin">
              Správce organizace · odesílá vyúčtování
            </option>
          )}
          <option value="member">Člen · připravuje doklady</option>
        </select>
      </Field>
      <div className="inline-banner">
        <Users size={17} />
        Pozvánka se automaticky neposílá e-mailem. Člen také potřebuje přístup k
        této soukromé aplikaci.
      </div>
      {link && (
        <div className="invite-result">
          <strong>Pozvánka je připravená</strong>
          <input
            aria-label="Odkaz pozvánky"
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
            {copied ? "Zkopírováno" : "Kopírovat odkaz"}
          </button>
        </div>
      )}
      <div className="form-footer">
        <button className="button primary" disabled={busy || !organizationId}>
          <Plus size={16} />
          Vytvořit pozvánku
        </button>
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
      <div className="adviser-intro">
        <span>
          <Sparkles size={25} />
        </span>
        <div>
          <h3>Nejdřív podklady, potom rozhodnutí</h3>
          <p>
            Průvodce pomůže najít pravidla ve zdrojích. Konečné posouzení
            provádí organizace a SFJ.
          </p>
        </div>
      </div>
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
              {c.number} · {c.program}
            </option>
          ))}
        </select>
      </Field>
      <div className="suggested-questions">
        {[
          "Mohu uplatnit kávovar do klubovny?",
          "Jak vysvětlit částečné uplatnění dokladu?",
          "Mohu použít hotovost?",
        ].map((q) => (
          <button key={q} onClick={() => void ask(q)} disabled={loading || !id}>
            {q}
            <ArrowUpRight size={13} />
          </button>
        ))}
      </div>
      <FormError error={error} />
      {answer && (
        <div className="adviser-answer">
          <span className="answer-label">
            <Leaf size={16} />
            Odpověď podle dostupných podkladů
          </span>
          <p style={{ whiteSpace: "pre-line" }}>{answer.answer}</p>
          {answer.sources && answer.sources.length > 0 && (
            <div className="answer-sources">
              <h4>Zdroje a související podklady</h4>
              {answer.sources.map((s, i) => (
                <div key={i}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <FileText size={14} />
                      {s.title}
                      <ArrowUpRight size={12} />
                    </a>
                  ) : (
                    <strong>{s.title}</strong>
                  )}
                  {s.excerpt && <p>{s.excerpt}</p>}
                </div>
              ))}
            </div>
          )}
          {answer.mode && <small className="small-muted">{answer.mode}</small>}
        </div>
      )}
      {loading && (
        <div className="adviser-loading">
          <Loader2 className="spin" size={18} />
          Procházím dostupné podklady…
        </div>
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
          aria-label="Dotaz na rádce"
          rows={2}
          placeholder="Na co se chcete zeptat k této smlouvě?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          className="button primary"
          disabled={loading || !question.trim() || !id}
          aria-label="Odeslat dotaz"
        >
          <Send size={18} />
        </button>
      </form>
      <small className="small-muted">
        Pokud ve zdrojích odpověď chybí, ověřte ji se SFJ. Rádce nepřidává
        vlastní pravidla.
      </small>
    </div>
  );
}
