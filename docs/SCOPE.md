# Dotace: scope and decisions

This is an independently implemented developer exercise for the fictional **Sportovní federace Javor (SFJ)**. The application UI is Czech; developer documentation is English. All seed data is fictional. The packet is evidence for product requirements, not authorization to contact people, sign agreements, pay invoices or access an original client system.

## Evidence and precedence

The original packet is beside this application at `../context/` (paths below are relative to the application root). Its sales prototype simulates login, server operations and AI. A prototype screen or sample number is not an agreed rule or an implemented backend.

Read the original conversations together with the September 30 change note. Later explicit decisions supersede earlier proposals. The strongest handoff evidence is the client's October 1 acceptance in [WhatsApp, lines 211–215](../../context/whatsapp.txt), following the revised prototype and change note. No prototype deployment in that history proves this implementation was deployed.

| Requirement | Evidence | Implementation decision |
| --- | --- | --- |
| Organization → contract → settlement → expense items | `../context/2026-09-29-hovor.txt`, lines 115–121, 155–171 | Each contract owns its settlement; an organization can hold several contracts and programs. |
| SFJ administration and organization access | `../context/2026-09-17-hovor.txt`, lines 78–108; September 29, lines 19–25 | Federation administrators manage all organizations. Organization administrators invite their own members. Ordinary members cannot administer access. All operations enforce membership on the server. |
| Create organizations, upload already signed contracts and invite members from organization detail | `../context/2026-09-30-interni-hovor.txt`, lines 108–133; [V2.3 note](../../context/prilohy/2026-09-30-zmeny-prototypu-v2-3.md), lines 17–19 | Contracts are signed outside this application. Store organization contact/bank data and multiple representatives; retain source attachments. An explicit IČO lookup retrieves the name and address from official ARES; it does not fabricate missing contacts. |
| Upload PDF/photo documents | September 30 call, lines 157–180; V2.3, line 9 | Accounting Excel/CSV import is excluded. CSV export is retained. |
| Extract, correct, review and submit | September 29 call, lines 123–145; September 17, lines 149–168 | Browser-side PDF text extraction/OCR and labelled-field suggestions work without an API key. The implemented optional OpenAI extraction endpoint produces structured editable suggestions once configured. Users confirm every item; automated output is not legal eligibility certification. |
| Three cost groups | September 30 call, lines 62–68; V2.3, line 11 | Materials; services including self-employed contractors (OSVČ); wages including contributions. Do not count contributions twice or classify OSVČ as wages. |
| Two independent review stages | September 29, line 134; September 30, lines 208–212; V2.3, line 12 | Organization: unchecked / checked / checked with comment. SFJ: pending / accepted / rejected / supplement requested. SFJ's work queue begins on submission. |
| Explain acceptable exceptions | September 30, lines 189–211; V2.3, line 13 | Partial claims and recipients who are individuals need an explanation. A receipt without recipient is not flagged for that alone. A document to another company must be excluded; a comment cannot override it. |
| Request supplements and retain history | September 30, lines 11–16; V2.3, line 23 | Keep federation request, organization response and decision history with the item. Rejection requires a reason. |
| Review filters, bulk acceptance and sample checks | September 29, lines 25–26; V2.3, lines 12, 19–20, 29 | Compact contracts with year/program/organization filters; item comment and attachment filters; full expense description. Human reviewers remain responsible for decisions. |
| Contract documents and source references | September 29, lines 136–145; September 30, lines 81–94; V2.3, line 22 | Attach signed contract, instructions, decision and amendments to the contract. A source excerpt is evidence for a human, not an automatically binding rule. |
| Report and final decision | September 30, lines 47–68; V2.3, line 21 | CSV item export and browser-printable report suitable for Save as PDF. Report includes organization, contract, three groups, grant, items, reduction and conclusion. SFJ enters the final conclusion and reduction, with rejected-item total suggested. |
| Beneficiary declaration | September 30, lines 228–237; V2.3, line 28 | Organization confirms factual truth and accounting records; SFJ conducts formal review. Recorded declaration does not certify actual use of funds. |
| Adviser and suggestions | September 17, lines 192–199; September 30, lines 213–217; V2.3, lines 24, 29 | The implemented optional AI adviser receives the selected contract and its uploaded policy sources. Without a key, the visibly labelled document guide retrieves available reference text without pretending to be an LLM. Suggestions and final human review remain separate. |

## Resolved changes

