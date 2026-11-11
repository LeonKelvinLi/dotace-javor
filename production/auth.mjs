import {
  randomBytes,
  createHash,
  scrypt as derive,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { demoAccounts } from "./demo-accounts.mjs";
import { loginPage } from "./login-page.mjs";
const scrypt = promisify(derive);
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safePath = (value) => {
  try {
    const u = new URL(value || "/", "https://local.invalid");
    return u.origin === "https://local.invalid" &&
      !u.pathname.startsWith("/auth/")
      ? u.pathname + u.search
      : "/";
  } catch {
    return "/";
  }
};
export function createAuth({
  db,
  origin,
  demo,
  supabaseUrl,
  supabaseKey,
  enqueue,
  supportEmail,
}) {
  const managed = !demo && Boolean(supabaseUrl && supabaseKey);
  const client = () =>
    createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  const cookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "").split(";").map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i).trim(), v.slice(i + 1)];
      }),
    );
  const cookie = (name, value, maxAge = 28800) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${origin.startsWith("https:") ? "; Secure" : ""}`;
  const setSession = (res, s) =>
    res.setHeader("Set-Cookie", [
      cookie(
        "dotace_access",
        s.access_token,
        Math.max(1, s.expires_in || 3600),
      ),
      cookie("dotace_refresh", s.refresh_token),
    ]);
  const redirect = (res, url) => {
    res.writeHead(303, { Location: url });
    res.end();
  };
  async function addAccount(email, password) {
    const salt = randomBytes(24).toString("hex");
    const derived = Buffer.from(await scrypt(password, salt, 64)).toString(
      "hex",
    );
    await db
      .prepare("INSERT INTO app_accounts VALUES (?,?,?)")
      .bind(email, salt, derived)
      .run();
  }
  async function issueLocal(res, email) {
    const raw = randomBytes(32).toString("hex");
    await db
      .prepare("INSERT INTO app_sessions VALUES (?,?,?)")
      .bind(hash(raw), email, Date.now() + 8 * 3600000)
      .run();
    res.setHeader("Set-Cookie", cookie("dotace_session", raw));
  }
  async function user(req, res) {
    const c = cookies(req);
    if (managed) {
      const auth = client();
      let access = c.dotace_access,
        refresh = c.dotace_refresh;
      let result = access ? await auth.auth.getUser(access) : null;
      if ((!result || result.error) && c.dotace_refresh) {
        const refreshed = await auth.auth.refreshSession({
          refresh_token: c.dotace_refresh,
        });
        if (refreshed.error || !refreshed.data.session) return null;
        setSession(res, refreshed.data.session);
        access = refreshed.data.session.access_token;
        refresh = refreshed.data.session.refresh_token;
        result = await auth.auth.getUser(access);
      }
      const u = result?.data?.user;
      if (!u || !u.email_confirmed_at || !u.email) return null;
      // getUser validates the JWT with the provider before reading its assurance.
      let aal = "aal1";
      try {
        aal =
          JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString())
            .aal || "aal1";
      } catch {}
      return {
        userId: `supabase:${u.id}`,
        email: u.email.toLowerCase(),
        displayName: u.user_metadata?.full_name || u.email,
        fullName: u.user_metadata?.full_name || null,
        aal,
        access,
        refresh,
      };
    }
    const s = c.dotace_session
      ? await db
          .prepare("SELECT email FROM app_sessions WHERE token=? AND expires>?")
          .bind(hash(c.dotace_session), Date.now())
          .first()
      : null;
    const demoAccount = demoAccounts.find((a) => a.email === s?.email);
    return s && (!demo || demoAccount)
      ? {
          userId: `render:${s.email}`,
          email: s.email,
          displayName: demoAccount && demo ? demoAccount.name : s.email,
          fullName: null,
          aal: "aal2",
        }
      : null;
  }
  function page(
    res,
    {
      kind = "login",
      error = "",
      message = "",
      email = "",
      invite = "",
      next = "/",
      reset = "",
    } = {},
  ) {
    const titles = {
      login: ["Přihlášení", "Sign in"],
      register: ["Vytvořit účet", "Create account"],
      forgot: ["Obnovit přístup", "Reset password"],
      password: ["Nové heslo", "New password"],
      account: ["Zabezpečení účtu", "Account security"],
    };
    const copy = (cs, en) =>
      `<span data-cs="${escape(cs)}" data-en="${escape(en)}">${escape(cs)}</span>`;
    if (kind === "login") {
      res.writeHead(error ? 400 : 200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(loginPage({ copy, escape, demo, error, message, email, next, supportEmail }));
      return;
    }
    const title = titles[kind];
    const form =
      kind === "account"
        ? `<p>${copy("Spravujte heslo a dvoufázové ověření svého účtu.", "Manage your password and two-factor authentication.")}</p><p><a href="/account/password">${copy("Změnit heslo", "Change password")}</a></p>${managed ? `<section id="mfa"><h2>${copy("Dvoufázové ověření", "Two-factor authentication")}</h2><p>${copy("Správci musí ověřit přihlášení také kódem z autentizační aplikace.", "Administrators must also verify a code from their authenticator app.")}</p><button type="button" id="mfa-start">${copy("Nastavit / ověřit", "Set up / verify")}</button><div id="mfa-setup"></div><form id="mfa-form" hidden><label for="code">${copy("Šestimístný kód", "Six-digit code")}</label><input id="code" inputmode="numeric" pattern="[0-9]{6}" required autocomplete="one-time-code"><button>${copy("Ověřit", "Verify")}</button></form><p id="mfa-message" role="status"></p></section>` : ""}<p><a href="/">${copy("Zpět do aplikace", "Back to workspace")}</a></p>`
        : `<form method="post" action="/auth/${kind === "forgot" ? "recover" : kind === "password" ? "password" : kind}"><input type="hidden" name="invite" value="${escape(invite)}"><input type="hidden" name="next" value="${escape(next)}"><input type="hidden" name="reset" value="${escape(reset)}">${kind !== "password" ? `<label for="email">E-mail</label><input id="email" name="email" type="email" value="${escape(email)}" required autocomplete="username">` : ""}${kind !== "forgot" ? `<label for="password">${copy(kind === "login" ? "Heslo" : "Heslo (alespoň 12 znaků)", kind === "login" ? "Password" : "Password (at least 12 characters)")}</label><input id="password" name="password" type="password" required minlength="${kind === "login" ? 1 : 12}" maxlength="256" autocomplete="${kind === "login" ? "current-password" : "new-password"}">${kind === "password" || kind === "register" ? `<label for="confirm">${copy("Heslo znovu", "Confirm password")}</label><input id="confirm" name="confirm" type="password" required minlength="12" maxlength="256" autocomplete="new-password">` : ""}` : ""}<button>${copy(kind === "forgot" ? "Poslat odkaz" : kind === "password" ? "Uložit heslo" : kind === "register" ? "Vytvořit účet" : "Přihlásit se", kind === "forgot" ? "Send reset link" : kind === "password" ? "Save password" : kind === "register" ? "Create account" : "Sign in")}</button></form>`;
    res.writeHead(error ? 400 : 200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(
      `<!doctype html><html lang="cs" translate="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Javor · Account</title><link rel="stylesheet" href="/account.css"></head><body><main><nav aria-label="Language"><button type="button" data-lang="cs">Čeština</button><button type="button" data-lang="en">English</button></nav><p class="brand">JAVOR</p><h1>${copy(...title)}</h1>${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}${message ? `<p role="status">${escape(message)}</p>` : ""}${form}<footer>${kind === "login" ? `<p><a href="/forgot-password">${copy("Zapomenuté heslo?", "Forgot password?")}</a></p><p>${copy("První přístup vám pošle správce vaší organizace.", "Your organization administrator will send your first invitation.")}</p>` : `<p><a href="/login">${copy("Zpět na přihlášení", "Back to sign in")}</a></p>`}${supportEmail ? `<a href="mailto:${escape(supportEmail)}">${copy("Potřebuji pomoc", "Get help")}</a>` : ""}</footer></main><script src="/account.js" defer></script></body></html>`,
    );
  }
  async function rate(key, limit = 15, seconds = 600) {
    const id = hash(key + ":" + Math.floor(Date.now() / (seconds * 1000)));
    await db
      .prepare(
        "INSERT INTO rate_limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=rate_limits.count+1",
      )
      .bind(id, Date.now() + seconds * 1000)
      .run();
    return (
      Number(
        (
          await db
            .prepare("SELECT count FROM rate_limits WHERE id=?")
            .bind(id)
            .first()
        ).count,
      ) <= limit
    );
  }
  async function route(req, res, url, body, actor) {
    if (
      demo &&
      !["/auth/login", "/login", "/signin-with-chatgpt", "/signout-with-chatgpt"].includes(url.pathname) &&
      (url.pathname.startsWith("/auth/") ||
        [
          "/login",
          "/forgot-password",
          "/account",
          "/account/password",
          "/signin-with-chatgpt",
          "/signout-with-chatgpt",
        ].includes(url.pathname))
    ) {
      if (req.method === "POST") {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Zkušební účty nelze měnit. / Demo accounts cannot be changed." }));
      } else redirect(res, "/login");
      return true;
    }
    if (req.method === "GET") {
      if (["/login", "/signin-with-chatgpt"].includes(url.pathname)) {
        const invite = demo ? "" : url.searchParams.get("invite") || "";
        page(res, {
          kind: invite ? "register" : "login",
          invite,
          next: safePath(
            url.searchParams.get("next") || url.searchParams.get("return_to"),
          ),
        });
        return true;
      }
      if (url.pathname === "/auth/callback") {
        page(res, { message: "Ověřuji odkaz… / Verifying your link…" });
        return true;
      }
      if (url.pathname === "/forgot-password") {
        page(res, { kind: "forgot" });
        return true;
      }
      if (url.pathname === "/account/password") {
        if (!actor && !url.searchParams.get("reset"))
          redirect(res, "/login?next=/account/password");
        else
          page(res, {
            kind: "password",
            reset: url.searchParams.get("reset") || "",
          });
        return true;
      }
      if (url.pathname === "/account") {
        if (!actor) redirect(res, "/login?next=/account");
        else page(res, { kind: "account" });
        return true;
      }
      if (url.pathname === "/auth/confirm" && managed) {
        const type = url.searchParams.get("type");
        if (!["email", "recovery", "invite"].includes(type)) {
          page(res, { error: "Odkaz není platný. / This link is invalid." });
          return true;
        }
        const result = await client().auth.verifyOtp({
          token_hash: url.searchParams.get("token_hash") || "",
          type,
        });
        if (result.error || !result.data.session)
          page(res, {
            error:
              "Odkaz vypršel nebo už byl použit. Požádejte o nový. / This link expired or was used. Request a new one.",
          });
        else {
          setSession(res, result.data.session);
          redirect(
            res,
            type === "recovery"
              ? "/account/password"
              : safePath(url.searchParams.get("next")),
          );
        }
        return true;
      }
      if (url.pathname === "/signout-with-chatgpt") {
        const c = cookies(req);
        if (c.dotace_session)
          await db
            .prepare("DELETE FROM app_sessions WHERE token=?")
            .bind(hash(c.dotace_session))
            .run();
        if (managed && actor?.access) {
          const a = client();
          await a.auth.setSession({
            access_token: actor.access,
            refresh_token: actor.refresh,
          });
          await a.auth.signOut({ scope: "local" });
        }
        res.setHeader(
          "Set-Cookie",
          ["dotace_session", "dotace_access", "dotace_refresh"].map((n) =>
            cookie(n, "", 0),
          ),
        );
        redirect(res, "/login");
        return true;
      }
    }
    if (req.method !== "POST" || !url.pathname.startsWith("/auth/"))
      return false;
    const f = new URLSearchParams(body.toString());
    const email = (f.get("email") || actor?.email || "").trim().toLowerCase(),
      password = f.get("password") || "",
      invite = f.get("invite") || "";
    const ip = String(
      req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    )
      .split(",")
      .at(-1)
      .trim();
    if (!(await rate("ip:" + ip, 30)) || !(await rate("email:" + email, 12))) {
      res.writeHead(429, { "Retry-After": "600" });
      res.end("Zkuste později. / Too many attempts. Try again later.");
      return true;
    }
    const kind = url.pathname.slice(6);
    const invalid = (message) =>
      page(res, {
        kind: ["register", "password", "recover"].includes(kind)
          ? kind === "recover"
            ? "forgot"
            : kind
          : "login",
        error: message,
        email,
        invite,
        reset: f.get("reset") || "",
        next: safePath(f.get("next")),
      });
    if (
      ["register", "password"].includes(kind) &&
      (password.length < 12 ||
        password.length > 256 ||
        password !== f.get("confirm"))
    ) {
      invalid(
        "Hesla se musí shodovat a mít 12–256 znaků. / Passwords must match and contain 12–256 characters.",
      );
      return true;
    }
    if (kind === "session" && managed) {
      const a = client();
      const verified = await a.auth.getUser(f.get("access_token") || "");
      if (verified.error || !verified.data.user?.email_confirmed_at) {
        invalid("Odkaz není platný. / Invalid link.");
        return true;
      }
      const refreshed = await a.auth.refreshSession({
        refresh_token: f.get("refresh_token") || "",
      });
      if (
        refreshed.error ||
        !refreshed.data.session ||
        refreshed.data.user?.id !== verified.data.user.id
      ) {
        invalid("Odkaz není platný. / Invalid link.");
        return true;
      }
      setSession(res, refreshed.data.session);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          next:
            f.get("type") === "recovery"
              ? "/account/password"
              : safePath(f.get("next")),
        }),
      );
      return true;
    }
    if (kind === "recover") {
      if (managed)
        await client().auth.resetPasswordForEmail(email, {
          redirectTo: origin + "/auth/callback",
        });
      else if (
        await db
          .prepare("SELECT email FROM app_accounts WHERE email=?")
          .bind(email)
          .first()
      ) {
        const token = randomBytes(32).toString("hex");
        await db
          .prepare("INSERT INTO auth_tokens VALUES (?,?,?,?,0)")
          .bind(hash(token), email, "reset", Date.now() + 30 * 60000)
          .run();
        try {
          await enqueue(
            email,
            "Obnovení přístupu / Password reset",
            origin + "/account/password?reset=" + token,
            "reset:" + hash(token),
          );
        } catch {
          console.error(
            JSON.stringify({ event: "recovery_queue_unavailable" }),
          );
        }
      }
      page(res, {
        kind: "forgot",
        message:
          "Pokud účet existuje, obdržíte odkaz k obnovení přístupu. / If the account exists, a reset link will be sent.",
      });
      return true;
    }
    if (kind === "password") {
      if (managed) {
        if (!actor) {
          redirect(res, "/login");
          return true;
        }
        const a = client();
        await a.auth.setSession({
          access_token: actor.access,
          refresh_token: actor.refresh,
        });
        const result = await a.auth.updateUser({ password });
        if (result.error) {
          invalid(
            "Heslo se nepodařilo změnit. Přihlaste se znovu. / Password change failed. Sign in again.",
          );
          return true;
        }
        await a.auth.signOut({ scope: "global" });
      } else {
        const token = f.get("reset");
        const reset = token
          ? await db
              .prepare(
                "SELECT email FROM auth_tokens WHERE token=? AND used=0 AND expires>?",
              )
              .bind(hash(token), Date.now())
              .first()
          : null;
        const target = reset?.email || actor?.email;
        if (!target) {
          invalid("Odkaz není platný. / This link is invalid.");
          return true;
        }
        const salt = randomBytes(24).toString("hex"),
          derived = Buffer.from(await scrypt(password, salt, 64)).toString(
            "hex",
          );
        const statements = reset
          ? [
              db
                .prepare(
                  "UPDATE app_accounts SET salt=?,hash=? WHERE email=? AND EXISTS (SELECT 1 FROM auth_tokens WHERE token=? AND used=0 AND expires>?)",
                )
                .bind(salt, derived, target, hash(token), Date.now()),
              db
                .prepare(
                  "UPDATE auth_tokens SET used=1 WHERE token=? AND used=0 AND changes()>0",
                )
                .bind(hash(token)),
            ]
          : [
              db
                .prepare("UPDATE app_accounts SET salt=?,hash=? WHERE email=?")
                .bind(salt, derived, target),
            ];
        statements.push(
          db.prepare("DELETE FROM app_sessions WHERE email=?").bind(target),
        );
        const result = await db.batch(statements);
        if (!result[0].meta.changes) {
          invalid("Odkaz již byl použit. / This link was already used.");
          return true;
        }
      }
      res.setHeader(
        "Set-Cookie",
        ["dotace_session", "dotace_access", "dotace_refresh"].map((n) =>
          cookie(n, "", 0),
        ),
      );
      page(res, {
        message:
          "Heslo změněno. Přihlaste se novým heslem. / Password changed. Sign in with your new password.",
      });
      return true;
    }
    if (kind === "register") {
      const i = await db
        .prepare(
          "SELECT email,used_by,expires_at FROM invitations WHERE token_hash=?",
        )
        .bind(hash(invite))
        .first();
      if (
        !i ||
        i.email !== email ||
        i.used_by ||
        i.expires_at < new Date().toISOString()
      ) {
        invalid(
          "Pozvánka není platná pro tento e-mail. Požádejte správce o nový odkaz. / Invitation is invalid for this email. Request a new link.",
        );
        return true;
      }
      if (managed) {
        const r = await client().auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              origin +
              "/auth/callback?next=" +
              encodeURIComponent("/?invite=" + invite),
          },
        });
        if (r.error) {
          invalid(
            "Účet nelze vytvořit. Máte-li účet, přihlaste se. / Unable to create account. If you have one, sign in.",
          );
          return true;
        }
        if (r.data.session) {
          setSession(res, r.data.session);
          redirect(res, "/?invite=" + encodeURIComponent(invite));
        } else
          page(res, {
            message:
              "Potvrďte svůj e-mail a potom otevřete pozvánku znovu. / Confirm your email, then open your invitation again.",
          });
        return true;
      }
      if (
        await db
          .prepare("SELECT email FROM app_accounts WHERE email=?")
          .bind(email)
          .first()
      ) {
        invalid(
          "Účet existuje. Přihlaste se a znovu otevřete pozvánku. / Account exists. Sign in and reopen the invitation.",
        );
        return true;
      }
      await addAccount(email, password);
      await issueLocal(res, email);
      redirect(res, "/?invite=" + encodeURIComponent(invite));
      return true;
    }
    if (kind === "login") {
      if (managed) {
        const r = await client().auth.signInWithPassword({ email, password });
        if (r.error || !r.data.session) {
          invalid(
            "E-mail nebo heslo není správné. / Email or password is incorrect.",
          );
          return true;
        }
        setSession(res, r.data.session);
      } else {
        const account = await db
          .prepare("SELECT * FROM app_accounts WHERE email=?")
          .bind(email)
          .first();
        const derived = Buffer.from(
          await scrypt(
            password.slice(0, 256),
            account?.salt || "fixed-dummy-salt",
            64,
          ),
        );
        if (
          !account ||
          password.length > 256 ||
          !timingSafeEqual(derived, Buffer.from(account.hash, "hex"))
        ) {
          invalid(
            "E-mail nebo heslo není správné. / Email or password is incorrect.",
          );
          return true;
        }
        await issueLocal(res, email);
      }
      redirect(
        res,
        invite
          ? "/?invite=" + encodeURIComponent(invite)
          : safePath(f.get("next")),
      );
      return true;
    }
    res.writeHead(404);
    res.end();
    return true;
  }
  async function mfa(actor, action, fields = {}) {
    if (!managed || !actor) throw new Error("Sign in required");
    const a = client();
    await a.auth.setSession({
      access_token: actor.access,
      refresh_token: actor.refresh,
    });
    if (action === "setup") {
      const factors = await a.auth.mfa.listFactors();
      const existing = factors.data?.totp?.find((f) => f.status === "verified");
      if (existing) return { factorId: existing.id };
      const pending =
        factors.data?.totp?.filter((f) => f.status !== "verified") || [];
      for (const f of pending) await a.auth.mfa.unenroll({ factorId: f.id });
      const r = await a.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Javor",
      });
      if (r.error) throw new Error("MFA setup failed");
      return { factorId: r.data.id, qr: r.data.totp.qr_code };
    }
    if (!/^\d{6}$/.test(fields.code || ""))
      throw new Error("Enter a six-digit code");
    const r = await a.auth.mfa.challengeAndVerify({
      factorId: fields.factorId,
      code: fields.code,
    });
    if (r.error) throw new Error("Invalid or expired code");
    return { session: r.data };
  }
  return { user, route, page, rate, addAccount, mfa, setSession, managed };
}
