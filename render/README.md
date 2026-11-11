# Render hosting adapter

[Open the homework demo](https://dotace-javor-99x6.onrender.com/) without a login. Choose **English**, then **Try the sample settlement**. The workspace is shared: use fictional test documents only.

Render runs the built Worker under Workerd/Miniflare behind a Node HTTP gateway. Client-supplied identity headers are discarded. `render.yaml` provisions one Oregon web service with 512 MB RAM and a 1 GB persistent disk at `/var/data`. The original Sites deployment and its storage remain separate.

## Homework mode

Set `DEMO_MODE=true` explicitly. The gateway uses a fixed demo identity with access to the full fictional workflow. It requires no account, password or session cookie. Login/logout routes redirect to the app, invitations are disabled, and optional paid OpenAI bindings are withheld even if a key exists in the environment. Browser OCR works independently.

The demo database, original files and related state live under `${DATA_DIR}/public-demo`. Existing authenticated storage under `${DATA_DIR}` is never copied into the public demo. Switching the flag off returns to that protected workspace. Demo edits persist across restarts and are visible to other visitors. Do not upload personal or real financial documents. This mode is intended for the homework exercise, not private production records.

```sh
npm ci
npm run build
DEMO_MODE=true DATA_DIR='.render-data' PORT=5180 npm run start:render
```

## Authenticated mode

Leave `DEMO_MODE` unset or set it to `false`. Set `ADMIN_EMAIL` and a random `ADMIN_PASSWORD` of at least 20 characters. The initial administrator is provisioned before the listener opens. Existing password hashes are not replaced by changing the environment variable.

All other accounts require an email-bound invitation and a password of at least 12 characters. Sessions expire after eight hours; password hashes use scrypt; login attempts are rate limited. Real records require authenticated mode, appropriate access controls and backups. Secrets and uploaded data must not enter source control.

```sh
ADMIN_PASSWORD='<local test secret of 20+ characters>' DATA_DIR='.render-data' PORT=5180 npm run start:render
```

The persistent disk is required for retained records. This is a single-instance deployment; disk deployments have a brief interruption. OpenAI is optional and currently unconfigured. Browser OCR, review workflows, explicit ARES lookup and PDF/CSV reports run without it.

## Verification

After building, `npm run test:render` checks authenticated access, scoped invitations, concurrent writes and restart persistence. `npm run test:demo` checks anonymous use, paid-AI exclusion, account controls, upload/save, restart persistence and isolation when switching between public and authenticated modes.

[Render dashboard](https://dashboard.render.com/web/srv-dbpmmcuc6qcc73dgg7rg) · [Verification record](../docs/VERIFICATION.md)
