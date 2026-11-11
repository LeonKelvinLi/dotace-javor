# Client production handover — 11 November 2026

## Status and ownership

The implementation is prepared for a separate client environment. The existing Render URL remains a public fictional demo. No new paid service has been ordered. Do not remove authentication from a client deployment or put real records in the demo.

**Local verification does not establish a working production provider account.** Before launch, the client must own the infrastructure, approve costs, configure domains and supply the current business policies. The external acceptance checklist below is a release gate, not a claim that those checks already passed.

## What changed

The application now serves through Node rather than a local Cloudflare simulation. Managed PostgreSQL, Supabase Auth and private Storage are production requirements; SQLite and filesystem objects remain available for isolated local tests and the fictional demo. Production starts empty, elects only the configured verified owner email, and rejects demo seeding or insecure database TLS. Database row policies deny anonymous data-API access; application access is checked on every request.

Accounts have sign-in, invitation registration, verification links, forgotten-password recovery, account settings and administrator TOTP. Access management removes/restores members and revokes invitations. Removing a member immediately blocks records and original files; historical attribution stays. Own-access removal is blocked. Supabase owns identity; this application owns organization membership. Invitations do not grant access until the matching verified email accepts the one-use token.

Expense forms warn before closing after edits. Drafts are stored per account, contract and expense in **this tab's session storage**, expire after eight hours, and are cleared after successful save. They are not a shared/server draft or an audit entry. A stale saved-record version prevents restoring an old draft over newer server data. When a session expires, a visible sign-in link opens another tab while the current form remains intact. Browser storage can be disabled or cleared, so this recovery is best-effort; save the record for durable storage.

Uploads are limited to actual PDF/JPEG/PNG/WebP signatures and 10 MB. Production requires a private clamd scanner endpoint; a failed or unavailable scan prevents publishing an original. Application-wide quota is checked transactionally. Private downloads are authorized and sandboxed. Upload failures clean up their newly created object; files removed from an expense remain in evidence storage and are not silently deleted.

Resend messages are encrypted at rest with OUTBOX_KEY, retried with backoff and idempotency keys, and marked accepted only after the provider returns success. This means provider acceptance, not inbox delivery. Submission, return, approval, information request and reply events notify the relevant active members. Authentication verification/recovery uses Supabase's SMTP configuration. The application never emails real recipients during local tests.

## Client-owned services and expected recurring cost

Prices checked against the official pages on 11 November 2026; USD, before tax, bandwidth/usage overages and domain registration. These are proposals, not purchases.

