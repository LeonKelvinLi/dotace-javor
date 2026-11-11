# Client-readiness audit — 11 November 2026

> Historical baseline before the native runtime changes. See [production handover](PRODUCTION-HANDOVER.md) for the implementation and remaining client launch gates.

**Decision: do not onboard a real client or upload private documents yet.** The settlement workflow is a useful foundation, but the current deployment is intentionally a shared homework demo. Turning login back on is necessary for a client deployment and is not sufficient on its own.

This audit used visible Chrome, fresh local protected-mode data, the actual Render service and metrics, GitHub repository metadata, source inspection and the existing automated checks. No live settlements were changed, no invitations or emails were sent, and no infrastructure was purchased or reconfigured.

## Evidence and scope

- Live app: <https://dotace-javor-99x6.onrender.com/>. Render serves commit `05af75c768f1cf7a4c9beeb227c9d5a1195115f5`; repository `main` is `b9ea1a375b496ee7dcec9d0dd673f8e51629682e`, which adds verification documentation.
- Source: <https://github.com/LeonKelvinLi/dotace-javor>. It is currently public. The only listed collaborator is Leon; a client-owned repository/operational handover has not been established.
- Render: one `0.5c-512mb` Docker instance in Oregon, a 1 GB disk mounted at `/var/data`, `/health` configured, automatic deployment off, preview environments off.
- Protected-mode browser checks ran on a newly created local data directory and disposable fixture credentials. These are not a claim that protected multi-user access is enabled on the live URL.
- `npm run typecheck`, `npm test` (39), `npm run test:integration` (14), `npm run build`, `npm run test:render` (6), and `npm run test:demo` (5) passed: **64 checks**.
- `npm run lint` **failed** because `eslint-config-next` cannot load `next/dist/compiled/babel/eslint-parser`. Both production-only and full dependency audits reported zero known advisories at audit time. That is not a penetration-test result.
- No application CI workflow exists in the checkout. GitHub returned zero check runs for the serving revision and reported `main` as unprotected. The other Actions runs were dependency-update jobs, not proof of an application release gate.

## Cold browser journey

| Journey | Observed result | Judgment |
| --- | --- | --- |
| Open live URL without credentials | Immediately shows the shared Demo federation administrator. Anonymous `/api/app` also returns this role. | Correct for the labelled demo; blocks private client use. |
| Open live `/login` | Redirects back to the demo. | A client cannot sign in to a personal workspace here. |
| Open a fresh protected local instance | Redirects to a Czech sign-in page; English works. | Login UI exists and works. |
| Submit an incorrect password, then the fixture password | Incorrect credentials show an error; correct credentials open the app. The error clears the entered email. | Basic authentication passes. Recovery and invitation guidance need work. |
| First protected login | Shows three fictional organizations, four contracts and “Sample workspace.” | Production initialization still seeds demo records. |
| Find a review | “Review & approve” → “Review expenses” → “Review next expense” is visible. Original PDF and Accept / Reject / Ask for information choices appear together. Final approval is disabled until decisions are complete. | Keep this guided review design. No live decisions were submitted. |
| Invite a member | Organization profile has a role selector and a Create invitation form. UI explains copying the link. | No delivery, pending-invitation management or staff offboarding journey. Creation/redemption and role isolation passed automated local tests. |
| Enter a new expense, close it, reopen | Entered `UNSAVED-AUDIT-ONLY`; closing the modal discarded it without a warning; reopening showed an empty number. | Reproduced draft-loss defect. |
| Upload the fictional sample PDF | OCR ran automatically. Invoice `TEST-2026-20203`, supplier, payment date, category and both 3,750 CZK amounts populated. Original rendered beside the form. | This sample passed. It does not establish broad document accuracy. |
| Lose the session while editing, then save | Invalidated the session in another local tab. Save showed Czech “Přihlaste se.” in the English form, without a sign-in/recovery action. The draft remained in memory. | Reproduced recovery and translation defect. |
| Manually sign in in the other tab, retry save | Save succeeded. A fresh authenticated HTTP read after closing the browser found the 3,750 CZK item and its 11,767-byte original. | Recovery is technically possible but a new user is not guided to it. |
| Inspect hosting backups | Render Disk page lists an existing snapshot dated November 10. | A snapshot exists; no matched database-and-files restore has been demonstrated. |

