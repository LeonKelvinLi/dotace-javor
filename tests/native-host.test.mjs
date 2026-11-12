import assert from "node:assert/strict";
import { randomBytes, createDecipheriv } from "node:crypto";
import { openDatabase } from "../production/database.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { once } from "node:events";
const data = await mkdtemp(tmpdir() + "/dotace-render-");
const origin = "http://127.0.0.1:5189";
let child;
const outboxKey = randomBytes(32).toString("base64");
async function start() {
  child = spawn(process.execPath, ["production/server.mjs"], {
    env: {
      ...process.env,
      ADMIN_PASSWORD: "fixture-only-admin-password-123456",
      DATA_DIR: data,
      PORT: "5189",
      APP_ORIGIN: origin,
      ADMIN_EMAIL: "admin@javor.example",
      SEED_DEMO: "true",
      OUTBOX_KEY: outboxKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Gateway startup timed out")),
      15000,
    );
    child.stdout.on("data", (x) => {
      output += x;
      if (output.includes('"event":"ready"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (c) => {
      clearTimeout(timeout);
      reject(new Error(`Gateway exited ${c}`));
    });
    child.stderr.on("data", (x) => {
      if (!String(x).includes("ExperimentalWarning")) output += x;
    });
  });
}
async function stop() {
  child.kill("SIGTERM");
  await once(child, "exit");
}
async function login(email, password) {
  const r = await fetch(origin + "/auth/login", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ email, password }),
    redirect: "manual",
  });
  assert.equal(r.status, 303);
  return r.headers.get("set-cookie").split(";")[0];
}
async function state(cookie) {
  const r = await fetch(origin + "/api/app", { headers: { Cookie: cookie } });
  return { status: r.status, data: await r.json() };
}
async function command(cookie, action, payload) {
  const r = await fetch(origin + "/api/app", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ action, payload }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
try {
  await start();
  assert.equal((await fetch(origin + "/health")).status, 200);
  const privateLogin=await (await fetch(origin+'/login')).text();
  assert.ok(privateLogin.includes('name="email" type="email"'));
  assert.ok(!privateLogin.includes('The password matches the username.'));
  assert.equal(
    (
      await fetch(origin + "/api/app", {
        headers: {
          "oai-authenticated-user-id": "forged",
          "oai-authenticated-user-email": "admin@javor.example",
        },
      })
    ).status,
    401,
  );
  console.log(
    "PASS: anonymous requests and forged identity headers are rejected",
  );
  const owner = await login(
    "admin@javor.example",
    "fixture-only-admin-password-123456",
  );
  const initial = await state(owner);
  assert.equal(initial.data.membership.role, "federation");
  assert.equal(initial.data.organizations.length, 3);
  await command(owner, "completeOnboarding", {role:"member"});
  const introduced=await state(owner);
  assert.ok(introduced.data.membership.onboardingCompletedAt);
  assert.equal(introduced.data.membership.role,"federation");
  const sourceContract = initial.data.contracts.find(
    (c) => c.status === "draft",
  );
  const created = await command(owner, "saveContract", {
    contract: {
      ...sourceContract,
      id: "",
      number: "CONCURRENT-QA",
      version: 0,
    },
  });
  const receipt = {
    ...initial.data.items[0],
    id: "",
    contractId: created.id,
    number: "RACE-QA-1",
    version: 0,
    fileIds: [],
    orgReview: "unchecked",
  };
  const race = await Promise.all(
    [1, 2].map(() =>
      fetch(origin + "/api/app", {
        method: "POST",
        headers: {
          Cookie: owner,
          "Content-Type": "application/json",
          Origin: origin,
        },
        body: JSON.stringify({
          action: "saveItem",
          payload: { item: receipt },
        }),
      }),
    ),
  );
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await state(owner)).data.items.filter(
      (i) => i.contractId === created.id && i.number === "RACE-QA-1",
    ).length,
    1,
  );
  console.log("PASS: simultaneous duplicate imports create only one receipt");
  const originalFile = initial.data.files[0];
  const originalBytes = Buffer.from(
    await (
      await fetch(origin + "/api/files?id=" + originalFile.id, {
        headers: { Cookie: owner },
      })
    ).arrayBuffer(),
  );
  const org = initial.data.organizations[0];
  const invite = await command(owner, "invite", {
    organizationId: org.id,
    email: "member@fixture.example",
    role: "member",
  });
  const token = new URL(invite.inviteUrl, origin).searchParams.get("invite");
  const invitationPage=await (await fetch(origin+"/login?invite="+token)).text();
  assert.ok(invitationPage.includes('value="member@fixture.example"'));
  assert.ok(invitationPage.includes('/login?next='+encodeURIComponent('/?invite='+token)));
  const signup = await fetch(origin + "/auth/register", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({
      email: "member@fixture.example",
      password: "fixture-member-password-123",
      confirm: "fixture-member-password-123",
      invite: token,
    }),
    redirect: "manual",
  });
  assert.equal(signup.status, 303);
  const member = signup.headers.get("set-cookie").split(";")[0];
  await command(member, "acceptInvite", { token });
  const memberState = await state(member);
  assert.equal(memberState.data.membership.role, "member");
  assert.equal(memberState.data.organizations.length, 1);
  assert.equal(memberState.data.organizations[0].id, org.id);
  console.log(
    "PASS: invite-only registration creates a correctly scoped member",
  );
  const forged = await fetch(origin + "/api/app", {
    headers: {
      Cookie: member,
      "oai-authenticated-user-id": initial.data.user.userId,
      "oai-authenticated-user-email": "admin@javor.example",
    },
  });
  assert.equal((await forged.json()).membership.role, "member");
  console.log("PASS: a signed-in member cannot forge federation identity");
  await command(owner, "feedback", {
    text: "Persistence fixture",
    organizationId: org.id,
  });
  await stop();
  await start();
  const restored = await state(owner);
  assert.equal(restored.status, 200);
  assert.ok(
    restored.data.feedback.some((x) => x.text === "Persistence fixture"),
  );
  assert.equal((await state(member)).data.membership.role, "member");
  const storedFile = await fetch(origin + "/api/files?id=" + originalFile.id, {
    headers: { Cookie: owner },
  });
  assert.equal(storedFile.status, 200);
  assert.deepEqual(Buffer.from(await storedFile.arrayBuffer()), originalBytes);
  console.log("PASS: records, accounts and sessions survive a process restart");
  await command(owner, "disableMember", { id: memberState.data.membership.id });
  assert.equal((await state(member)).status, 403);
  assert.equal(
    (
      await fetch(origin + "/api/files?id=" + originalFile.id, {
        headers: { Cookie: member },
      })
    ).status,
    403,
  );
  console.log(
    "PASS: offboarding immediately revokes both records and originals",
  );
  const csrf = await fetch(origin + "/api/app", {
    method: "POST",
    headers: {
      Cookie: owner,
      "Content-Type": "application/json",
      Origin: "https://attacker.invalid",
    },
    body: JSON.stringify({ action: "feedback", payload: { text: "bad" } }),
  });
  assert.equal(csrf.status, 403);
  assert.ok(
    csrf.headers
      .get("content-security-policy")
      .includes("frame-ancestors 'none'"),
  );
  console.log("PASS: CSRF blocked and security headers enabled");
  const resetResponse = await fetch(origin + "/auth/recover", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ email: "admin@javor.example" }),
  });
  assert.equal(resetResponse.status, 200);
  const inspection = await openDatabase({
    directory: data + "/native/private",
    connectionString: process.env.DATABASE_URL,
  });
  let resetPayload;
  try {
    resetPayload = (
      await inspection
        .prepare("SELECT payload FROM outbox ORDER BY created_at DESC LIMIT 1")
        .first()
    ).payload;
  } finally {
    await inspection.close();
  }
  const [iv, tag, ciphertext] = resetPayload
    .split(".")
    .map((v) => Buffer.from(v, "base64"));
  const decoder = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(outboxKey, "base64"),
    iv,
  );
  decoder.setAuthTag(tag);
  const message = JSON.parse(
    Buffer.concat([decoder.update(ciphertext), decoder.final()]).toString(),
  );
  const resetToken = new URL(message.text).searchParams.get("reset");
  const resetBody = new URLSearchParams({
    reset: resetToken,
    password: "new-synthetic-password-123",
    confirm: "new-synthetic-password-123",
  });
  assert.equal(
    (
      await fetch(origin + "/auth/password", {
        method: "POST",
        headers: { Origin: origin },
        body: resetBody,
      })
    ).status,
    200,
  );
  assert.equal((await state(owner)).status, 401);
  assert.equal(
    (
      await fetch(origin + "/auth/password", {
        method: "POST",
        headers: { Origin: origin },
        body: resetBody,
      })
    ).status,
    400,
  );
  const refreshedOwner = await login(
    "admin@javor.example",
    "new-synthetic-password-123",
  );
  assert.equal((await state(refreshedOwner)).status, 200);
  console.log(
    "PASS: reset links are encrypted, single-use and invalidate existing sessions",
  );
  await fetch(origin + "/signout-with-chatgpt", {
    headers: { Cookie: owner },
    redirect: "manual",
  });
  assert.equal((await state(owner)).status, 401);
  console.log("PASS: logout invalidates the server-side session");
} finally {
  if (child?.exitCode === null) await stop();
  await rm(data, { recursive: true, force: true });
}
