"use strict";
// PostgreSQL access (works with Neon). Reads DATABASE_URL from the environment.
const fs = require("node:fs"), path = require("node:path");
const { Pool, types } = require("pg");

types.setTypeParser(20, v => Number(v)); // BIGINT/COUNT -> JS number (our values stay far below 2^53)

let url = process.env.DATABASE_URL || "";
if (!url) { console.error("DATABASE_URL is not set. See README step 2."); process.exit(1); }
url = url.replace(/&channel_binding=[^&]*/g, "").replace(/\?channel_binding=[^&]*&?/g, "?");
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const pool = new Pool({
  connectionString: url,
  ssl: local || /sslmode=/.test(url) ? undefined : { rejectUnauthorized: true },
  max: 5,
  idleTimeoutMillis: 10000,      // drop idle connections so Neon can sleep and we never reuse a dead one
  connectionTimeoutMillis: 20000 // allows for Neon waking up
});
pool.on("error", e => console.error("DB pool error:", e.message));

const transient = e => !!e && (["ECONNRESET", "ETIMEDOUT", "EPIPE", "57P01", "08006", "08003", "08001"].includes(e.code) || /terminated|timeout|ECONN/i.test(e.message || ""));
async function query(text, params) {
  try { return await pool.query(text, params); }
  catch (e) { if (!transient(e)) throw e; return await pool.query(text, params); } // one retry, e.g. Neon just woke up
}
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn((t, p) => c.query(t, p));
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw e;
  } finally { c.release(); }
}
async function migrate() {
  await query("CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied BIGINT NOT NULL)");
  const dir = __dirname;
  const done = new Set((await query("SELECT name FROM schema_migrations")).rows.map(r => r.name));
  for (const f of fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await tx(async q => { await q(sql); await q("INSERT INTO schema_migrations(name,applied) VALUES($1,$2)", [f, Date.now()]); });
    console.log("Applied migration", f);
  }
}
module.exports = { query, tx, migrate };
