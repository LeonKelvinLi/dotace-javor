import http from "node:http";
import { Readable } from "node:stream";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/node";
import { openDatabase } from "./database.mjs";
import { localBucket, managedBucket } from "./storage.mjs";
import { createAuth, escape } from "./auth.mjs";
import { createOutbox } from "./outbox.mjs";
import { scanFile } from "./scanner.mjs";
import { migrateLegacy } from "./migrate-legacy.mjs";
import { demoAccounts, prepareDemoAccounts } from "./demo-accounts.mjs";
import {
  env,
  withIdentity,
  routes,
  requireActor,
  identity,
  command,
  seedDemo,
} from "../dist/api.mjs";

const production = process.env.APP_ENV === "production";
const demo = process.env.DEMO_MODE === "true";
if (process.env.RENDER && !demo && !production)
  throw new Error("Protected Render services must set APP_ENV=production");
const origin =
  process.env.APP_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${process.env.PORT || 10000}`;
const directory = path.resolve(
  process.env.DATA_DIR || ".render-data",
  "native",
  demo ? "public-demo" : "private",
);
if (production) {
  for (const name of [
    "APP_ORIGIN",
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STORAGE_BUCKET",
    "OWNER_EMAIL",
    "SUPPORT_EMAIL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "OUTBOX_KEY",
    "SENTRY_DSN",
    "STORAGE_QUOTA_BYTES",
    "CLAMAV_HOST",
  ])
    if (!process.env[name]) throw new Error(`Production requires ${name}`);
  if (
    demo ||
    process.env.SEED_DEMO === "true" ||
    !origin.startsWith("https://") ||
    process.env.PG_SSL === "false"
  )
    throw new Error(
      "Production forbids demo data, HTTP origins and unverified database TLS",
    );
}
if (
  process.env.STORAGE_QUOTA_BYTES &&
  (!Number.isSafeInteger(Number(process.env.STORAGE_QUOTA_BYTES)) ||
    Number(process.env.STORAGE_QUOTA_BYTES) < 10485760)
)
  throw new Error("STORAGE_QUOTA_BYTES must be an integer of at least 10 MB");
if (
  !demo &&
  !production &&
  !process.env.SUPABASE_URL &&
  (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
)
  throw new Error(
    "Local protected mode requires ADMIN_EMAIL and ADMIN_PASSWORD",
  );
if (
  !demo &&
  process.env.ADMIN_PASSWORD &&
  process.env.ADMIN_PASSWORD.length < 12
)
  throw new Error("Local password must have at least 12 characters");
if (process.env.SENTRY_DSN)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV || "demo",
    release: process.env.RENDER_GIT_COMMIT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      return event;
    },
  });
const db = await openDatabase({
  directory,
  connectionString: process.env.DATABASE_URL,
});
const service =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
    : null;
if (service) {
  const { data, error } = await service.storage.getBucket(
    process.env.STORAGE_BUCKET,
  );
  if (error || !data || data.public)
    throw new Error("A private storage bucket must exist before startup");
}
const bucket = service
  ? managedBucket(service, process.env.STORAGE_BUCKET)
  : localBucket(directory);
if (!production && !service)
  await migrateLegacy(
    db,
    bucket,
    path.resolve(
      process.env.DATA_DIR || ".render-data",
      demo ? "public-demo" : ".",
    ),
  );
const mail = createOutbox({
  db,
  key: process.env.OUTBOX_KEY,
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  origin,
});
const auth = createAuth({
  db,
  origin,
  demo,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  enqueue: mail.enqueue,
  supportEmail: process.env.SUPPORT_EMAIL,
});
if (
  !demo &&
  !auth.managed &&
  !(await db
    .prepare("SELECT email FROM app_accounts WHERE email=?")
    .bind(process.env.ADMIN_EMAIL.toLowerCase())
    .first())
)
  await auth.addAccount(
    process.env.ADMIN_EMAIL.toLowerCase(),
    process.env.ADMIN_PASSWORD,
  );
Object.assign(env, {
  ...(process.env.CLAMAV_HOST ? { SCAN_FILE: scanFile } : {}),
  DB: db,
  BUCKET: bucket,
  NATIVE_RUNTIME: "true",
  DEMO_MODE: String(demo),
  SEED_DEMO: process.env.SEED_DEMO || "false",
  OWNER_EMAIL: demo ? demoAccounts[0].email : process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL,
  STORAGE_QUOTA_BYTES:
    process.env.STORAGE_QUOTA_BYTES || String(512 * 1024 * 1024),
  ...(!demo && process.env.OPENAI_API_KEY
    ? {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
      }
    : {}),
  ...(process.env.RESEND_API_KEY
    ? { ENCRYPT_EMAIL: mail.encrypt, EMAIL_ORIGIN: origin }
    : {}),
});
if (demo) await prepareDemoAccounts(db, auth, bucket, seedDemo);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".gz": "application/gzip",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
};
const staticRoot = path.resolve("dist/client");
const sendJSON = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
const redirect = (res, target) => {
  res.writeHead(303, { Location: target });
  res.end();
};
async function body(req, limit) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw Object.assign(new Error("Request too large"), { status: 413 });
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}
let draining = false,
  active = 0;
const server = http.createServer(
  { requestTimeout: 60000, headersTimeout: 20000, maxHeaderSize: 16384 },
  async (req, res) => {
    const requestId = crypto.randomUUID();
    active++;
    res.on("close", () => active--);
    res.setHeader("X-Request-ID", requestId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (origin.startsWith("https:"))
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    try {
      const url = new URL(req.url, origin);
      if (!["GET", "HEAD", "POST"].includes(req.method)) {
        res.setHeader("Allow", "GET, HEAD, POST");
        return sendJSON(res, 405, { error: "Method not allowed" });
      }
      if (
        req.method === "POST" &&
        (req.headers.origin !== origin ||
          req.headers["sec-fetch-site"] === "cross-site")
      )
        return sendJSON(res, 403, { error: "Invalid origin" });
      if (url.pathname === "/health") {
        if (draining) return sendJSON(res, 503, { ok: false });
        await db.prepare("SELECT 1").first();
        return sendJSON(res, 200, { ok: true });
      }
      // Assets contain no user data. Stream them instead of buffering large OCR files.
      const staticPath = path.resolve(
        staticRoot,
        "." + decodeURIComponent(url.pathname),
      );
      if (
        ["GET", "HEAD"].includes(req.method) &&
        staticPath.startsWith(staticRoot + path.sep) &&
        url.pathname !== "/index.html"
      ) {
        const info = await stat(staticPath).catch(() => null);
        if (info?.isFile()) {
          res.setHeader(
            "Content-Type",
            contentTypes[path.extname(staticPath)] ||
              "application/octet-stream",
          );
          res.setHeader("Content-Length", info.size);
          res.setHeader(
            "Cache-Control",
            url.pathname.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          );
          if (req.method === "HEAD") return res.end();
          const { createReadStream } = await import("node:fs");
          return createReadStream(staticPath).pipe(res);
        }
      }
      if (url.pathname === "/api/files" && req.method === "POST" && active > 5)
        return sendJSON(res, 503, {
          error: "Server is busy. Try again shortly.",
        });
      const actor = await auth.user(req, res);
      const payload =
        req.method === "POST"
          ? await body(
              req,
              url.pathname === "/api/files" ? 11 * 1024 * 1024 : 250000,
            )
          : Buffer.alloc(0);
      if (await auth.route(req, res, url, payload, actor)) return;
      if (!actor) {
        if (url.pathname.startsWith("/api/"))
          return sendJSON(res, 401, {
            error: "Přihlaste se znovu. / Please sign in again.",
            code: "SESSION_EXPIRED",
          });
        return redirect(
          res,
          "/login?" +
            (url.searchParams.get("invite")
              ? "invite=" + encodeURIComponent(url.searchParams.get("invite"))
              : "next=" + encodeURIComponent(url.pathname + url.search)),
        );
      }
      if (url.pathname === "/api/account/mfa" && req.method === "POST") {
        if (!(await auth.rate("mfa:" + actor.userId, 8)))
          return sendJSON(res, 429, { error: "Try again later" });
        const fields = JSON.parse(payload.toString()),
          result = await auth.mfa(actor, fields.action, fields);
        if (result.session) {
          auth.setSession(res, result.session);
          return sendJSON(res, 200, { ok: true });
        }
        return sendJSON(res, 200, result);
      }
      return await withIdentity(actor, async () => {
        const ctx = await identity();
        if (
          production &&
          ctx.member &&
          ctx.member.role !== "member" &&
          actor.aal !== "aal2"
        ) {
          if (url.pathname.startsWith("/api/"))
            return sendJSON(res, 403, {
              error:
                "Ověřte přihlášení na stránce zabezpečení. / Verify your sign-in on the account security page.",
              code: "MFA_REQUIRED",
              href: "/account",
            });
          return redirect(res, "/account");
        }
        if (url.pathname === "/access") {
          const current = await requireActor();
          if (current.member.role === "member")
            return sendJSON(res, 403, { error: "Administrator required" });
          if (req.method === "POST") {
            const fields = new URLSearchParams(payload.toString());
            await command(current, fields.get("action"), {
              id: fields.get("id"),
            });
            return redirect(res, "/access");
          }
          const members = (
            await db.prepare("SELECT data FROM memberships").all()
          ).results
            .map((r) => JSON.parse(r.data))
            .filter(
              (m) =>
                current.member.role === "federation" ||
                m.organizationId === current.member.organizationId,
            );
          const invitations = (
            await db
              .prepare(
                "SELECT id,email,role,organization_id,expires_at FROM invitations WHERE used_by IS NULL AND expires_at>?",
              )
              .bind(new Date().toISOString())
              .all()
          ).results.filter(
            (i) =>
              current.member.role === "federation" ||
              i.organization_id === current.member.organizationId,
          );
          const form = (action, id, label) =>
            `<form method="post" action="/access"><input type="hidden" name="action" value="${action}"><input type="hidden" name="id" value="${escape(id)}"><button>${label}</button></form>`;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(
            `<!doctype html><html lang="cs"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Javor · Přístupy / Access</title><link rel="stylesheet" href="/account.css?v=${escape(process.env.RENDER_GIT_COMMIT || "local")}"></head><body><main><a href="/">← Zpět / Back</a><h1>Přístupy / Access</h1><p>Odebrání přístupu platí ihned. Historie a doklady zůstanou zachovány.<br>Removing access takes effect immediately. Records and history remain.</p><h2>Členové / Members</h2>${members.map((m) => `<section><h3>${escape(m.email)}</h3><p>${escape(m.role)} · ${m.disabled ? "Odebrán / Removed" : "Aktivní / Active"}</p>${m.userId !== actor.userId ? form(m.disabled ? "enableMember" : "disableMember", m.id, m.disabled ? "Obnovit přístup / Restore access" : "Odebrat přístup / Remove access") : ""}</section>`).join("")}<h2>Pozvánky / Invitations</h2>${invitations.map((i) => `<section><p>${escape(i.email)} · ${escape(i.expires_at.slice(0, 10))}</p>${form("revokeInvite", i.id, "Zrušit pozvánku / Revoke invitation")}</section>`).join("") || "<p>Žádné čekající pozvánky / No pending invitations</p>"}</main></body></html>`,
          );
        }
        if (url.pathname === "/api/client-error") {
          await requireActor();
          if (await auth.rate("client-error:" + actor.userId, 10))
            Sentry.captureMessage("Client rendering failed");
          return sendJSON(res, 202, { ok: true });
        }
        const route = routes[url.pathname];
        if (route) {
          if (
            !(await auth.rate(
              "api:" + actor.userId,
              req.method === "POST" ? 100 : 600,
              60,
            ))
          )
            return sendJSON(res, 429, {
              error: "Příliš mnoho požadavků. / Too many requests.",
            });
          if (
            req.method === "POST" &&
            url.pathname === "/api/files" &&
            active > 8
          )
            return sendJSON(res, 503, {
              error: "Server is busy. Try again shortly.",
            });
          const handler = route[req.method];
          if (!handler)
            return sendJSON(res, 405, { error: "Method not allowed" });
          const headers = new Headers();
          for (const name of ["content-type", "origin"])
            if (req.headers[name]) headers.set(name, req.headers[name]);
          const result = await handler(
            new Request(url, {
              method: req.method,
              headers,
              ...(req.method === "POST" ? { body: payload } : {}),
            }),
          );
          for (const [key, value] of result.headers) res.setHeader(key, value);
          res.statusCode = result.status;
          if (result.body) Readable.fromWeb(result.body).pipe(res);
          else res.end();
          return;
        }
        if (url.pathname.startsWith("/api/"))
          return sendJSON(res, 404, { error: "Not found" });
        if (req.method !== "GET" && req.method !== "HEAD")
          return sendJSON(res, 405, { error: "Method not allowed" });
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(
          req.method === "HEAD"
            ? undefined
            : await readFile(path.join(staticRoot, "index.html")),
        );
      });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error(
          JSON.stringify({
            event: "request_failed",
            requestId,
            type: error.constructor.name,
          }),
        );
        Sentry.captureException(new Error("Server operation failed"), {
          extra: { requestId, type: error.constructor.name },
        });
      }
      if (!res.headersSent)
        sendJSON(res, status, {
          error:
            status < 500
              ? error.message
              : "Operace se nezdařila. Zkuste znovu. / Operation failed. Please try again.",
          requestId,
        });
      else res.end();
    }
  },
);
server.keepAliveTimeout = 5000;
const timer = setInterval(
  () =>
    void mail
      .tick()
      .catch(() => console.error(JSON.stringify({ event: "outbox_failed" }))),
  15000,
);
timer.unref();
const cleanup = setInterval(
  () =>
    void db
      .batch([
        db.prepare("DELETE FROM rate_limits WHERE expires<?").bind(Date.now()),
        db.prepare("DELETE FROM app_sessions WHERE expires<?").bind(Date.now()),
        db.prepare("DELETE FROM auth_tokens WHERE expires<?").bind(Date.now()),
      ])
      .catch(() => {}),
  3600000,
);
cleanup.unref();
server.listen(Number(process.env.PORT || 10000), "0.0.0.0", () =>
  console.log(
    JSON.stringify({
      event: "ready",
      mode: production ? "production" : demo ? "demo" : "local",
      database: db.postgres ? "postgres" : "sqlite",
    }),
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    draining = true;
    clearInterval(timer);
    clearInterval(cleanup);
    server.close(async () => {
      await db.close();
      await Sentry.close(2000);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 25000).unref();
  });
