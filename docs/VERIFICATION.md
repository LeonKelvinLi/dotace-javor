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
