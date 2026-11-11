import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

// The application retains its narrow prepared-statement interface. Only these
// repository-owned SQLite expressions are translated; no SQL comes from users.
export function postgresSQL(sql, changes = 0) {
  let result = sql
    .replace(/`/g, "")
    .replace(/INSERT OR IGNORE INTO/g, "INSERT INTO");
  const ignore = /INSERT OR IGNORE INTO/.test(sql);
  result = result.replace(
    /json_extract\(([^,]+),'\$\.([A-Za-z_]+)'\)/g,
    (_, column, key) =>
      ["version", "size"].includes(key)
        ? `((${column})::jsonb->>'${key}')::bigint`
        : `((${column})::jsonb->>'${key}')`,
  );
  result = result
    .replace(/json_each\(\?\)/g, "jsonb_array_elements(?::jsonb)")
    .replace(/changes\(\)/g, String(Number(changes)));
  let index = 0;
  result = result.replace(/\?/g, () => `$${++index}`);
  if (ignore) result += " ON CONFLICT DO NOTHING";
  return result;
}
const operationalSchema = `
CREATE TABLE IF NOT EXISTS access_blocks (user_id text PRIMARY KEY, at text NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (id text PRIMARY KEY, recipient text NOT NULL, payload text NOT NULL, state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, available_at text NOT NULL, created_at text NOT NULL, delivered_at text, last_error text);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox(state,available_at);
CREATE TABLE IF NOT EXISTS notification_events (id text PRIMARY KEY);
CREATE TABLE IF NOT EXISTS rate_limits (id text PRIMARY KEY, count integer NOT NULL, expires integer NOT NULL);
CREATE TABLE IF NOT EXISTS app_sessions (token text PRIMARY KEY, email text NOT NULL, expires integer NOT NULL);
CREATE TABLE IF NOT EXISTS app_accounts (email text PRIMARY KEY, salt text NOT NULL, hash text NOT NULL);
CREATE TABLE IF NOT EXISTS auth_tokens (token text PRIMARY KEY, email text NOT NULL, kind text NOT NULL, expires integer NOT NULL, used integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS runtime_meta (key text PRIMARY KEY,value text NOT NULL);
`;
function schemas(postgres, file) {
  const sql = readFileSync(path.join("drizzle", file), "utf8");
  if (!postgres) return sql;
  return (
    sql
      .replace(/`/g, "")
      .replace(/(amount_cents|claimed_cents) integer/g, "$1 bigint")
      .replace(
        /CREATE TRIGGER audit_immutable_(?:update|delete)[\s\S]*?END;/g,
        "",
      ) +
    (sql.includes("CREATE TRIGGER audit_immutable_")
      ? `
CREATE OR REPLACE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are immutable'; END; $$;
CREATE TRIGGER audit_immutable_update BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION protect_audit();`
      : "")
  );
}
export async function openDatabase({
  directory,
  connectionString,
  pool: providedPool,
} = {}) {
  const postgres = Boolean(connectionString || providedPool);
  if (!postgres) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sqlite = postgres
    ? null
    : new DatabaseSync(path.join(directory, "app.sqlite"));
  sqlite?.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;");
  const pool =
    providedPool ||
    (postgres
      ? new pg.Pool({
          connectionString,
          max: 10,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 30000,
          statement_timeout: 20000,
          ssl:
            process.env.PG_SSL === "false"
              ? false
              : {
                  rejectUnauthorized: true,
                  ...(process.env.PG_CA ? { ca: process.env.PG_CA } : {}),
                },
        })
      : null);
  const exec = async (sql) => (postgres ? pool.query(sql) : sqlite.exec(sql));
  await exec(
    "CREATE TABLE IF NOT EXISTS native_migrations (name text PRIMARY KEY)",
  );
  for (const file of readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (postgres) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(7311026)");
        const old = await c.query(
          "SELECT name FROM native_migrations WHERE name=$1 OR (name='base' AND $1='0000_round_madelyne_pryor.sql')",
          [file],
        );
        if (!old.rows.length) await c.query(schemas(true, file));
        await c.query(
          "INSERT INTO native_migrations VALUES ($1) ON CONFLICT DO NOTHING",
          [file],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    } else {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const old = sqlite
          .prepare(
            "SELECT name FROM native_migrations WHERE name=? OR (name='base' AND ?='0000_round_madelyne_pryor.sql')",
          )
          .get(file, file);
        if (!old) sqlite.exec(schemas(false, file));
        sqlite
          .prepare("INSERT OR IGNORE INTO native_migrations VALUES (?)")
          .run(file);
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    }
  }
  // Milliseconds need bigint on PostgreSQL. SQLite integer is already 64 bit.
  await exec(
    postgres
      ? operationalSchema.replace(/expires integer/g, "expires bigint")
      : operationalSchema,
  );
  // Supabase exposes public-schema tables through its data API. The app's
  // server owns these tables; anon/authenticated JWTs get no row policies.
  if (postgres)
    for (const table of [
      "native_migrations",
      "audit",
      "bootstrap",
      "contracts",
      "feedback",
      "files",
      "invitations",
      "items",
      "memberships",
      "organizations",
      "access_blocks",
      "outbox",
      "notification_events",
      "rate_limits",
      "app_sessions",
      "app_accounts",
      "auth_tokens",
      "runtime_meta",
    ])
      await exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
  const database = {
    postgres,
    sqlite,
    pool,
    prepare(sql) {
      function bound(values = []) {
        return {
          sql,
          values,
          bind(...v) {
            return bound(v);
          },
          async all() {
            return {
              results: postgres
                ? (await pool.query(postgresSQL(sql), values)).rows
                : sqlite.prepare(sql).all(...values),
            };
          },
          async first() {
            return (await this.all()).results[0] ?? null;
          },
          async run() {
            return (await database.batch([this]))[0];
          },
        };
      }
      return bound();
    },
    async batch(statements) {
      if (!postgres) {
        sqlite.exec("BEGIN IMMEDIATE");
        try {
          const results = statements.map((s) => ({
            meta: {
              changes: Number(sqlite.prepare(s.sql).run(...s.values).changes),
            },
          }));
          sqlite.exec("COMMIT");
          return results;
        } catch (e) {
          sqlite.exec("ROLLBACK");
          throw e;
        }
      }
      for (let retry = 0; ; retry++) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          const results = [];
          let changes = 0;
          for (const s of statements) {
            const r = await client.query(postgresSQL(s.sql, changes), s.values);
            changes = r.rowCount;
            results.push({ meta: { changes } });
          }
          await client.query("COMMIT");
          return results;
        } catch (e) {
          await client.query("ROLLBACK");
          if (!["40001", "40P01"].includes(e.code) || retry >= 3) throw e;
        } finally {
          client.release();
        }
      }
    },
    async close() {
      if (postgres) await pool.end();
      else sqlite.close();
    },
    async exec(sql) {
      return exec(sql);
    },
  };
  return database;
}
