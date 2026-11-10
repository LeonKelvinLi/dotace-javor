# Developer handover

Read [SCOPE.md](./SCOPE.md) for the evidence behind the implementation, policy conflicts and features that remain limited. [WALKTHROUGH.md](./WALKTHROUGH.md) contains the reviewer journey and acceptance checklist.

## Architecture

- **React / Vinext** supplies the Czech web UI and server routes on a Cloudflare Worker.
- **Cloudflare D1**, bound as `DB`, persists organizations, contracts, expense items, memberships, invitations, file metadata, decisions and audit history.
- **Cloudflare R2**, bound as `BUCKET`, stores uploaded documents. Metadata and organization/contract ownership are kept in the database; browser-supplied object names do not grant access.
- **Sites / ChatGPT sign-in** supplies identity. Application membership supplies authorization. Identity alone must not grant access to federation data.
- **PDF.js, browser-side Tesseract OCR and deterministic rules** assist data entry without an API key. OCR assets are served from this application; this local reading path does not transmit the document to OpenAI. Manual entry is the fallback.
- **Optional OpenAI Responses API** integrations implement structured document extraction (`/api/extract`) and a source-based adviser (`/api/adviser`). Configured AI requests transmit the selected documents to OpenAI; output remains a proposal for human review.
- **Official ARES lookup** (`/api/registry`) retrieves public organization name/address from an eight-digit IČO only after an explicit federation-admin action. It has clear not-found/unavailable states and manual fallback.

The source application is in `dotace/` inside the provided archive. The original `context/prototype/` remains reference material, not the production implementation.

## Run locally

Use Node.js **22.13 or later** and the committed npm lockfile. Run from the application root:

```sh
npm ci
npm run build
```

The Sites starter also offers `npm run install:ci` for its supported install wrapper. Do not run concurrent installers. A build creates `dist/server/wrangler.json` from `.openai/hosting.json`; do not hand-edit generated output.

