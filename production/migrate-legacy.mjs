import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const tables = [
  "bootstrap",
  "organizations",
  "memberships",
  "contracts",
  "items",
  "files",
  "audit",
  "invitations",
  "feedback",
];
export async function migrateLegacy(db, bucket, directory) {
  const root = path.join(directory, "worker-storage");
  if (
    !existsSync(root) ||
    (await db
      .prepare("SELECT value FROM runtime_meta WHERE key='legacy-migration'")
      .first())
  )
    return false;
  const candidates = readdirSync(root, { recursive: true }).filter((f) =>
    String(f).endsWith(".sqlite"),
  );
  function findTable(table) {
    for (const name of candidates) {
      const d = new DatabaseSync(path.join(root, name), { readOnly: true });
      if (
        d
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          )
          .get(table)
      )
        return d;
      d.close();
    }
    return null;
  }
  const source = findTable("contracts");
  if (!source)
    throw new Error("Legacy storage found without an application database");
  const objects = findTable("_mf_objects");
  try {
    if (await db.prepare("SELECT id FROM organizations LIMIT 1").first())
      throw new Error(
        "Refusing to merge a legacy store into an occupied database",
      );
    const files = source.prepare("SELECT object_key,data FROM files").all();
    for (const row of files) {
      const file = JSON.parse(row.data),
        object = objects
          ?.prepare("SELECT blob_id FROM _mf_objects WHERE key=?")
          .get(row.object_key);
      if (!object) throw new Error("Legacy original missing");
      const bytes = readFileSync(
        path.join(root, "r2", "BUCKET", "blobs", object.blob_id),
      );
      if (
        bytes.length !== file.size ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error("Legacy original checksum mismatch");
      await bucket.put(row.object_key, bytes);
    }
    const statements = [];
    for (const table of tables)
      for (const row of source.prepare(`SELECT * FROM ${table}`).all()) {
        const keys = Object.keys(row);
        statements.push(
          db
            .prepare(
              `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
            )
            .bind(...keys.map((k) => row[k])),
        );
      }
    const accountsPath = path.join(directory, "accounts.sqlite");
    if (existsSync(accountsPath)) {
      const accounts = new DatabaseSync(accountsPath, { readOnly: true });
      try {
        for (const row of accounts.prepare("SELECT * FROM accounts").all())
          statements.push(
            db
              .prepare(
                "INSERT INTO app_accounts (email,salt,hash) VALUES (?,?,?)",
              )
              .bind(row.email, row.salt, row.hash),
          );
      } finally {
        accounts.close();
      }
    }
    statements.push(
      db
        .prepare("INSERT INTO runtime_meta VALUES (?,?)")
        .bind("legacy-migration", new Date().toISOString()),
    );
    await db.batch(statements);
    console.log(
      JSON.stringify({ event: "legacy_migrated", originals: files.length }),
    );
    return true;
  } finally {
    source.close();
    objects?.close();
  }
}
