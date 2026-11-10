# Dotace · Sportovní federace Javor

[Open the deployed app](https://dotace-javor-pilot.splk6.chatgpt.site) · [Source repository](https://github.com/LeonKelvinLi/dotace-javor)

The application and repository are private to the owner; reviewer access must be arranged separately.

A working Czech grant-settlement application built from the fictional client handoff. The original sales prototype and exercise packet are preserved in the parent directory; this folder is the implemented application.

Organizations prepare receipts against individual contracts. Formal checks require supporting originals and explanations for exceptions. A lead administrator submits a declaration; federation staff review items, request clarification, reject with reasons and conclude the settlement with a grant reduction. The original documents and the complete decision trail remain attached to their contract.

## Start

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_round_madelyne_pryor.sql
npm run dev
```

Open the printed localhost URL. The development sign-in creates a local test identity, not a production account. Local D1 and R2 data persist in ignored `.wrangler/state/`. Apply the migration only to a new local database. Later schema updates append migrations.

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
```

## Included

- Organizations, contacts and statutory representatives; contracts and supporting conditions, decisions and amendments.
- Real sign-in and server-enforced federation / organization administrator / member permissions.
- Original PDF, JPG, PNG and WebP uploads, private viewing, SHA-256, 10 MB per-file limit.
- Actual PDF text extraction and local Czech/English OCR for photographs and scanned PDFs. OCR assets are served by this app.
- Editable extraction proposals, all simultaneous review findings, separate organization and federation decisions.
- Partial claims and personal-recipient explanations; other-company recipient blocking; no invented cash threshold.
- Submitted-data locks, optimistic version conflicts, supplement request/reply history and immutable application audit events.
- Bulk acceptance, random selection for spot checks, final conclusion/reduction, three cost groups, CSV export and a direct, paginated PDF report download with Czech typography.
- Expiring one-use invitation links; feedback; live ARES lookup on explicit request.
- Server-side OpenAI integration for document extraction and a source-grounded adviser when a project key is configured. Without that key the app explicitly offers browser OCR and a limited document guide.

## Handoff

- [Implemented scope, evidence and unresolved policy](docs/SCOPE.md)
- [Setup, access and maintenance](docs/HANDOVER.md)
- [Short walkthrough and acceptance checklist](docs/WALKTHROUGH.md)
- [Verification record](docs/VERIFICATION.md)

Initial hosting is private to the owner. A reviewer needs both hosting access and an application invitation. No email is sent by the app. Fictional fixtures and their PDF originals are clearly labelled; no original client system is accessed. The client supplied no current signed contracts, authoritative SFJ instructions or ASP decision, so real eligibility cannot be inferred from the 2025 training extracts.

## AI configuration

Secrets belong in ignored `.dev.vars` for local Workers and in the hosting platform's secret store for deployment. Use `OPENAI_API_KEY`; `OPENAI_MODEL` defaults to `gpt-5.4-mini`. Never commit keys. AI requests use the Responses API with `store:false`, a 60-second timeout, bounded output and a durable 30 requests/hour/user limit. Actual uploaded policy documents and contract conditions are supplied to the adviser. Every suggestion needs human confirmation and does not alter review decisions automatically.

## Hosting

React / Vinext runs on a Cloudflare Worker. D1 stores records and R2 stores originals; `.openai/hosting.json` declares the bindings. The Sites deployment workflow builds and publishes the Worker and applies production migrations. Production identity headers must come from the trusted hosting authentication boundary. See the handover for moving to another host and replacing that boundary safely.