Apply the application's ordered SQL migrations to the local D1 binding before the first visit. Use the actual filenames in `drizzle/`, in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_round_madelyne_pryor.sql
```

If the migration filename changes, use the corresponding committed SQL file. Apply pending migrations once; do not replay data-changing migrations against an established database. The persistence root is `.wrangler/state`, not `.wrangler/state/v3`.

```sh
npm run dev
```

Open the loopback URL printed by Vinext (normally port 5173). The portable development profile provides a clearly local sign-in identity through `/signin-with-chatgpt?return_to=/`; hosted authentication is platform-owned. Local authentication simulation is not included in production builds. `npm start` previews a built Worker locally; it does not deploy or simulate hosted sign-in.

Useful checks:

```sh
npm test
node tests/backend-integration.mjs
npm run typecheck
npm run lint
npm run build
```

Verified on November 10, 2026: **14 model/extraction tests** pass with `npm test`; **13 backend integration scenarios** pass with `node tests/backend-integration.mjs`. Backend integration runs the actual application commands and production SQL against Node SQLite with D1/R2 adapters; it does not test a deployed Worker, network provider or external account. Build, UI and hosted results are recorded separately in [VERIFICATION.md](./VERIFICATION.md). The walkthrough checklist is a review aid, not an assertion that every case passed.

## Optional AI configuration

Server integration is implemented in `lib/ai.ts` and the two endpoint routes. Set `OPENAI_API_KEY` in the hosting platform's secret store; for a local Worker use an ignored `.dev.vars` file. `OPENAI_MODEL` optionally overrides the default `gpt-5.4-mini`. Never place the key in browser code, source control, documentation, a source archive or screenshots.

**Current handoff state: no key has been provisioned and live LLM calls have not been verified.** The secure key setup is still pending. The existence of endpoint code or authorization to configure a key does not establish live provider operation. Until configuration succeeds, browser PDF/OCR and manual entry work, and the adviser uses its explicitly labelled reference-guide fallback.

AI extraction accepts actual PDF/JPG/PNG/WebP files up to 10 MB and returns structured field suggestions. The adviser includes the selected contract's conditions, training reference text and uploaded non-receipt policy documents (at most eight documents / 15 MB). Both endpoints require application authorization. AI requests have a durable 30 requests/hour/user limit, a 60-second timeout and bounded output; they use `store:false`. This request setting is not a claim of zero retention across all provider infrastructure or a substitute for reviewing current provider terms.

After secure configuration, verify one fictional extraction and one fictional adviser question at the deployed URL. Inspect source references and error/fallback states; do not use real grant documents for this smoke test. A successful request verifies connectivity, not model accuracy or legal eligibility. Actual contracts/current instructions and representative evaluation remain necessary.

The ARES route calls `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}` with a 12-second timeout. It does not require a private registry credential, send email or query a former client system. It provides only the fields returned by that public service; manual correction remains possible.

## Access and first administrator

The initial hosted deployment is **owner-private**. The first authenticated identity may bootstrap the initial federation membership only under that private access policy. Never open first-user bootstrap on a public site: an arbitrary visitor could otherwise become administrator.

Two independent gates apply:

1. The Sites hosting policy must permit the person to visit the deployment.
2. The application must grant that signed-in identity a membership, normally through an invitation token.

Creating an invitation does not change the Sites sharing policy. A valid application invitation alone cannot let another person enter an owner-private site. Configure sharing separately before a multi-user demonstration; then distribute the invitation link outside the application. No invitation email is sent by this release.

Keep invitation links out of source control, screenshots and public reports. They are bearer credentials until accepted or expired. Validate role and organization on the server when creating and accepting them. An ordinary member must not be able to create federation access or invite to another organization.

Organization administrator/member accounts are limited to their organization. Federation accounts can review all organizations. An existing federation administrator can create a separate **Pozvat správce SFJ** invitation for another federation reviewer; organization users cannot create or accept an upgrade to that role. Server checks must cover reads, mutations, attachments, exports and reports; hidden UI controls alone are not authorization.

## Deploy and transfer

The initial delivery uses Sites provisioning for the Worker, D1 and R2 bindings declared in `.openai/hosting.json`. Follow the installed Sites workflow to build, package and publish this source. A successful local build is not a deployment; publishing must complete and the returned hosted URL must be checked while signed in.

Production D1 migrations are separate from local preview migrations. Apply the committed migrations through the deployment workflow, and verify data survives reload and redeploy. Do not point local migration commands at an existing hosted database without checking the target.

The final delivery message supplies the observed deployed URL and source handoff location. If a repository has not been created or access has not been granted, say so plainly; a local folder or downloadable archive is not repository access. Ownership of a Sites deployment is also distinct from ownership of an external repository.

For an external hosting transfer, reproduce the Worker runtime, protected identity headers, D1 schema and R2 binding, and replace the platform access/authentication layer explicitly. A generic static host cannot run this application. Never trust identity headers directly on an origin exposed outside the Sites authentication boundary.

## Data and maintenance

- Monetary inputs are CZK; totals should use integer hundredths when adding amounts. Excluded items must not count toward claimed costs. Final reduction and conclusion are federation decisions.
- Keep contract periods, deadlines, conditions and cash review thresholds with the contract. A threshold is a review trigger, not a legal determination.
- Preserve request/reply history and author/time for decisions. A later metadata correction must reset organization review so stale confirmation cannot pass submission.
- Do not alter submitted/approved settlements through ordinary organization editing. Supplement requests and resubmission must follow the documented state transition.
- Store only supported PDFs/photos and enforce server-side type/size checks. Downloads require current membership. Original filenames are display metadata, not storage paths.
- Seed fixtures, sample documents and guide responses must remain visibly fictional or limited. ARES/provider failure and OCR limitations must not be hidden behind fabricated results. Browser reading supports files up to 10 MB, up to 100 PDF pages and up to 10 scanned PDF pages per extraction; OCR quality and browser performance vary.
- Export CSV with correct quoting and spreadsheet-formula mitigation. The report downloads a paginated A4 PDF directly using PDF-Lib and an embedded Noto Sans font. It can be printed from a PDF viewer and is an original report, not the missing legacy Excel form.
- Dependencies are pinned by `package-lock.json`; update in a branch and rerun build, type checks and workflow tests.

See [THIRD-PARTY.md](./THIRD-PARTY.md) for copied PDF/OCR runtime and trained-model provenance and license notices.

Never commit credentials, local `.env*` / `.dev.vars*`, invitation tokens, `.wrangler/`, `.sites-runtime/`, uploaded files, production database exports or generated build artifacts. Demo access is handed over separately from committed source.

## Before real customer data

The exercise intentionally supplies no production policy or infrastructure contract. Agree who operates the service and confirm retention, backup/restore, hosting region, access revocation, incident contact, malware handling and AI data processing before introducing real documents. Validate the full rulebook against actual signed contracts and current instructions. These are outstanding production decisions, not claims of certifications or work completed in this handoff.

Back up D1 data and R2 objects as a matched set; database metadata without its objects cannot restore documents. Test a restore in a separate environment. Audit history is an application trail, not a tamper-proof legal archive.
