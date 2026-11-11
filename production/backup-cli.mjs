import { openDatabase } from "./database.mjs";
import { localBucket, managedBucket } from "./storage.mjs";
import { createClient } from "@supabase/supabase-js";
import { createBackup, restoreBackup } from "./backup.mjs";
import path from "node:path";
const [action, file] = process.argv.slice(2);
if (!["create", "restore"].includes(action) || !file)
  throw new Error(
    "Usage: node production/backup-cli.mjs create|restore /absolute/backup.javor",
  );
if (action === "restore" && process.env.CONFIRM_ISOLATED_RESTORE !== "true")
  throw new Error(
    "Restore requires CONFIRM_ISOLATED_RESTORE=true and a separate empty destination",
  );
const directory = path.resolve(
  process.env.DATA_DIR || ".render-data",
  "native",
  process.env.DEMO_MODE === "true" ? "public-demo" : "private",
);
const db = await openDatabase({
  directory,
  connectionString: process.env.DATABASE_URL,
});
const client = process.env.SUPABASE_URL
  ? createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    )
  : null;
const bucket = client
  ? managedBucket(client, process.env.STORAGE_BUCKET)
  : localBucket(directory);
try {
  console.log(
    JSON.stringify(
      await (action === "create" ? createBackup : restoreBackup)({
        db,
        bucket,
        key: process.env.BACKUP_KEY,
        ...(action === "create" ? { output: file } : { input: file }),
      }),
    ),
  );
} finally {
  await db.close();
}
