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
