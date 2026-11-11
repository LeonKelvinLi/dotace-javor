import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
export function createOutbox({ db, key, apiKey, from, origin, send = fetch }) {
  const secret = key ? Buffer.from(key, "base64") : null;
  if (secret && secret.length !== 32)
    throw new Error("OUTBOX_KEY must be a base64-encoded 32-byte key");
  const encrypt = (subject, text) => {
    if (!secret) throw new Error("Email encryption is not configured");
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", secret, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify({ subject, text })),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), data]
      .map((v) => v.toString("base64"))
      .join(".");
  };
  const decrypt = (payload) => {
    const [iv, tag, data] = payload
      .split(".")
      .map((v) => Buffer.from(v, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", secret, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString(),
    );
  };
  const statement = (recipient, subject, text, id) =>
    db
      .prepare(
        "INSERT OR IGNORE INTO outbox (id,recipient,payload,available_at,created_at) VALUES (?,?,?,?,?)",
      )
      .bind(
        id,
        recipient,
        encrypt(subject, text),
        new Date().toISOString(),
        new Date().toISOString(),
      );
  const enqueue = async (...args) => {
    await statement(...args).run();
  };
  async function events() {
    if (!secret) return;
    const events = (
      await db
        .prepare(
          "SELECT id,data FROM audit WHERE id NOT IN (SELECT id FROM notification_events)",
        )
        .all()
    ).results;
    for (const row of events) {
      const event = JSON.parse(row.data);
      const statements = [];
      if (
        [
          "settlement.submit",
          "settlement.return",
          "settlement.approve",
          "item.supplement",
          "item.reply",
        ].includes(event.action) &&
        event.organizationId
      ) {
        const members = (
          await db.prepare("SELECT data FROM memberships").all()
        ).results
          .map((r) => JSON.parse(r.data))
          .filter(
            (m) =>
              !m.disabled &&
              (event.action === "settlement.submit" ||
              event.action === "item.reply"
                ? m.role === "federation"
                : m.organizationId === event.organizationId),
          );
        for (const member of members) {
          const id = createHash("sha256")
            .update(event.id + ":" + member.email)
            .digest("hex");
          statements.push(
            statement(
              member.email,
              "Javor · Vyúčtování bylo aktualizováno / Settlement updated",
              `Ve vyúčtování čeká aktualizace. Přihlaste se a zkontrolujte další krok.\nA settlement was updated. Sign in to see the next step.\n${origin}/?contract=${encodeURIComponent(event.contractId)}`,
              id,
            ),
          );
        }
      }
      statements.push(
        db
          .prepare("INSERT OR IGNORE INTO notification_events VALUES (?)")
          .bind(event.id),
      );
      await db.batch(statements);
    }
  }
  let running = false;
  async function tick() {
    if (running || !secret || !apiKey) return;
    running = true;
    try {
      await events();
      const rows = (
        await db
          .prepare(
            "SELECT * FROM outbox WHERE state='pending' AND available_at<=? ORDER BY created_at LIMIT 10",
          )
          .bind(new Date().toISOString())
          .all()
      ).results;
      for (const row of rows) {
        try {
          const result = await send("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "Idempotency-Key": row.id,
            },
            body: JSON.stringify({
              from,
              to: [row.recipient],
              ...decrypt(row.payload),
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!result.ok) throw new Error("provider_" + result.status);
          await db
            .prepare(
              "UPDATE outbox SET state='delivered',payload='',delivered_at=?,last_error=NULL WHERE id=?",
            )
            .bind(new Date().toISOString(), row.id)
            .run();
        } catch (error) {
          const attempts = row.attempts + 1;
          await db
            .prepare(
              "UPDATE outbox SET attempts=?,state=?,available_at=?,last_error=? WHERE id=?",
            )
            .bind(
              attempts,
              attempts >= 8 ? "failed" : "pending",
              new Date(
                Date.now() + Math.min(3600000, 30000 * 2 ** attempts),
              ).toISOString(),
              /^provider_\d+$/.test(error.message)
                ? error.message
                : "delivery_error",
              row.id,
            )
            .run();
        }
      }
    } finally {
      running = false;
    }
  }
  return { encrypt, enqueue, tick, statement };
}