| Service | Purpose | Expected monthly cost |
|---|---|---:|
| [Render 1c-2g](https://render.com/pricing) | Native application server, Frankfurt | $25 |
| [Supabase Pro](https://supabase.com/pricing) | Auth, Postgres, private originals, one Micro project | $25 |
| Existing private ClamAV service **or** [Render 2c-4g](https://render.com/pricing) | Scan uploaded originals before release | $0 if supplied; $85 for a dedicated Render instance |
| [Resend](https://resend.com/pricing) | Auth SMTP, invitations and workflow mail | $0 within 3,000/month and 100/day; $20 Pro if needed |
| [Sentry](https://sentry.io/pricing/) | Error alerts | $0 for one operator; $29 monthly Team for shared operations |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | Independent encrypted backup archives | Budget $0–5 initially; storage above the allowance is $0.015/GB-month plus operations |

Core application and database: **$50/month**, plus the supplied scanner and backup service. With a new dedicated 4 GB scanner: **$135/month** before optional plans. ClamAV recommends 3–4 GiB RAM; the scanner cannot be assumed to fit beside the app in its 2 GB instance. [ClamAV requirements](https://docs.clamav.net/Introduction.html).

If both client and developer need shared hosting access, Render Pro workspace adds $25/month. A separate staging app and extra Supabase Micro project are approximately $17/month. With scanner, shared Render workspace, staging and Sentry Team, budget approximately **$206–231/month** including $0–20 Resend and $0–5 backups. An existing client scanner/monitoring service reduces this substantially. AI is optional, disabled by default, and excluded from these totals. Review usage before enabling any AI billing.

## Provisioning order

1. Agree owner/operator emails, regions, domain, sender domain, roles, retention, recovery targets and budget. Use client-owned accounts with MFA and separate staging/production projects. Do not reuse credentials from another project.
2. Create Supabase in the agreed EU region. Enable email confirmation and TOTP, disable unneeded providers, configure session lifetimes and password requirements, and connect a verified Resend SMTP sender. Set Site URL to APP_ORIGIN and allow exactly the app's `/auth/callback` (including invitation next parameter) and `/account/password` redirects. Do not allow arbitrary wildcard domains. Create the initial owner account using Supabase's controlled admin invitation and verify its email.
3. Create a **private** `originals` bucket; set its 10 MB limit and permitted MIME types. Do not create public read policies. The service-role key is server-only. Startup checks that the bucket exists and is private. Production tables have RLS enabled without anon/authenticated policies. Use the project's verified-TLS direct/session-pool connection and trusted CA when required. Never set PG_SSL=false in production.
4. Supply a private ClamAV endpoint with updated signatures. It must not be internet-accessible. The adapter uses clamd INSTREAM on port 3310, a 30-second timeout and fail-closed responses. An existing client endpoint is preferred. If one must be hosted, approve its separate cost before provisioning. Test clean documents, the standard harmless EICAR test file, scanner downtime and stale signatures. The current code does not attest signature freshness automatically; the scanner operator must monitor it.
5. Create a Sentry project with no personal data capture, alert ownership and a support mailbox. Configure an independent uptime alert for `/health`. Set alerts on failed outbox messages, database errors, backup age, storage quota and scanner signature age. The app logs request IDs and error types, not document bodies or tokens.
6. Copy `production/render.production.yaml` to the repository root for the client Blueprint, or set its values in a client-owned Render web service. It is a proposal and is not applied automatically. Use APP_ENV=production, DEMO_MODE=false, a fixed HTTPS APP_ORIGIN and the required secrets. Supply OUTBOX_KEY as 32 random bytes encoded in base64, securely and outside Git. Keep the key in the client password manager; losing it makes queued messages unreadable. Do not set ADMIN_PASSWORD for managed production.
7. Configure an independent encrypted backup destination and scheduler. Supply BACKUP_KEY separately from the archive and OUTBOX_KEY. Start with nightly backups and 30-day retention only after the client accepts a possible 24-hour recovery-point window. A tighter RPO needs more frequent backups or the provider's PITR plan, with separate approval. Database backups alone do **not** include stored originals. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups).
8. Run the staging acceptance checklist. Promote the same green commit only after provider evidence and client acceptance. No actual client data belongs in staging.

## Required environment

`APP_ENV=production`, `APP_ORIGIN`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BUCKET`, `OWNER_EMAIL`, `SUPPORT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `OUTBOX_KEY`, `SENTRY_DSN`, `STORAGE_QUOTA_BYTES`, `CLAMAV_HOST`; optional `CLAMAV_PORT`, `PG_CA`, `OPENAI_API_KEY`, `OPENAI_MODEL`.

The committed proposal uses a 10 GB application quota. Pick this from the client's volume and retention estimate; it is separate from provider billing limits. Production startup rejects missing required configuration, demo mode/seeding, HTTP origins, disabled database TLS and public buckets. No secret is bundled into the browser.

## Backups and restore drill

From a trusted operator environment with the correct database/storage credentials and BACKUP_KEY:

```sh
node production/backup-cli.mjs create /secure/path/settlement-YYYY-MM-DD.javor
```

The archive uses authenticated AES-256-GCM. Record reads use a consistent database snapshot; every original is checked for size and SHA-256. The archive contains records, audit history, memberships, invitations, queued mail and local-account password hashes when applicable. It intentionally excludes active sessions. Supabase Auth accounts remain a provider-managed recovery responsibility; recover that project/identity database together with app memberships, which reference immutable provider IDs. Copy the completed encrypted archive to the client's private offsite destination, verify its checksum and alert if a scheduled run fails. The CLI does not itself create a scheduler or an R2 bucket.

For a drill, point DATABASE_URL and bucket credentials to a **different empty project/bucket** or DATA_DIR to an empty isolated folder, then:

```sh
CONFIRM_ISOLATED_RESTORE=true node production/backup-cli.mjs restore /secure/path/settlement-YYYY-MM-DD.javor
```

Restore refuses any occupied application database. Verify row counts, financial totals, audit history and original hashes, sign in with the correct restored identity, and exercise a synthetic settlement. Record actual recovery duration and have the client accept RPO/RTO. Restoring an application archive does not roll back the authentication provider or provider settings. Do not restore over a live client database.

## Deployment, migration and rollback

`npm run check` must pass. CI runs the same application checks, actual PostgreSQL backend and HTTP tests, dependency audit and Docker build. Configure the `verify` check as a branch-protection requirement with review by a second maintainer before client launch.

The container uses a short bootstrap step for old fictional Render data, then runs Node as the unprivileged `node` user under tini. Native files live in `/var/data/native/<mode>`. The first demo boot reads the previous Miniflare database and object index, verifies every original and copies them into the native store transactionally. Legacy files are left untouched. A missing or mismatched original aborts migration; it is not silently skipped. Managed production does not import the public demo.

Use an additive schema change, take a successful verified backup before database changes, deploy to staging, and check health/login/upload/review/export. Keep a release ledger with Git SHA and provider deploy ID. For a code-only rollback within the native runtime, redeploy the previous verified native image against the current compatible schema. Returning to the old Miniflare image exposes its old snapshot and will omit records created after migration; reconcile/export new records first. Do not describe that as a lossless database rollback.

## External acceptance gates still required

- Real Supabase owner invitation, verified-email registration, expired/reused invitation, password reset email, TOTP enrollment/challenge, lost-device support procedure, logout and account removal; verify with separate users and unrelated organizations.
- Ensure an anonymous/ordinary authenticated Supabase API token cannot read application tables or objects. Verify no raw service key appears in browser assets/network responses.
- Real private storage upload/download, clean and rejected scans, outage recovery, transactional quota, replica restart and region configuration.
- Actual Resend accepted/delivered/bounced events and recipient inbox proof; no local mock can establish inbox delivery. Confirm workflow recipients and support escalation.
- Scheduled offsite backup plus a timed restore of the managed database, provider identities and original objects. The automated local restore test is not that proof.
- Error and uptime alerts delivered to the named operator; test an error without sending document content. Confirm failed-email monitoring and manual reconciliation before retrying a message past the provider's idempotency window.
- Representative load/soak testing with the agreed organization, expense and file volumes. The current state endpoint returns all authorized records, so this is a modest-volume deployment, not a demonstrated unlimited-scale architecture. Add server-side pagination before a large rollout.
- Current approved grant rules, cash policy, report format, retention/deletion rules, privacy notice and processing terms; accessibility/mobile acceptance with client users. Application checks cannot decide these policies.

## Evidence from this implementation

Local unit and settlement tests, HTTP authorization/restart tests and the same backend workflow against PostgreSQL pass. Backup tests restore records and original bytes, reject corruption and occupied destinations, and preserve existing archives. Outbox tests cover encrypted payloads and retry/idempotency behavior with a synthetic provider. Chrome exercised English/Czech navigation, real OCR of the sample invoice, form-close warning, draft recovery, saving the checked expense, protected sign-in, the empty workspace, account settings and access management. A real browser form exposed a Referrer-Policy/Origin incompatibility that was fixed and retested. [Browser header behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).

The code and local evidence do not certify production readiness while the external gates above are unresolved.
