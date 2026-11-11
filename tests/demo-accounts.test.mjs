import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { demoAccounts } from "../production/demo-accounts.mjs";
const directory = await mkdtemp(tmpdir() + "/dotace-demo-roles-");
const origin = "http://127.0.0.1:5191";
let child;
async function start() {
  child = spawn(process.execPath, ["production/server.mjs"], {
    env: { ...process.env, APP_ENV: "test", DEMO_MODE: "true", DATABASE_URL: "", SUPABASE_URL: "", DATA_DIR: directory, PORT: "5191", APP_ORIGIN: origin },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Startup timed out: " + output)), 15000);
    child.stdout.on("data", (chunk) => { output += chunk; if (output.includes('"event":"ready"')) { clearTimeout(timer); resolve(); } });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
}
async function stop() { if (child && child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } }
async function request(path, cookie = "", fields) {
  return fetch(origin + path, { redirect: "manual", headers: { Cookie: cookie, ...(fields ? { Origin: origin, "Content-Type": "application/json" } : {}) }, ...(fields ? { method: "POST", body: JSON.stringify(fields) } : {}) });
}
async function login(account, password = account.password, next = "/") {
  return fetch(origin + "/auth/login", { redirect: "manual", method: "POST", headers: { Origin: origin }, body: new URLSearchParams({ email: account.email, password, next }) });
}
async function state(cookie) { const r = await request("/api/app", cookie); assert.equal(r.status, 200); return r.json(); }
async function command(cookie, action, payload, status = 200) { const r = await request("/api/app", cookie, { action, payload }); assert.equal(r.status, status, await r.clone().text()); return r.json(); }
try {
  await start();
  assert.equal((await request("/")).status, 303);
  assert.equal((await request("/api/app")).status, 401);
  assert.equal((await request("/api/files?id=file-item-balls")).status, 401);
  const landing = await (await request("/login")).text();
  for (const account of demoAccounts) assert.ok(landing.includes(account.email));
  assert.ok(landing.includes('data-lang="en"'));
  assert.ok(landing.includes('lang="cs"'));
  assert.equal((await login(demoAccounts[1], "incorrect")).status, 400);
  const forged = await fetch(origin + "/api/app", { headers: { "oai-authenticated-user-id": `render:${demoAccounts[0].email}`, "oai-authenticated-user-email": demoAccounts[0].email } });
  assert.equal(forged.status, 401);
  console.log("PASS: fresh visitors start at login; originals and API require a valid session");

  // Organization can be the first visitor; bootstrap must not make it federation.
  const orgLogin = await login(demoAccounts[1]);
  assert.equal(orgLogin.status, 303);
  const organization = orgLogin.headers.get("set-cookie").split(";")[0];
  const orgState = await state(organization);
  assert.equal(orgState.membership.role, "org_admin");
  assert.deepEqual(orgState.organizations.map(o => o.id), ["org-haj"]);
  assert.ok(orgState.contracts.every(c => c.organizationId === "org-haj"));
  const fedLogin = await login(demoAccounts[0]);
  const federation = fedLogin.headers.get("set-cookie").split(";")[0];
  assert.notEqual(federation, organization);
  const fedState = await state(federation);
  assert.equal(fedState.membership.role, "federation");
  assert.equal(fedState.organizations.length, 3);
  console.log("PASS: two independent accounts have the correct server-side roles and scopes");

  assert.equal((await request("/api/files?id=file-item-lipa", organization)).status, 403);
  await command(organization, "saveContract", { contract: {} }, 403);
  await command(organization, "reviewItem", { id: "item-balls", version: 1, decision: "accepted" }, 403);
  await command(organization, "saveItem", { item: { contractId: "contract-lipa" } }, 403);
  const impersonated = await fetch(origin + "/api/app?role=federation", { headers: { Cookie: organization, "oai-authenticated-user-email": demoAccounts[0].email, "oai-authenticated-user-id": `render:${demoAccounts[0].email}` } });
  assert.equal((await impersonated.json()).membership.role, "org_admin");
  console.log("PASS: organization cannot read another club, forge federation, or review expenses");

  const contract = orgState.contracts.find(c => c.id === "contract-haj");
  for (const item of orgState.items.filter(i => i.contractId === contract.id)) await command(organization, "saveItem", { item: { ...item, orgReview: "commented", comment: "Synthetic test: checked against the original; partial claim covers the club's grant-funded use.", recipientName: "FK Háj, z. s." } });
  await command(organization, "submit", { contractId: contract.id, version: contract.version, declaration: true });
  const submitted = await state(federation);
  const submittedContract = submitted.contracts.find(c => c.id === contract.id);
  assert.equal(submittedContract.status, "submitted");
  await command(organization, "approve", { contractId: contract.id, version: submittedContract.version, conclusion: "Cannot self approve", reduction: 0 }, 403);
  for (const item of submitted.items.filter(i => i.contractId === contract.id)) await command(federation, "reviewItem", { id: item.id, version: item.version, decision: "accepted" });
  await command(federation, "approve", { contractId: contract.id, version: submittedContract.version, conclusion: "Synthetic two-account verification", reduction: 0 });
  const approved = await state(organization);
  assert.equal(approved.contracts.find(c => c.id === contract.id).status, "approved");
  assert.ok(approved.audit.some(a => a.action === "settlement.submit" && a.actor === demoAccounts[1].name));
  assert.ok(approved.audit.some(a => a.action === "settlement.approve" && a.actor === demoAccounts[0].name));
  console.log("PASS: organization submits, federation approves, both see the same persisted result and attribution");

  assert.equal((await request("/auth/password", organization, { password: "changed" })).status, 403);
  assert.equal((await request("/auth/register", organization, {})).status, 403);
  await command(federation, "disableMember", { id: orgState.membership.id }, 403);
  await stop(); await start();
  assert.equal((await state(organization)).contracts.find(c => c.id === contract.id).status, "approved");
  assert.equal((await state(federation)).membership.role, "federation");
  console.log("PASS: demo accounts cannot be disabled or have their passwords changed; sessions and decisions survive restart");

  assert.equal((await request("/signout-with-chatgpt", organization)).status, 303);
  assert.equal((await request("/api/app", organization)).status, 401);
  assert.equal((await state(federation)).membership.role, "federation");
  const external = await login(demoAccounts[1], demoAccounts[1].password, "https://attacker.invalid");
  assert.equal(external.headers.get("location"), "/");
  console.log("PASS: logout revokes only its own session and external login redirects are rejected");
} finally { await stop(); await rm(directory, { recursive: true, force: true }); }
