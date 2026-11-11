import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdtemp,
  rm,
  writeFile,
  readFile,
  mkdir,
  open,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
export const backupTables = [
  "bootstrap",
  "organizations",
  "memberships",
  "contracts",
  "items",
  "files",
  "audit",
  "invitations",
  "feedback",
  "outbox",
  "notification_events",
  "runtime_meta",
  "app_accounts",
];
async function execute(command, args) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (x) => (output += x));
    child.on("error", reject);
    child.on("close", (code) =>
      code ? reject(new Error("Archive operation failed")) : resolve(output),
    );
  });
}
function secret(key) {
  const value = Buffer.from(key || "", "base64");
  if (value.length !== 32)
    throw new Error("BACKUP_KEY must contain 32 base64-encoded bytes");
  return value;
}
async function records(db, temp) {
  const result = {};
  if (db.postgres) {
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for (const table of backupTables)
        result[table] = (await client.query(`SELECT * FROM ${table}`)).rows;
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } else {
    const file = path.join(temp, "snapshot.sqlite");
    await backup(db.sqlite, file);
    const snapshot = new DatabaseSync(file, { readOnly: true });
    try {
      for (const table of backupTables)
        result[table] = snapshot.prepare(`SELECT * FROM ${table}`).all();
    } finally {
      snapshot.close();
      await rm(file);
    }
  }
  return result;
}
export async function createBackup({ db, bucket, output, key }) {
  const encryptionKey = secret(key),
    temp = await mkdtemp(path.join(tmpdir(), "dotace-backup-"));
  let ownedOutput = false;
  try {
    const data = await records(db, temp);
    await mkdir(path.join(temp, "originals"));
    for (const row of data.files) {
      const file = JSON.parse(row.data),
        object = await bucket.get(row.object_key);
      if (!object) throw new Error("Backup failed: an original is missing");
      const checksum = createHash("sha256");
      let size = 0;
      const verify = new Transform({
        transform(chunk, _encoding, cb) {
          checksum.update(chunk);
          size += chunk.length;
          cb(null, chunk);
        },
      });
      await pipeline(
        object.body instanceof Uint8Array
          ? Readable.from([object.body])
          : Readable.fromWeb(object.body),
        verify,
        createWriteStream(path.join(temp, "originals", file.id), {
          mode: 0o600,
        }),
      );
      if (checksum.digest("hex") !== file.sha256 || size !== file.size)
        throw new Error("Backup failed: original checksum mismatch");
    }
    await writeFile(
      path.join(temp, "records.json"),
      JSON.stringify({
        format: 1,
        createdAt: new Date().toISOString(),
        tables: data,
      }),
      { mode: 0o600 },
    );
    const archive = path.join(temp, "snapshot.tar.gz");
    await execute("tar", [
      "-czf",
      archive,
      "-C",
      temp,
      "records.json",
      "originals",
    ]);
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const handle = await open(output, "wx", 0o600);
    ownedOutput = true;
    const outputStream = handle.createWriteStream();
    outputStream.write(Buffer.concat([Buffer.from("JAVOR01\n"), iv]));
    await pipeline(createReadStream(archive), cipher, outputStream, {
      end: false,
    });
    outputStream.end(cipher.getAuthTag());
    await new Promise((resolve, reject) => {
      outputStream.on("finish", resolve);
      outputStream.on("error", reject);
    });
    return {
      originals: data.files.length,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (ownedOutput) await rm(output, { force: true });
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
export async function restoreBackup({ db, bucket, input, key }) {
  // Restore is intentionally limited to an empty isolated destination.
  for (const table of backupTables)
    if (await db.prepare(`SELECT * FROM ${table} LIMIT 1`).first())
      throw new Error("Restore requires an empty destination");
  const temp = await mkdtemp(path.join(tmpdir(), "dotace-restore-"));
  try {
    const { open, stat } = await import("node:fs/promises");
    const info = await stat(input);
    const f = await open(input, "r");
    const head = Buffer.alloc(20),
      tag = Buffer.alloc(16);
    try {
      await f.read(head, 0, 20, 0);
      await f.read(tag, 0, 16, info.size - 16);
    } finally {
      await f.close();
    }
    if (head.subarray(0, 8).toString() !== "JAVOR01\n")
      throw new Error("Unsupported backup format");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secret(key),
      head.subarray(8),
    );
    decipher.setAuthTag(tag);
    const archive = path.join(temp, "restore.tar.gz");
    await pipeline(
      createReadStream(input, { start: 20, end: info.size - 17 }),
      decipher,
      createWriteStream(archive, { mode: 0o600 }),
    );
    const entries = String(await execute("tar", ["-tzf", archive]))
      .split("\n")
      .filter(Boolean);
    if (
      entries.some(
        (name) =>
          !/^records\.json$|^originals\/$|^originals\/[a-zA-Z0-9_-]+$/.test(
            name,
          ),
      )
    )
      throw new Error("Invalid backup path");
    await execute("tar", ["-xzf", archive, "-C", temp]);
    const manifest = JSON.parse(
      await readFile(path.join(temp, "records.json"), "utf8"),
    );
    if (manifest.format !== 1) throw new Error("Unsupported backup");
    for (const row of manifest.tables.files) {
      const file = JSON.parse(row.data),
        bytes = await readFile(path.join(temp, "originals", file.id));
      if (
        bytes.length !== file.size ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error("Restore checksum mismatch");
      await bucket.put(row.object_key, bytes, {
        httpMetadata: { contentType: file.type },
      });
    }
    const statements = [];
    for (const table of backupTables)
      for (const row of manifest.tables[table]) {
        const columns = Object.keys(row);
        if (columns.some((c) => !/^[a-z_]+$/.test(c)))
          throw new Error("Invalid backup column");
        statements.push(
          db
            .prepare(
              `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
            )
            .bind(...Object.values(row)),
        );
      }
    await db.batch(statements);
    return {
      originals: manifest.tables.files.length,
      createdAt: manifest.createdAt,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
