# Javor · Grant settlements

[Public demo](https://dotace-javor-99x6.onrender.com/) · [Source](https://github.com/LeonKelvinLi/dotace-javor)

Organizations upload expense evidence, check the extracted details, and submit a settlement against a grant contract. Federation reviewers accept or reject expenses, request missing information, and approve the final settlement. Originals and the decision history remain attached to each contract.

The public demo is a shared fictional workspace without login. **Never upload client information there.** Client production is a separate, authenticated deployment with its own database and storage. This repository now includes the production implementation and deployment configuration; provider provisioning and the client acceptance gates are documented below.

## Run locally

Node **24** is required for the native runtime.

```sh
npm ci
npm run build
DEMO_MODE=true APP_ORIGIN=http://localhost:10000 npm run start:render
```

Open [localhost:10000](http://localhost:10000). Czech opens by default; choose English in the header. Demo data persists under `.render-data/native/public-demo`. For an empty protected local workspace, set `ADMIN_EMAIL`, a synthetic `ADMIN_PASSWORD` of at least 12 characters, `APP_ORIGIN`, and `DEMO_MODE=false` in your shell; then run the same server command. `SEED_DEMO=true` explicitly enables fictional fixtures for local testing only. Production refuses that setting.

## Production architecture

- React/Vite client and a native Node HTTP/API server. No Cloudflare simulator in the serving process.
- Supabase verified authentication, password recovery, invite-bound application membership and TOTP for administrators.
- PostgreSQL with transactional updates, organization authorization, optimistic version checks and immutable audit events. All application tables have RLS enabled with no public data-API policies.
- Private Supabase object storage. Original-file access always passes through application authorization. File type, per-file limit, total quota and configured ClamAV checks run before an original becomes available.
- Browser OCR processes visible pages automatically. Local extraction does not need a paid AI API. Optional OpenAI extraction/advice remains server-side, bounded, and requires human review.
- Encrypted, retrying Resend outbox for invitations and workflow updates; password verification/recovery email is handled by Supabase Auth with a configured SMTP provider.
- Sentry errors without request bodies or document content; health endpoint; graceful shutdown; CI on PRs and pushes.
- Encrypted application backups include database records and independently verified original files. Restore refuses occupied destinations.

## Verify

```sh
npm run check
```

This runs lint, types, unit/domain tests, backend integration scenarios, the client build, native HTTP/authentication tests, and backup/outbox tests. CI also exercises PostgreSQL and builds the container. See [production handover](docs/PRODUCTION-HANDOVER.md) for provider checks that cannot be established by local tests.

## Client handover

- [Production setup, costs, operations and release gates](docs/PRODUCTION-HANDOVER.md)
- [Cold audit of the previous deployment](docs/CLIENT-READINESS-AUDIT.md)
- [User walkthrough](docs/WALKTHROUGH.md)
- [Original exercise scope](docs/SCOPE.md)

The original exercise packet and sales prototype remain in the parent directory. Earlier Sites/Worker instructions describe the previous runtime; the native production handover supersedes those deployment instructions. The fictional training extracts are not authoritative eligibility rules: the client must supply current contracts, grant rules, reporting requirements and retention policy before using real records.
