# Verification · 10 November 2026

## Automated checks

- `npm run typecheck`: passed.
- `npm test`: 14/14 business-rule and extraction tests passed.
- `node tests/backend-integration.mjs`: 13/13 scenarios passed against actual server commands and the production SQL schema, using Node SQLite and small D1/R2 adapters. This is not a substitute for hosted Worker testing.
- Production build through the Sites build helper: passed; final publication rebuilds the exact committed source.

The scenarios cover organization isolation, file ownership/type validation, currency precision, missing evidence, simultaneous findings, impossible dates, comments, partial claims, wrong-company recipients, stale writes, locks, member permissions, clarification history, immutable audit records, final reductions and email-bound expiring one-use invitations.

## Actual local Worker and browser

- Local D1 migration applied successfully with Wrangler; authenticated API returned persistent seeded records and real private PDF bytes. Anonymous requests returned HTTP 401.
- Desktop (1440 × 960) and mobile (390 × 844) layouts inspected in the in-app browser. The mobile ledger scrolls horizontally inside its table container.
- Native PDF iframe was blank in this browser. Replaced with local PDF.js canvas rendering and visually verified the actual original receipt.
- Saved organization review, verified that a partial claim without explanation was rejected, saved its explanation and reviewed status, then submitted the settlement.
- Submission locked ordinary editing. Federation bulk acceptance persisted. Final conclusion and a 77,500 Kč reduction on a fictional 120,000 Kč grant persisted, leaving 42,500 Kč of accepted expenses.
- Actual fictional PNG upload persisted, displayed and remained contract-scoped. Actual Czech/English Tesseract OCR recognized 9 fields from the uploaded PNG at 94% OCR confidence; applying the proposal populated supplier, IČO, number, description and 1,234.56 Kč. Saving produced a persisted receipt row with the original attachment.

All browser mutations above used fictional data in the isolated local preview. They do not assert any real grant decision or client acceptance. Local sign-in uses the starter's development identity; hosted sign-in is platform-owned.

## Live AI and deployment

The OpenAI extraction and source-grounded adviser endpoints are implemented. A usable project API key has not yet been supplied by the secure setup flow, so live model behavior is not verified and is not represented as completed. Without configuration, the application explicitly exposes local OCR and a limited document guide.