The live tab logged no console errors during the inspected navigation. The earlier blank-page failure was not reproduced in this pass; that does not prove all browser/OCR combinations are fixed. This pass establishes desktop Chrome observations, not a full mobile, Safari, Firefox, assistive-technology or performance certification.

## Release blockers and fixes

P0 means required before any private client records. P1 means required before handing over routine operations. These are findings and acceptance conditions, not completed changes.

| Priority | Finding and evidence | Required result |
| --- | --- | --- |
| P0 | **Public administrator mode.** Live UI/API and `render/server.mjs:10–29,73–76`. Anyone visiting the demo uses the same privileged identity. | Keep a separate fictional demo. Create a protected client environment that fails closed; anonymous pages redirect, APIs/files reject, and real users receive only their assigned role and organization. |
| P0 | **Production still gets fixtures.** `lib/server.ts:66` calls `seedDemo` for federation users regardless of demo mode; reproduced on a fresh protected instance. | Explicit opt-in seeding only for demo/test environments; production starts empty with a named owner and an organization → contract → invitation checklist. |
| P0 | **Account lifecycle is incomplete.** No reset/change-password, MFA, account disabling, invitation revocation or session-revocation UI/routes. Changing `ADMIN_PASSWORD` does not update an existing account hash (`render/server.mjs:17`). | Managed authentication or a complete equivalent; invite acceptance, verified identity, password reset, admin MFA, immediate offboarding, expired-link recovery and a documented emergency recovery owner. Test revoked access against APIs and original files. |
| P0 | **Recovery is unproven.** Accounts, application SQLite state and originals live together on one disk. A provider snapshot is visible but no application-aware backup job or restore evidence was found. | Scheduled database-consistent backups plus original-file copies and checksums; protected off-site retention; alert on failures; restore into an isolated environment and reconcile records, attachments and permissions. Agree maximum tolerable data loss and recovery time. |
| P1 | **Almost no memory headroom.** Five-minute Render samples from 16:00–18:40 UTC reached 533,221,380 bytes against 536,870,900 bytes (99.3%). App logs show another gateway startup at 08:57:56 UTC. | Profile the actual process, remove the development-runtime hosting layer or validate a supported production adapter, and size against measured concurrent workloads. Soak-test idle behavior and OCR/upload traffic. The evidence does not establish the restart cause or prove an OOM. |
| P1 | **Render hosts local simulations, not managed D1/R2.** `render/server.mjs:19` launches Miniflare and persists bindings locally. `package.json` puts the beta Miniflare package in devDependencies; Docker installs all dev dependencies and runs as its default user. | Use a supported production server/runtime and managed data services. Preserve business rules and UI while replacing storage/auth adapters; use a minimal non-root runtime image. Do not describe the current disk as managed Cloudflare database/object storage. |
| P1 | **Single disk limits availability.** One instance owns the disk; historical metrics include 502s around the release period. | Move durable state outside the app instance, rehearse restart/deploy failure and rollback, and agree availability expectations. Do not equate a successful health check with a resilient service. |
| P1 | **Draft loss and session recovery.** Both reproduced above. `ModalShell` closes on X, backdrop and Escape; mutation failures do not offer a useful 401 recovery flow. | Preserve unsaved work; warn before discarding it; show saved/unsaved status; offer sign-in in a new tab and retry without losing the form. A save followed by a failed refresh must not look like an unsaved operation. |
| P1 | **No reliable workflow notifications.** Invitations return a URL only (`lib/server.ts:181–192`); no outbound mail service is configured. | Transactional invitations, information requests, replies, returns and approval notifications with an outbox, retry/deduplication, delivery status and links to the exact record. In-app tasks remain the source of truth. |
| P1 | **Incomplete security hardening.** Live HTML/login responses lack an application CSP/frame restriction, HSTS and other baseline headers. HTML returned conflicting cache directives alongside `private, no-store`. Login rate limiting is in-memory; password hashing is synchronous. | Set and test security/cache headers and cookie behavior, durable abuse controls, bounded work per request, origin/CSRF protections, auth-event logging and redaction. Test these on the deployed protected environment; do not assume missing headers alone prove data exposure. |
| P1 | **Upload lifecycle and capacity.** Individual files are limited to 10 MB and signatures are checked, but no aggregate storage quota, malware quarantine or abandoned-upload cleanup was found (`lib/server.ts:220–235`). | Tenant/user quotas, upload throttling, safe parsing/quarantine policy, retention controls, removal/replacement workflow, orphan cleanup and disk/storage alerts. Originals must never become publicly readable through object URLs. |
| P1 | **Whole-workspace loading will grow.** `readState` loads all permitted contracts, items, files, members, feedback and audit events on each refresh (`lib/server.ts:89–97`). | Server pagination/filtering, incremental reads, indexed access and realistic large-workspace tests. Initial users seeing a short demo table is not capacity evidence. |
| P1 | **Release gates are missing.** Lint is broken, no application CI/checks or branch protection, no configured staging deployment. | Repair lint; require type, unit, integration, browser and dependency checks; deploy a reviewed revision to isolated staging; verify migrations, backup/restore and rollback before promotion. |
| P1 | **Monitoring is not an operational response system.** `/health` checks a database query only; logs lack an established alert/response workflow. | Error tracking, external uptime checks, request IDs, latency/error/memory/storage alerts, backup-age alerts and a named operator. Exercise an alert and a recovery, not merely create a dashboard. |
| P1 | **Business policy is still provisional.** Current signed contracts, instructions/decisions, cash policy and required original output template are missing or conflicting in `docs/SCOPE.md:36–48`. | Client supplies authoritative rules and accepts explicit checks, exceptions, reporting and approval wording. Preserve human eligibility decisions; OCR or an AI response must not authorize expenditure. |
| P1 | **Handover documentation disagrees with deployment.** `HANDOVER.md` primarily describes Sites/ChatGPT authentication and managed Cloudflare bindings; old test counts and OCR limits remain. The active deployment is the Render adapter. | One accurate runbook: architecture, environments, owner access, secrets, deploy/migrate/rollback, backups/restores, support and known limits. Fix broken context paths and distinguish historical evidence from current acceptance. |

