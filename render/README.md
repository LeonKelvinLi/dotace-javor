# Render hosting

The default Dockerfile now serves the native Node runtime. See [production handover](../docs/PRODUCTION-HANDOVER.md) for client setup, costs, verification and rollback.

`render.yaml` describes the existing shared fictional demo at its previously approved service/disk size. It intentionally sets `DEMO_MODE=true`. Do not use that configuration for real client documents. New production infrastructure is separately proposed in `production/render.production.yaml`; it is not provisioned by this repository change.

Local demo: `npm ci && npm run build`, then `DEMO_MODE=true APP_ORIGIN=http://localhost:10000 npm run start:render`.

`render/server.mjs` is retained only as the legacy Miniflare reference and migration fixture runner. Build it with `npm run build:legacy` if needed; never select it for a new client production deployment.
