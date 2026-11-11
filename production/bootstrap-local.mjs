import path from "node:path";
import { openDatabase } from "./database.mjs";
import { localBucket } from "./storage.mjs";
import { migrateLegacy } from "./migrate-legacy.mjs";
if (!process.env.DATABASE_URL) {
  const base = path.resolve(process.env.DATA_DIR || ".render-data"),
    demo = process.env.DEMO_MODE === "true";
  const directory = path.join(base, "native", demo ? "public-demo" : "private");
  const db = await openDatabase({ directory });
  try {
    await migrateLegacy(
      db,
      localBucket(directory),
      path.join(base, demo ? "public-demo" : "."),
    );
  } finally {
    await db.close();
  }
}
