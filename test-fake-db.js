"use strict";
// TEST ONLY. Runs the real SQL from server.js and migrations on an in-memory SQLite so the app logic
// can be tested without a PostgreSQL server. It is NOT used in production (src/db.js is).
const fs = require("node:fs"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const s = new DatabaseSync(":memory:");
s.exec("PRAGMA foreign_keys=ON");
const conv = sql => sql.replace(/\$(\d+)/g, "?$1");
const ddl = sql => sql.replace(/BIGSERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT").replace(/BYTEA/g, "BLOB");
function run(text, params) {
  params = (params || []).map(p => (Buffer.isBuffer(p) ? new Uint8Array(p) : p));
  const t = conv(text);
  if (/^\s*select/i.test(t) || /returning/i.test(t)) { const rows = s.prepare(t).all(...params).map(r => Object.assign({}, r)); return { rows, rowCount: rows.length }; }
  const r = s.prepare(t).run(...params);
  return { rows: [], rowCount: Number(r.changes) };
}
async function query(text, params) { return run(text, params); }
async function tx(fn) {
  s.exec("BEGIN");
  try { const r = await fn(async (t, p) => run(t, p)); s.exec("COMMIT"); return r; } catch (e) { s.exec("ROLLBACK"); throw e; }
}
async function migrate() {
  s.exec("CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied BIGINT NOT NULL)");
  const dir = __dirname;
  for (const f of fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()) {
    if (s.prepare("SELECT 1 FROM schema_migrations WHERE name=?").get(f)) continue;
    s.exec(ddl(fs.readFileSync(path.join(dir, f), "utf8")));
    s.prepare("INSERT INTO schema_migrations(name,applied) VALUES(?,?)").run(f, Date.now());
  }
}
module.exports = { query, tx, migrate };