Further client decisions: a read-only auditor role; whether one person administers multiple clubs (current membership is effectively one organization); approved-settlement correction/reopening policy; retention/deletion and audit-export requirements. These should not be solved by giving everyone federation-admin access.

## OCR and review acceptance

The browser uses PDF.js to render pages, Tesseract Czech/English OCR on every page, then deterministic field extraction. It supports PDF/JPEG/PNG/WebP up to 10 MB, at most ten PDF pages per reading, and a three-minute reading timeout. Original uploads still go to the application server; “browser OCR” does not mean documents are never stored or transmitted to the app.

`lib/extraction.ts:225–226` prefers embedded PDF text when enough text exists, even though visible-page OCR was also run. Add a fixture with an inconsistent text layer and visible scan; conflicting identity, date or amount must require review. Do not treat aggregate OCR confidence as financial-field accuracy. Retain manual corrections and never invent payment dates, exchange rates or missing supplier details.

Before release, evaluate agreed examples: native and scanned Czech/English invoices, photographs, multi-page statements, rotated/blurred pages, damaged/password-protected PDFs, unsupported general documents, foreign currency, conflicting totals, duplicate documents and cancelled/retried scans. Measure field correctness and time on ordinary client hardware. The present sample and parser tests are not this evaluation set.

Keep the review page's explicit two steps. Add a visible “waiting for organization” task and notification after an information request; link the organization's reply directly to the original request and back to the reviewer. Final approval should show accepted, rejected, outstanding and reduction totals plus the exact consequence before confirmation. Test the full loop with separate real roles on staging, not the demo's single identity.

OpenAI is not required for browser OCR. The live public demo intentionally withholds its bindings. Optional AI extraction/advice remains a separate provider integration and evaluation; no successful live provider call was established in this audit. Do not promise it as a production feature until configured, tested and approved for document processing.

## Recommended production services and budget

Keep Render if that remains the preferred host, but replace the Miniflare adapter with a supported Node production deployment. Use Supabase for managed Postgres, authentication and private storage. This is implementation and migration work, not an environment-variable switch. A native Cloudflare Worker with actual D1/R2 is another viable architecture; choose one production path rather than maintaining two unverified stacks.

Prices checked against official sources on 11 November 2026, in USD/month before taxes and usage overages. This is a proposal only; nothing was purchased.