Version 1 deployed successfully to [Dotace Javor](https://dotace-javor-pilot.splk6.chatgpt.site). Actual hosted ChatGPT sign-in and private membership bootstrap passed. A seed original rendered from hosted R2, a receipt review saved to hosted D1 and persisted after a full reload. Source was pushed to the private [GitHub repository](https://github.com/LeonKelvinLi/dotace-javor). Multi-user hosted invitation acceptance requires a second permitted account and has not been browser-verified; its server authorization and token lifecycle are covered by the integration scenarios.

- CSV export was downloaded through the browser as `026-002-2026-T-vyuctovani.csv`; its content was checked against the two stored receipt rows.

The native print-dialog action was unreliable in the in-app browser; the final report implementation now creates a directly downloadable PDF with embedded Czech fonts. The direct PDF downloaded successfully in the actual browser as `026-001-2026-O-vyuctovani.pdf`. PDFInfo verified two A4 pages; PDF.js text extraction verified Czech accents, all three cost groups, the partial-claim explanation and the final conclusion.

- Read-only local service checks: ARES returned an actual public registry record; the adviser returned a clearly labelled guide response with contract and 2025 reference sources; missing AI configuration returned an actionable 503 on model extraction. No paid model call was made.

## Dependency hardening

After GitHub reported alerts in the starter dependency graph, unused UI packages and the unused Next.js runtime were removed. Vinext was upgraded to 1.4.4, React/DOM/RSC to 19.3.1, Vite to 8.3.7, the Cloudflare plugin to 1.68.0 and Wrangler to 4.157.0. Zod preview parsing was adapted to v4. Scoped patched overrides cover three transitive dependencies without the breaking downgrades suggested by npm.

`npm audit` against the final lockfile on 10 November 2026 reports **0 vulnerabilities** (including development dependencies). `npm run db:generate` reports no schema changes; the migration remains unchanged. The final source is rebuilt and its tests rerun before publication.

The patched framework was started in the local Worker preview and browser-verified: sign-in remained valid, the existing database and uploaded receipt were retained, and the contract ledger rendered correctly. The temporary verification tab was closed afterward.

## Render deployment and Chrome verification

Deployed on 10 November 2026 to https://dotace-javor-99x6.onrender.com in the confirmed My Workspace. Render deploy `dep-dbpmmd6c6qcc73dggak0` is live at runtime commit `96e3322e5843fa5bd93e9ceeccb27b3ec12bda91`. Docker image build succeeded. The Oregon 0.5 CPU/512 MB service has the approved 1 GB persistent disk at `/var/data`; expected base cost is $7.25/month before taxes or extra usage. Automatic deploys and Blueprint syncing are disabled.

- Public `/health` returned HTTP 200 after querying D1.
- Actual Chrome sign-in with the Render-generated owner credential succeeded.
- Uploaded the fictional OCR PNG, rendered its original, recognized nine fields at 94% OCR confidence, applied the proposal and saved `RENDER-QA-2026-001`. The stored receipt and attachment remained after a full refresh.
- Marked the fictional seed receipt reviewed, submitted the Talent settlement, verified ordinary editing became locked, batch-accepted both receipts and closed the federation review with an explicit test conclusion. Dashboard shows one approved settlement. These are fictional pilot records only.
- Chrome downloaded a CSV containing both receipt rows and a two-page PDF containing the new receipt, accepted status and final conclusion. The Chrome download-event helper timed out even though the file downloaded; actual files in Downloads were inspected.
- No browser console warnings/errors were captured during those checks. Proof: `outputs/render-chrome-live.png` (local, ignored).
- `npm run test:render` passed five hosting scenarios: anonymous/forged identity rejection, invite-only scoped registration, signed-in identity spoof rejection, persistent records/accounts/sessions/original bytes across process restart, and logout invalidation. Restart persistence was tested locally against the actual built Worker and the same gateway; a production restart was not forced.

Admin email is `admin@javor.example`; retrieve the generated password from the new service's Render Environment page. No production credential is stored in this repository. Multi-user live Chrome sign-up remains unverified; invite acceptance and isolation pass in the hosting and backend tests. OpenAI is still unconfigured, so live AI extraction/adviser behavior is pending. The Render database is independent from the earlier Sites deployment.

## Additional document checks

On 10 November 2026, Chrome tested additional fictional PDFs against the Render service:

- Two-page Czech invoice with VAT and the final total on page two: both pages read, nine fields proposed, correct 12,100 Kč total and 20 October payment date (rather than the due date).
- Image-only scanned PDF: PDF rendering plus Tesseract OCR ran, nine fields proposed, correct 1,234.56 amount. OCR read the supplier suffix as `s.r.0.`; proposals require human review.
- General invitation letter: text was readable, but the initial parser mistook narrative words following “faktura” for a number. Commit `6622bbb` now requires a digit in an extracted document number.
- English/euro invoice: text and supplier were readable; other English fields remained blank for manual entry. This does not establish broad multilingual extraction support.
- Non-PDF content named `.pdf`: rejected by the server with an explicit supported-format error.

An additional regression found that a Czech-labelled euro total could be proposed as CZK. Commit `6622bbb` suppresses automatic amounts whenever an explicit foreign-currency marker is present and shows a warning to supply a documented CZK conversion manually. Unit regressions cover narrative text and eight foreign-currency markers. `npm test` now passes 16 checks, backend integration passes 13 scenarios, type checking and the production build pass. The samples are controlled fictional fixtures, not an independent real-world document corpus; Word/Excel input and automatic general English field extraction are not claimed. Live AI remains unconfigured.

Render deploy `dep-dbpmurjncjis73ejkeh0` is live at `6622bbbb2555d0235ba18b2dfcdcb71714ceca48`. Actual Chrome regressions passed after deployment: the general letter returned readable text with no invoice fields or apply button; the Czech/euro invoice proposed six non-amount fields, displayed the explicit currency warning and left both amount inputs blank after applying. The signed-in session, existing records and approved settlement survived the deployment. A dynamic asset import failed once during the service transition; the app's Reload action recovered. This is a single-instance disk-backed service with brief deployment interruption. Local evidence is in ignored `outputs/document-qa/`. No additional expense rows or settlements were saved during these document-only tests; fictional uploaded files remain in pilot storage.

## Expanded extraction and currency workflow

On 10 November 2026, the earlier English-extraction limitation was addressed with anchored Czech/English labels, payable-total prioritization, international decimal parsing, supplier-specific IDs, actual payment dates including English month names, and rejection of ambiguous/impossible dates. Missing currency is no longer assumed to be CZK. Contradictory totals remain for manual review. New receipts start with a blank payment date. Manual date entry accepts ISO or Czech dates and normalizes valid input on blur.

Foreign-currency invoices retain their source amount/currency and offer an explicit conversion form. The reviewer enters the rate and its source/date; the converted amount and calculation are placed in the editable receipt and its persistent comment. No live exchange rate or accounting policy is assumed. The AI extraction contract also requires currency evidence, preserves unknown fields, suppresses non-CZK amounts, and returns uncertainty warnings; live AI remains pending credentials.

Actual Chrome checks: the English euro PDF proposed its invoice number, supplier, description and category. The fictional 1,210 EUR × 25 QA rate produced 30,250 Kč; the receipt and rate note persisted after reload. Manual entry `20. 10. 2026` normalized to `2026-10-20` and saved. An English JPEG recognized nine fields at 94% confidence, including 1,210 Kč and the actual payment date. WebP uploaded and previewed, but its direct OCR decoding failed; browser bitmap rasterization fixed it, with the same nine fields verified locally.

Automated checks: 22 extraction/business tests, 13 backend scenarios, five Render gateway scenarios; type checking and production build pass. OCR remains a proposal requiring review; these controlled documents are not proof of universal accuracy for all layouts, languages, handwriting or damaged scans.

Final Render deploy `dep-dbpn7i5bedkc73b76lsg` is live at `b1aa3e4814705efa114a5fc9e07ca69477fc4299`. Live Chrome WebP regression passed: nine fields at 94% OCR confidence, correct supplier, identifier, 1,210 Kč and 20 October 2026 payment date. The converted English euro receipt and its date survived the final deployment. Evidence: `outputs/document-qa/english-webp-live-success.png`, `english-jpeg-success.png`, and `english-converted-saved.png`. All four advertised file formats have now been exercised in Chrome across the testing sessions (PDF, PNG, JPEG, WebP). A new OpenAI key is authorized but the secure organization/project picker has not returned a target, so paid AI behavior is still unverified.

## Automatic OCR and translated-page crash recovery

On 10 November 2026 the user reported a full-page error immediately after OCR. The affected Chrome tab recorded React `NotFoundError: insertBefore` in the extraction button while Chrome page translation was active. OCR controls now keep icons and text in separate stable elements and replace translated dynamic labels by key. Related ARES, organization-save, PDF-export, upload and preview controls received the same protection. An error boundary contains extraction-panel render failures without unmounting the receipt editor.

OCR starts automatically on upload, opening an editable receipt's existing attachment, selecting another attachment, and selecting an organization source document. Every PDF page is rasterized and OCR-scanned, including pages with embedded text. OCR does not require an OpenAI key. The existing explicit apply/save steps remain so uncertain recognition never silently changes accounting data. Optional AI verification remains unconfigured.

The pipeline has a 10 MB / 10-page limit, a three-minute timeout, cancellation on user request/file change/unmount, a per-tab execution queue, stale-result suppression, a 4-megapixel / 2,600-pixel raster bound, explicit worker error handling and resource cleanup. PNG, JPEG and WebP all pass through browser rasterization. Existing attachment retrieval has a 30-second timeout and retry control. Corrupt/password-protected PDFs and empty or unsupported files produce actionable errors.

Local Chrome with automatic English translation verified: opening an existing PDF starts OCR without clicking a scan button; repeat scans finish without the reported DOM exception; two-page PDF OCR reads both pages (95% confidence, nine proposed fields); WebP OCR proposes nine fields (94%); cancel during scanning displays the stopped state; switching from an active two-page scan to a general letter discards the old result and returns readable text with no invoice fields; corrupt PDF parsing fails inside the editor; an 11-page PDF shows the limit error; manual supplier edits survive attachment changes. No unhandled browser errors were captured. Invalid non-PDF content was also rejected by the upload API. Fixtures are synthetic, not proof of universal recognition accuracy.

Validation: 28 extraction/business/lifecycle tests, 13 backend integration scenarios and five Render gateway tests pass (46 total). Type checking and production build pass. Lifecycle regression tests cover raster bounds, late worker failures after cancellation, queue ordering with a cancelled waiter, retry after failure, input limits, and pre-cancelled jobs.

Runtime commit: `991d34c8c7e482dde3cad2612ad460afa9fea82f`. Render deployment `dep-dbpnkiijnfac73br5m5g` is being verified; live results are recorded below after confirmation.

Render confirmed this deployment live at 20:12:20 UTC. The disk-backed rollout briefly returned 502s during the transition; the existing Try Again action recovered once the service was ready. Public `/health` returned `{ "ok": true }`. There were no subsequent browser errors during the live OCR checks.

Live Chrome with automatic English translation passed: the existing English/EUR PDF starts OCR on open and correctly retains EUR 1,210 plus the missing-payment-date warning; repeating and cancelling OCR works; fresh PNG, JPEG and WebP uploads each start OCR automatically and each produce nine fields at 94% confidence. WebP results applied correct identifier, supplier, IČO, description, payment date and 1,210 Kč. Only the WebP attachment was retained in the fictional test receipt `PHOTO-2026-101`; it was saved with an explicit QA comment, reloaded, reopened, and its fields, comment and original file persisted. Reopening starts OCR again without discarding saved values. No settlement approval or submission occurred. Extra synthetic uploads remain in pilot storage.

Proof: `outputs/document-qa/automatic-ocr-live-recovery.png` (ignored local artifact). The affected live Chrome tab was left open on the successfully saved/reopened receipt. The local test server was stopped. OCR works without OpenAI; the separately optional AI adviser/verification still needs the authorized secure key setup. Production assurances here apply to the tested document workflow and stated limits, not arbitrary OCR accuracy or a completed operations/security audit.

Final label refinement: `1b7def6336c9a5ae9af3a2d27fe2138582051253` replaces the ambiguous Czech bank label with “Bezhotovostní platba” and uses “Popis výdaje” for the expense description, including exports. This avoids Chrome translating those labels as “Flask” and “Cargo description.” Type checking and production build passed again. Render deploy `dep-dbpnoabrjlhs73adtjq0` reached live at 20:19:38 UTC; the underlying OCR implementation and test results above are unchanged.
Final live recheck confirmed Chrome now displays “Cashless payment” and “Description of expense.” The saved WebP receipt retained its fields and QA comment, and automatic OCR again completed at 94% confidence with nine proposed fields. The proof screenshot was refreshed to this final build.

## Automatic field completion and settlement-report receipts

On 10 November 2026, the user's screenshot showed the exported `026-001-2026-O-vyuctovani (2).pdf` in a new receipt form with empty fields. The document is a two-receipt settlement report. Previously the OCR view required an explicit apply click and the invoice parser could not split the report.

Commit `c6d6422c1030533ddfebc5cade36552571cfb0df` automatically applies all recognized fields to receipt and organization forms. Known organization names populate the recipient field. Saved data and manual corrections survive automatic repeat scans; an explicit refill control remains available. Earlier automatic values are replaced when selecting another report entry. Every PDF page still runs OCR; native PDF text also supplies exact structured labels where available. Report entries keep separate document totals, claims, dates, supplier identifiers, cost categories, recipients and available comments; grant totals and report totals never become an individual receipt amount. Selecting a report receipt fills its fields automatically. Review/approval statuses are not copied from the report.

Duplicate receipts are detected by contract, document identifier and supplier, with a link to open the saved receipt. New duplicate costs are rejected on the server, and the SQL mutation also guards simultaneous duplicate imports. Save is disabled until attachment loading/OCR finishes. Partial upload success retains attachments even if a later file fails.

Local Chrome with automatic English translation verified the exact user PDF: first receipt `FV-2026-101` automatically fills 18,500 Kč, its supplier, IČO, description, material category, 15 September payment date and the known organization recipient; selecting `FV-2026-108` fills 32,000 Kč total / 24,000 Kč claimed and the correct supplier, category and date. Existing-record notices appear for both and the existing-record action opens the original. Repeating OCR retains the selected second receipt and a manually corrected description. No browser errors were captured.

Validation passes: 35 extraction/business/autofill/lifecycle checks, 14 backend integration scenarios, and six Render gateway scenarios (55 total), including an actual simultaneous-import test that results in exactly one receipt and one HTTP 409. Type checking and production build pass.
A fresh local JPEG receipt also filled all nine recognized fields automatically and included the known recipient name. Saving without any apply click succeeded; its identifier and 1,210 Kč amount survived reload. Local test servers were stopped afterward.

Render deploy `dep-dbpo4a3rjlhs73af3cqg` reached live at 20:46:13 UTC on `c6d6422c1030533ddfebc5cade36552571cfb0df`; public health check returned HTTP 200. Live Chrome with translation enabled repeated the exact user report upload: the first receipt filled its 11 available fields without clicking refill, switching to the second populated the correct 32,000/24,000 Kč amounts, and switching back restored the first receipt's values. Both correctly show an existing-record notice. No new costs or settlement submissions were created in these live report checks. No new browser errors were captured. The affected Chrome tab was left open on the automatically completed first receipt. Proof screenshots: `outputs/document-qa/autofill-report-first-live.png` and `autofill-report-second-live.png` (local ignored artifacts).

## Workspace UI refinement

The accounting workspace was redesigned and deployed as `d14e1ec29c964ddb5ea1858348ea7f891cc49b90`, Render deploy `dep-dbpoms6gekts73emgiq0`. The design review, decisions and validation are recorded in `docs/UI-REVIEW.md`. The release simplifies navigation/copy, adds direct contract creation and status filtering, improves text contrast and phone layouts, places reading controls above the preview, and keeps receipt Save visible. Modal updates preserve typing focus. Existing extraction and backend checks (55 total), type checking and the production build pass. Live Chrome verified the dashboard, status filtering, automatic receipt filling, independent editor panes, visible Save and responsive overview without horizontal page overflow. Final live browser session captured no errors. Proof is in ignored `outputs/ui-refresh/`. The local QA server was stopped and browser viewport overrides were reset.


## Cold-start simplification and native languages · 10 November, evening

- Reproduced the recurring live page failure by navigating Organizations → FK Háj → contract with Chrome translation active. The console reported a React `removeChild` NotFoundError in a reused paragraph subtree.
- Added a native Czech/English language switch (Czech default, persisted choice), including Render sign-in. The app declares `translate="no"` and keys page content by the opened view/record so translation does not rewrite React-owned text.
- Added role-specific first-use guidance, explicit contract row actions and a next-step panel before contract totals. The panel advances through upload, expense checks, submission, federation review and report download. Optional contract conditions are collapsed; duplicate submit/approve actions and an empty-list upload button were removed.
- Saving an organization opens its profile; saving a contract opens its settlement. Expense review uses one confirmation checkbox. Editing expense data clears the confirmation and requires a new check.
- Fixed extraction of ASCII Czech sample labels (`Castka`, `Datum uhrady`, `Zpusob uhrady`) and added an extraction regression test.
- Automated: 36 unit/regression tests, 14 backend integration scenarios and 6 Render-host scenarios passed. Production build and TypeScript passed. An intermediate host-test start overlapped a rebuild and failed; rerunning against the completed build passed all 6 scenarios.
- Visible Chrome, isolated local Render gateway: fresh sign-in and native English; sample expense OCR; full claim check/save; partial claim explanation; submit; accept both fictional expenses; approve; reload; PDF download. The two-page downloaded PDF contains both receipts, the partial-claim explanation and the review conclusion.
- Created a fictional contract using the English form and confirmed it opens immediately after save. Uploaded `ocr-fixture.png`; automatic OCR filled `TEST-2026-001`, supplier, company ID, payment date, description and 1,234.56 CZK; confirmed and saved the expense successfully. No production grant decisions or invitations were made.
- Inspected the desktop and 390×844 layout. The review action was moved above the totals after the mobile inspection.
- OpenAI configuration and real provider calls remain outside this verified change. Native language labels do not translate original uploaded documents or user-entered text intentionally.
