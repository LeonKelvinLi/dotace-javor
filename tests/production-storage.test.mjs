import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
import { openDatabase, postgresSQL } from "../production/database.mjs";
import { localBucket } from "../production/storage.mjs";
import { createBackup, restoreBackup } from "../production/backup.mjs";
import { createOutbox } from "../production/outbox.mjs";
import {
  env,
  withIdentity,
  identity,
  readState,
  command,
} from "../dist/api.mjs";

test("encrypted backup restores records and verified originals; refuses occupied destinations, tampering and overwrites", async () => {
  const dir = await mkdtemp(tmpdir() + "/dotace-backup-test-");
  const source = await openDatabase({ directory: dir + "/source" }),
    target = await openDatabase({ directory: dir + "/target" }),
    bucket = localBucket(dir + "/source"),
    destination = localBucket(dir + "/target"),
    key = randomBytes(32).toString("base64");
  try {
    const bytes = Buffer.from("%PDF-1.4\nSynthetic restore fixture");
    const file = {
      id: "fixture",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      type: "application/pdf",
    };
    await bucket.put("org/original.pdf", bytes);
    await source
      .prepare("INSERT INTO files VALUES (?,?,?,?,?)")
      .bind(
        "fixture",
        "org",
        "contract",
        "org/original.pdf",
        JSON.stringify(file),
      )
      .run();
    await source
      .prepare("INSERT INTO organizations VALUES (?,?)")
      .bind("org", JSON.stringify({ id: "org", name: "Private fixture name" }))
      .run();
    const output = dir + "/backup.javor";
    assert.equal(
      (await createBackup({ db: source, bucket, output, key })).originals,
      1,
    );
    const encrypted = await readFile(output);
    assert.ok(!encrypted.includes(Buffer.from("Private fixture name")));
    await assert.rejects(createBackup({ db: source, bucket, output, key }));
    assert.deepEqual(await readFile(output), encrypted);
    await restoreBackup({
      db: target,
      bucket: destination,
      input: output,
      key,
    });
    assert.deepEqual((await destination.get("org/original.pdf")).body, bytes);
    assert.ok(
      (
        await target.prepare("SELECT data FROM organizations").first()
      ).data.includes("Private fixture name"),
    );
    await assert.rejects(
      restoreBackup({ db: target, bucket: destination, input: output, key }),
      /empty destination/,
    );
    const corrupt = Buffer.from(encrypted);
    corrupt[30] ^= 1;
    await writeFile(dir + "/corrupt.javor", corrupt);
    const empty = await openDatabase({ directory: dir + "/empty" });
    try {
      await assert.rejects(
        restoreBackup({
          db: empty,
          bucket: localBucket(dir + "/empty"),
          input: dir + "/corrupt.javor",
          key,
        }),
      );
      assert.equal(await empty.prepare("SELECT id FROM files").first(), null);
    } finally {
      await empty.close();
    }
  } finally {
    await source.close();
    await target.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("email outbox encrypts content, retries transient failures and records provider acceptance once", async () => {
  const dir = await mkdtemp(tmpdir() + "/dotace-outbox-test-"),
    db = await openDatabase({ directory: dir });
  let calls = 0;
  try {
    const mail = createOutbox({
      db,
      key: randomBytes(32).toString("base64"),
      apiKey: "fixture",
      from: "fixture@example.test",
      origin: "https://fixture.invalid",
      send: async (_url, options) => {
        calls++;
        assert.equal(options.headers["Idempotency-Key"], "test-email");
        return new Response("", { status: calls === 1 ? 503 : 200 });
      },
    });
    await mail.enqueue(
      "user@example.test",
      "Secret subject",
      "Private token=fixture",
      "test-email",
    );
    assert.ok(
      !(
        await db.prepare("SELECT payload FROM outbox").first()
      ).payload.includes("fixture"),
    );
    await mail.tick();
    assert.equal(
      (await db.prepare("SELECT attempts FROM outbox").first()).attempts,
      1,
    );
    await db
      .prepare("UPDATE outbox SET available_at=?")
      .bind("2000-01-01T00:00:00Z")
      .run();
    await mail.tick();
    await mail.tick();
    assert.equal(calls, 2);
    const row = await db.prepare("SELECT state,payload FROM outbox").first();
    assert.equal(row.state, "delivered");
    assert.equal(row.payload, "");
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("native mode does not elect visitors as owners or create fictional records", async () => {
  const dir = await mkdtemp(tmpdir() + "/dotace-empty-test-"),
    db = await openDatabase({ directory: dir });
  try {
    Object.assign(env, {
      DB: db,
      BUCKET: localBucket(dir),
      NATIVE_RUNTIME: "true",
      OWNER_EMAIL: "owner@example.test",
      DEMO_MODE: "false",
      SEED_DEMO: "false",
    });
    await withIdentity(
      {
        userId: "visitor",
        email: "visitor@example.test",
        displayName: "Visitor",
      },
      async () => assert.equal((await identity()).member, null),
    );
    await withIdentity(
      { userId: "owner", email: "owner@example.test", displayName: "Owner" },
      async () => {
        const ctx = await identity();
        assert.equal(ctx.member.role, "federation");
        const state = await readState(ctx);
        assert.equal(state.organizations.length, 0);
        assert.equal(state.contracts.length, 0);
        await assert.rejects(
          command(ctx, "disableMember", { id: ctx.member.id }),
          /own access/,
        );
      },
    );
  } finally {
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("Postgres translation preserves snapshot guards and numeric sizes", () => {
  const sql = postgresSQL(
    "SELECT json_extract(e.value,'$.version') FROM json_each(?) e WHERE changes()>0",
    2,
  );
  assert.match(sql, /jsonb_array_elements\(\$1::jsonb\)/);
  assert.match(sql, /::bigint/);
  assert.match(sql, /2>0/);
});

test("scanner protocol accepts only an explicit clean response and fails closed on detection or disconnect", async () => {
  const { createServer } = await import("node:net"),
    { once } = await import("node:events"),
    { scanFile } = await import("../production/scanner.mjs");
  for (const answer of ["stream: OK\0", "stream: Test-Signature FOUND\0", ""]) {
    const server = createServer((socket) =>
      socket.once("data", () => socket.end(answer)),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const work = scanFile(Buffer.from("synthetic file"), {
        host: "127.0.0.1",
        port: server.address().port,
        timeout: 1000,
      });
      if (answer.includes("OK")) await work;
      else await assert.rejects(work);
    } finally {
      server.close();
      await once(server, "close");
    }
  }
});