| Service | Purpose and starting assumption | Expected base cost |
| --- | --- | --- |
| [Render web service](https://render.com/pricing) | One `1c-2g` application instance, sized again after profiling. Durable state lives outside it. | $25 |
| [Supabase Pro](https://supabase.com/pricing) | One production project: managed database, authentication and private file storage. Includes one Micro project's compute credit and daily database backups retained seven days. | $25 |
| [Resend](https://resend.com/pricing) | Invitation/reset/workflow email. Free allowance is 3,000/month and 100/day; Pro removes the daily cap and includes 50,000/month. | $0 initially; $20 if volume/bursts need Pro |
| [Sentry](https://sentry.io/pricing/) | Application errors and alerts, with personal/document data scrubbed. Free is one operator; Team supports shared operation. | $0 for one operator; $29 monthly Team |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | Independent private backup copies of originals and database exports, with retention and restore tooling. Standard allowance includes 10 GB-month; beyond it storage is $0.015/GB-month plus operations. | Budget $0–5 at small volume; recalculate from retained bytes and backup frequency |
| [Render Pro workspace](https://render.com/pricing) | Shared operational ownership when both client and developer need Render access. Separate from application compute. | $25; not needed for a single-operator Hobby workspace |
| Separate staging | Another small Render instance ($7) and additional Supabase Micro project (from $10). Synthetic data and separate secrets. | About $17 |
| Domain / uptime monitoring | Use a client-owned domain and existing monitoring where available. Choose/check a new provider only if needed. | Domain and any additional monitor to be quoted; not included below |

Core production application + database/auth/storage: **$50/month**. With shared Render access, Sentry Team and always-on small staging, the base is **$121/month**; budget roughly **$121–146/month** including the email and backup allowances above, before domain, external uptime-monitor charges, taxes or overages. Reusing company subscriptions can reduce the incremental cost. This is a small-client starting configuration, not a contractual high-availability SLA. PITR or stricter recovery/availability goals need a separate quote.

Supabase database backups **do not contain storage objects**; independent original-file backup remains required. [Provider backup documentation](https://supabase.com/docs/guides/platform/backups). Render disk snapshots exist, but Render cautions against treating a disk restore as recovery for a custom database; it also documents the attached disk's single-instance and deploy-interruption limits. [Render disk documentation](https://render.com/docs/disks). Cloudflare describes Miniflare as local execution with simulated bindings; it is not equivalent to the managed service. [Cloudflare local runtime documentation](https://developers.cloudflare.com/workers/local-development/).

## What the client must provide

1. Company-owned hosting/database/email/monitoring accounts or an approved budget, plus access for the implementer. Do not share personal administrator passwords.
2. The production domain and DNS administrator; a sender address/domain for SPF/DKIM/DMARC verification.
3. The first federation owner and role/organization assignments; who can approve, invite, revoke and audit.
4. Current signed contracts, authoritative eligibility/cash rules, reporting templates and acceptance examples using permitted/redacted data.
5. Expected organizations, users, concurrent reviewers and document volume/size, especially the deadline peak.
6. Hosting-region and document-processing requirements, retention periods, maximum acceptable data loss/downtime, support contact and operational owner. Region selection is a client decision; the current Oregon region should not be assumed to satisfy it.
7. A decision on optional AI. Browser OCR can ship without an OpenAI subscription; AI needs separate credentials, budget, processing approval and evaluation.

## Implementation order and release gate

1. Decide the production architecture and client-owned accounts; keep the demo separate. No paid provisioning until the service/cost proposal is accepted.
2. Implement production initialization, managed authentication, invitations/recovery/offboarding, tenant authorization and security controls. Verify every role against reads, changes, originals and exports.
3. Implement managed persistence, upload lifecycle, backup/restore, metrics/alerts and a minimal production runtime. Diagnose memory growth before using an upgrade as the entire fix.
4. Fix draft/session recovery, complete notifications and the multi-user information-request loop, and finish localization/accessibility and representative OCR evaluation.
5. Repair CI/lint, build isolated staging, run browser and realistic volume/soak tests, rehearse restore/migration/rollback, then complete client acceptance and transfer the runbook.

Release requires evidence for those gates. Passing the current 64 checks or turning `DEMO_MODE` off alone does not meet them.

## Local audit artifacts

Screenshots and sanitized hosting metrics are in `outputs/client-readiness/` (ignored by Git): `protected-login.png`, `live-review.png`, `local-ocr.png`, `expired-session.png`, `render-disk.png`, and `hosting-evidence.json`. The temporary protected server and fixture database were used only for this audit. No application code or live configuration was changed.