- **No accounting import:** earlier discussion proposed ingesting arbitrary Excel/CSV exports. The September 30 discussion explicitly rejected this because categories, VAT bases and attachments would be inconsistent. Export remains useful.
- **Payment method, not payment status:** use **Banka / Hotovost**. Remove a separate “paid” checkbox and mandatory bank-statement upload. SFJ can request evidence when necessary. This does not settle which cash expenses are legally eligible.
- **Contract-centered workflow:** an organization's expenses cannot be mixed into a single settlement across all contracts.
- **Organization review is distinct from SFJ acceptance:** a user's comment acknowledges an exception; it does not approve the expense on the federation's behalf.
- **Human decisions:** the September 29 call explicitly states “AI proposes, a person decides” (lines 165–171). No zero-error or fully autonomous acceptance guarantee is implemented.

## Missing inputs and explicit limits

| Input / question | Current treatment |
| --- | --- |
| Cash policy conflicts | All three supplied March 2025 cost extracts require cashless payment (`prehled-nakladu-organizace-2025.txt`, line 15; `talent`, line 9; `reprezentace`, line 23). September 30 allows small cash payments and proposes flagging large ones. Preserve this conflict as a warning requiring explanation and federation review. The prototype's **10,000 Kč is only an example**, not a default legal threshold. Any configured threshold is a review trigger, not proof of eligibility. |
| Actual contracts, SFJ instructions and ASP decisions | Not supplied. Uploaded customer documents and contract fields can be stored, but the training extracts and fictional examples cannot establish current legal rules or a complete eligibility engine. |
| Original Excel template | Unavailable in the packet. CSV export and a newly designed printable report are provided; neither is described as the missing original workbook. |
| AI/OCR provider and evaluation | Browser PDF text/OCR and manual entry require no paid key. Server `/api/extract` and `/api/adviser` integrations are implemented for the OpenAI Responses API; the default model is `gpt-5.4-mini`. **The live LLM is still unconfigured and unverified until a key is securely provisioned.** Approval to create a key is not proof of provisioning or a successful provider call. After configuration, selected documents are transmitted to OpenAI; all suggestions still need review and representative evaluation. |
| Registry | An implemented server endpoint calls the official Ministry of Finance ARES API only on an explicit federation-admin IČO lookup. It returns public organization name/address with source and retrieval time. Failure/not-found states permit manual entry, without invented results. This is independent of any unavailable original client system. |
| Email | Invitations create real application access tokens. No email is sent. An administrator distributes the displayed invitation link through a separately authorized channel. |
| ASP auditor access | Mentioned ambiguously once; not a separate implemented role. Decide a least-privilege read-only role before granting audit access. |
| Small “Pohár předsedy” contracts | A simpler path for roughly 110 small contracts was raised but not agreed. Use the same contract workflow pending a product decision. |
| Dates and limits | Settlement deadlines and periods belong to each contract. January 15/31 and sample contract values are not universal policy. No complete payroll, hourly-rate, prize-money or asset-cap legal engine is claimed. |
| Production operations | Retention, backup/restore objectives, region, DPA, malware scanning, formal penetration testing and operational ownership need agreement before real grant data is introduced. The initial private deployment is an exercise handoff with fictional data. |

The cost extracts contain examples of salary/service caps and assets; they are dated training material and may not reflect the 2026 agreement. They must not be presented as current legal guidance. A guide response without sufficient source material must state that uncertainty.

## Deferred and outside this assignment

- Talent player lists and a FAQ derived after the first operational year (V2.3, lines 31–34).
- Voice agents, automatic learning from corrections and autonomous outreach; discussed possibilities do not establish a delivery commitment.
- Preparing or signing grant contracts, executing payments, connecting to the old client system, and contacting fictional people.
- The separate financial-statement product, general accounting ERP and rollout to other sports. These are background ideas, not additional assignments.

## Dated commercial context

This records the fictional sales handoff, not new commitments or payments by the user:

- September 10 reservation: **25,000 Kč/month**, per `../context/obchodni-udalosti.txt`, lines 4–5.
- September 29: intermediate 48,000 Kč option discussed, then an intensive first month. The system records the old invoice voided and **Ultra at 89,000 Kč/month** chosen, lines 7–11.
- October 1: client says the invoice is in internal approval and work may begin, `../context/whatsapp.txt`, lines 211–215. This is **not proof of payment**.
- October 1 supplier email promises a first working version by **October 15, 2026**, with the **89,000 Kč first-period invoice due October 2**, `../context/e-maily/2026-10-01-15.txt`, lines 7–13. Work starts before payment as an explicit exception.
- Client aims at a pilot with several organizations in **November** (September 30 call, line 238), use during December and January annual settlements (September 29, lines 74–88).

The exercise README separately asks the candidate and interviewer to agree a time allowance and handoff date. No such call or later agreement is supplied. The implementation records its actual verification and handoff state rather than inventing one.
