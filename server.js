"use strict";
// Super Mart server: serves the website AND the API from one origin (no CORS needed).
const http = require("node:http"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const db = require("./db");

const PORT = Number(process.env.PORT) || 3000;
const PROD = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const SESSION_MS = 7 * 24 * 3600 * 1000;
const digits = s => (s || "").replace(/\D/g, "");
const wa = digits(process.env.WHATSAPP);
const CFG = {
  name: (process.env.STORE_NAME || "Super Mart").slice(0, 40),
  whatsapp: wa.length === 10 ? "91" + wa : wa,
  upi: (process.env.UPI_ID || "").trim(),
  upiPhone: digits(process.env.UPI_PHONE).slice(-10)
};
let ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const isAdmin = e => !!ADMIN_EMAIL && e === ADMIN_EMAIL;
const deliveryFee = t => (t >= 499 ? 0 : 49);
const STATUSES = ["Placed", "Paid", "Shipped", "Delivered", "Cancelled"];
const COLORS = ["#dbe9ff", "#e6dcff", "#d9f2e6", "#ffe9c7", "#ffdcdc", "#f9d9ee", "#fff3c4"];

const DEMO = [
  ["Wireless Earbuds Pro", "Electronics", 1499, 2999, "🎧"], ["Smartwatch Fit 2", "Electronics", 2499, 4999, "⌚"],
  ["Bluetooth Speaker", "Electronics", 999, 1999, "🔊"], ["Power Bank 20000 mAh", "Electronics", 1199, 1999, "🔋"],
  ["Men’s Casual Shirt", "Fashion", 599, 1299, "👕"], ["Running Shoes", "Fashion", 1799, 3499, "👟"],
  ["Women’s Kurti", "Fashion", 749, 1499, "👗"], ["Backpack 30L", "Fashion", 899, 1799, "🎒"],
  ["Non-stick Cookware Set", "Home", 1299, 2599, "🍳"], ["LED Desk Lamp", "Home", 499, 999, "💡"],
  ["Cotton Bedsheet Set", "Home", 699, 1599, "🛏️"], ["Stainless Steel Bottle", "Home", 349, 699, "🥤"],
  ["Basmati Rice 5 kg", "Grocery", 549, 699, "🍚"], ["Coconut Oil 1 L", "Grocery", 229, 289, "🥥"],
  ["Tea Powder 500 g", "Grocery", 199, 249, "🍵"], ["Dry Fruits Mix 500 g", "Grocery", 449, 599, "🥜"]
];

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? no(e) : ok(k))));
const DUMMY_SALT = crypto.randomBytes(16).toString("hex");
const str = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const iv = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const r1 = n => Math.round(Number(n) * 10) / 10;

// ---- rate limiting (in memory; resets when the server restarts) ----
const hits = new Map();
const blocked = k => { const h = hits.get(k); return !!h && h.reset > Date.now() && h.n >= 10; };
const hit = k => { const now = Date.now(), h = hits.get(k); if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + 15 * 60000 }); else h.n++; };
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); db.query("DELETE FROM sessions WHERE expires<$1", [n]).catch(() => {}); }, 3600000).unref();
function clientIp(req) {
  if (TRUST_PROXY) { const x = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean); if (x.length) return x[x.length - 1]; }
  return req.socket.remoteAddress || "?";
}

const HEAD = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin", "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
if (PROD) HEAD["Strict-Transport-Security"] = "max-age=31536000";
function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8" }, HEAD, extra || {}));
  const out = type ? body : JSON.stringify(body);
  res.end(res.req && res.req.method === "HEAD" ? undefined : out);
}
const fail = (res, code, msg) => send(res, code, { error: msg });
function body(req, max) {
  return new Promise((ok, no) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > (max || 10000)) { no(new Error("big")); req.destroy(); } });
    req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { no(new Error("bad")); } });
    req.on("error", no);
  });
}

async function userOf(req) {
  const m = /(?:^|;\s*)sm_sid=([a-f0-9]{64})/.exec(req.headers.cookie || "");
  if (!m) return null;
  const r = await db.query("SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires>$2", [sha(m[1]), Date.now()]);
  const u = r.rows[0];
  return u ? { id: u.id, name: u.name, email: u.email, admin: isAdmin(u.email) } : null;
}
async function startSession(res, uid, user) {
  const tok = crypto.randomBytes(32).toString("hex");
  await db.query("INSERT INTO sessions(token,user_id,expires) VALUES($1,$2,$3)", [sha(tok), uid, Date.now() + SESSION_MS]);
  send(res, 200, { user }, null, { "Set-Cookie": `sm_sid=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${PROD ? "; Secure" : ""}` });
}

// ---- static files (read once at start) ----
const STATIC = {};
[["/", "index.html", "text/html; charset=utf-8"], ["/index.html", "index.html", "text/html; charset=utf-8"], ["/app.js", "app.js", "text/javascript; charset=utf-8"], ["/style.css", "style.css", "text/css; charset=utf-8"]]
  .forEach(([u, f, t]) => { STATIC[u] = [fs.readFileSync(path.join(__dirname, f)), t]; });

// ---- shared queries ----
const imgUrl = id => (id ? "/img/" + id : null);
async function itemsFor(rows, q) {
  // attach items to a list of order rows
  const out = rows.map(o => Object.assign({}, o, { items: [] }));
  const by = new Map(out.map(o => [o.id, o]));
  for (const o of out) {
    const it = await (q || db.query)("SELECT oi.product_id,oi.qty,oi.price,p.n,p.image_id FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1", [o.id]);
    o.items = it.rows.map(i => ({ id: i.product_id, name: i.n, qty: i.qty, price: i.price, img: imgUrl(i.image_id) }));
  }
  return out;
}
const productRow = r => ({ id: r.id, n: r.n, c: r.c, p: r.p, m: r.m, e: r.e, b: r.b, img: imgUrl(r.image_id), r: r1(r.avg || 0), rc: Number(r.cnt || 0), on: r.active === undefined ? 1 : r.active });
const PRODUCT_SQL = "SELECT p.id,p.n,p.c,p.p,p.m,p.e,p.b,p.image_id,p.active, COALESCE(AVG(r.stars),0) AS avg, COUNT(r.stars) AS cnt FROM products p LEFT JOIN ratings r ON r.product_id=p.id";
async function cleanImages() { await db.query("DELETE FROM images WHERE created<$1 AND id NOT IN (SELECT image_id FROM products WHERE image_id IS NOT NULL)", [Date.now() - 3600000]); }

async function handle(req, res) {
  const url = new URL(req.url, "http://x").pathname;
  const method = req.method === "HEAD" ? "GET" : req.method;

  if (method === "GET" && STATIC[url]) return send(res, 200, STATIC[url][0], STATIC[url][1], { "Cache-Control": "no-cache" });
  if (method === "GET" && url === "/healthz") return send(res, 200, { ok: true }); // does not touch the database (lets Neon sleep)
  let m = /^\/img\/(\d{1,12})$/.exec(url);
  if (method === "GET" && m) {
    const r = await db.query("SELECT mime,data FROM images WHERE id=$1", [Number(m[1])]);
    if (!r.rows[0]) return fail(res, 404, "Not found");
    return send(res, 200, Buffer.from(r.rows[0].data), r.rows[0].mime, { "Cache-Control": "public, max-age=31536000, immutable" });
  }
  if (!url.startsWith("/api/")) return fail(res, 404, "Not found");

  if (method === "POST") { // CSRF defences: same origin + JSON only (the cookie is also SameSite=Strict)
    const o = req.headers.origin;
    if (o && new URL(o).host !== req.headers.host) return fail(res, 403, "Blocked");
    if (!(req.headers["content-type"] || "").startsWith("application/json")) return fail(res, 415, "JSON only");
  }

  if (method === "GET" && url === "/api/config") return send(res, 200, CFG);
  if (method === "GET" && url === "/api/products") {
    const r = await db.query(PRODUCT_SQL + " WHERE p.active=1 GROUP BY p.id ORDER BY p.id");
    return send(res, 200, { products: r.rows.map(productRow) });
  }
  if (method === "GET" && url === "/api/me") return send(res, 200, { user: await userOf(req) });

  if (method === "POST" && (url === "/api/register" || url === "/api/login")) {
    const ip = "ip:" + clientIp(req);
    if (blocked(ip)) return fail(res, 429, "Too many attempts. Try again in 15 minutes.");
    const b = await body(req);
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(email) || email.length > 120) return fail(res, 400, "Enter a valid email address.");
    if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 100) return fail(res, 400, "Password must be 8 to 100 characters.");
    if (url === "/api/register") {
      hit(ip);
      if (!str(b.name, 2, 60)) return fail(res, 400, "Enter your name (2 to 60 characters).");
      if ((await db.query("SELECT 1 FROM users WHERE email=$1", [email])).rows.length) return fail(res, 409, "This email is already registered. Please log in.");
      const salt = crypto.randomBytes(16).toString("hex"), hash = (await scrypt(b.password, salt)).toString("hex");
      const r = await db.query("INSERT INTO users(name,email,salt,hash,created) VALUES($1,$2,$3,$4,$5) RETURNING id", [b.name.trim(), email, salt, hash, Date.now()]);
      const id = r.rows[0].id;
      return startSession(res, id, { id, name: b.name.trim(), email, admin: false });
    }
    const em = "em:" + email;
    if (blocked(em)) return fail(res, 429, "Too many attempts for this account. Try again in 15 minutes.");
    const u = (await db.query("SELECT * FROM users WHERE email=$1", [email])).rows[0];
    const got = await scrypt(b.password, u ? u.salt : DUMMY_SALT); // same work whether or not the user exists
    if (!u || !crypto.timingSafeEqual(got, Buffer.from(u.hash, "hex"))) { hit(ip); hit(em); return fail(res, 401, "Wrong email or password."); }
    hits.delete(em);
    return startSession(res, u.id, { id: u.id, name: u.name, email: u.email, admin: isAdmin(u.email) });
  }

  if (method === "POST" && url === "/api/logout") {
    const c = /sm_sid=([a-f0-9]{64})/.exec(req.headers.cookie || "");
    if (c) await db.query("DELETE FROM sessions WHERE token=$1", [sha(c[1])]);
    return send(res, 200, { ok: true }, null, { "Set-Cookie": "sm_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" });
  }

  const user = await userOf(req);
  if (!user) return fail(res, 401, "Please log in.");

  // ---- customer: orders and ratings ----
  if (method === "GET" && url === "/api/orders") {
    const o = await db.query("SELECT id,total,status,created,payment FROM orders WHERE user_id=$1 ORDER BY created DESC LIMIT 100", [user.id]);
    const orders = await itemsFor(o.rows);
    const mine = await db.query("SELECT product_id,stars FROM ratings WHERE user_id=$1", [user.id]);
    const mm = new Map(mine.rows.map(r => [r.product_id, r.stars]));
    orders.forEach(x => x.items.forEach(i => { i.mine = mm.get(i.id) || 0; }));
    return send(res, 200, { orders });
  }
  if (method === "POST" && url === "/api/orders") {
    const b = await body(req);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return fail(res, 400, "Your cart is empty.");
    const merged = new Map();
    for (const it of b.items) {
      if (!it || !iv(it.id, 1, 1e12) || !iv(it.qty, 1, 10)) return fail(res, 400, "Invalid item in cart.");
      merged.set(it.id, Math.min(10, (merged.get(it.id) || 0) + it.qty));
    }
    const payOk = ["Cash on delivery"].concat(CFG.upi || CFG.upiPhone ? ["UPI"] : []);
    if (!str(b.name, 2, 60) || !/^[6-9]\d{9}$/.test(b.phone) || !/^[1-9]\d{5}$/.test(b.pin) || !str(b.address, 10, 200) || !payOk.includes(b.payment)) return fail(res, 400, "Check your delivery details.");
    const id = "SM" + crypto.randomBytes(4).toString("hex").toUpperCase();
    const result = await db.tx(async q => {
      let sub = 0; const lines = [];
      for (const [pid, qty] of merged) {
        const p = (await q("SELECT id,p FROM products WHERE id=$1 AND active=1", [pid])).rows[0];
        if (!p) return null;
        sub += p.p * qty; lines.push([p.id, qty, p.p]);
      }
      const total = sub + deliveryFee(sub);
      await q("INSERT INTO orders(id,user_id,total,name,phone,pin,address,payment,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [id, user.id, total, b.name.trim(), b.phone, b.pin, b.address.trim(), b.payment, Date.now()]);
      for (const l of lines) await q("INSERT INTO order_items(order_id,product_id,qty,price) VALUES($1,$2,$3,$4)", [id, l[0], l[1], l[2]]);
      return total;
    });
    if (result === null) return fail(res, 400, "An item in your cart is unavailable. Remove it and try again.");
    return send(res, 201, { id, total: result });
  }
  if (method === "POST" && url === "/api/ratings") {
    const b = await body(req);
    if (!iv(b.product_id, 1, 1e12) || !iv(b.stars, 1, 5)) return fail(res, 400, "Choose 1 to 5 stars.");
    const ok = await db.query("SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=$1 AND oi.product_id=$2 AND o.status='Delivered' LIMIT 1", [user.id, b.product_id]);
    if (!ok.rows.length) return fail(res, 403, "You can rate a product after your order is delivered.");
    await db.query("INSERT INTO ratings(user_id,product_id,stars,created) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,product_id) DO UPDATE SET stars=EXCLUDED.stars, created=EXCLUDED.created", [user.id, b.product_id, b.stars, Date.now()]);
    const s = (await db.query("SELECT COALESCE(AVG(stars),0) AS avg, COUNT(*) AS cnt FROM ratings WHERE product_id=$1", [b.product_id])).rows[0];
    return send(res, 200, { r: r1(s.avg), rc: Number(s.cnt) });
  }

  // ---- admin ----
  if (url.startsWith("/api/admin/")) {
    if (!user.admin) return fail(res, 403, "Admins only.");
    const ORD = "SELECT o.id,o.total,o.name,o.phone,o.pin,o.address,o.payment,o.status,o.created,u.name AS customer,u.id AS uid FROM orders o JOIN users u ON u.id=o.user_id";
    if (method === "GET" && url === "/api/admin/orders") return send(res, 200, { orders: await itemsFor((await db.query(ORD + " ORDER BY o.created DESC LIMIT 200")).rows) });
    if (method === "GET" && url === "/api/admin/customers") {
      const r = await db.query("SELECT u.id,u.name,u.email,COUNT(o.id) AS orders, COALESCE(SUM(CASE WHEN o.status<>'Cancelled' THEN o.total ELSE 0 END),0) AS spent, COALESCE(MAX(o.created),0) AS last FROM users u LEFT JOIN orders o ON o.user_id=u.id WHERE u.email<>$1 GROUP BY u.id ORDER BY COALESCE(MAX(o.created),0) DESC, u.id DESC LIMIT 500", [ADMIN_EMAIL || "-"]);
      return send(res, 200, { customers: r.rows.map(c => ({ id: c.id, name: c.name, email: c.email, orders: Number(c.orders), spent: Number(c.spent), last: Number(c.last) })) });
    }
    m = /^\/api\/admin\/customers\/(\d{1,12})\/orders$/.exec(url);
    if (method === "GET" && m) {
      const c = (await db.query("SELECT id,name,email FROM users WHERE id=$1", [Number(m[1])])).rows[0];
      if (!c) return fail(res, 404, "Customer not found.");
      const o = await db.query(ORD + " WHERE o.user_id=$1 ORDER BY o.created DESC LIMIT 200", [c.id]);
      return send(res, 200, { customer: { id: c.id, name: c.name, email: c.email }, orders: await itemsFor(o.rows) });
    }
    if (method === "POST" && url === "/api/admin/status") {
      const b = await body(req);
      if (!STATUSES.includes(b.status) || typeof b.id !== "string") return fail(res, 400, "Invalid status.");
      const r = await db.query("UPDATE orders SET status=$1 WHERE id=$2", [b.status, b.id]);
      return r.rowCount ? send(res, 200, { ok: true }) : fail(res, 404, "Order not found.");
    }
    if (method === "GET" && url === "/api/admin/products") return send(res, 200, { products: (await db.query(PRODUCT_SQL + " GROUP BY p.id ORDER BY p.id")).rows.map(productRow) });
    if (method === "POST" && url === "/api/admin/image") {
      const b = await body(req, 450000);
      const buf = typeof b.data === "string" ? Buffer.from(b.data.replace(/^data:image\/jpeg;base64,/, ""), "base64") : null;
      if (!buf || buf.length < 100 || buf.length > 300000 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return fail(res, 400, "Upload a JPEG photo (under 300 KB).");
      const r = await db.query("INSERT INTO images(mime,data,created) VALUES('image/jpeg',$1,$2) RETURNING id", [buf, Date.now()]);
      return send(res, 201, { id: r.rows[0].id, url: imgUrl(r.rows[0].id) });
    }
    if (method === "POST" && url === "/api/admin/product") {
      const b = await body(req);
      if (!str(b.n, 2, 80) || !str(b.c, 2, 30) || !iv(b.p, 1, 1000000) || !iv(b.m, b.p, 1000000) || !str(b.e, 1, 12)) return fail(res, 400, "Check the product details. MRP cannot be lower than the price.");
      const act = b.active ? 1 : 0;
      let imageId = null;
      if (b.image_id !== undefined && b.image_id !== null) {
        if (!iv(b.image_id, 1, 1e12) || !(await db.query("SELECT 1 FROM images WHERE id=$1", [b.image_id])).rows.length) return fail(res, 400, "Photo not found. Upload it again.");
        imageId = b.image_id;
      }
      if (b.id !== undefined) {
        if (!iv(b.id, 1, 1e12)) return fail(res, 400, "Invalid product.");
        const r = b.image_id === undefined
          ? await db.query("UPDATE products SET n=$1,c=$2,p=$3,m=$4,e=$5,active=$6 WHERE id=$7", [b.n.trim(), b.c.trim(), b.p, b.m, b.e.trim(), act, b.id])
          : await db.query("UPDATE products SET n=$1,c=$2,p=$3,m=$4,e=$5,active=$6,image_id=$7 WHERE id=$8", [b.n.trim(), b.c.trim(), b.p, b.m, b.e.trim(), act, imageId, b.id]);
        await cleanImages();
        return r.rowCount ? send(res, 200, { ok: true }) : fail(res, 404, "Product not found.");
      }
      await db.query("INSERT INTO products(n,c,p,m,e,b,image_id,active,created) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [b.n.trim(), b.c.trim(), b.p, b.m, b.e.trim(), COLORS[Math.floor(Math.random() * COLORS.length)], imageId, act, Date.now()]);
      return send(res, 201, { ok: true });
    }
    if (method === "POST" && url === "/api/admin/product-delete") {
      const b = await body(req);
      if (!iv(b.id, 1, 1e12)) return fail(res, 400, "Invalid product.");
      const used = await db.query("SELECT 1 FROM order_items WHERE product_id=$1 LIMIT 1", [b.id]);
      if (used.rows.length) { await db.query("UPDATE products SET active=0 WHERE id=$1", [b.id]); return send(res, 200, { deleted: false, hidden: true }); }
      const r = await db.query("DELETE FROM products WHERE id=$1", [b.id]);
      await cleanImages();
      return r.rowCount ? send(res, 200, { deleted: true }) : fail(res, 404, "Product not found.");
    }
    return fail(res, 404, "Not found");
  }
  return fail(res, 404, "Not found");
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (e && (e.message === "big" || e.message === "bad")) return fail(res, 400, "Bad request.");
    console.error(e);
    if (!res.headersSent) fail(res, 500, "Server error. Please try again.");
  });
});

async function seed() {
  if (process.env.SEED_DEMO === "0") return;
  if (Number((await db.query("SELECT COUNT(*) AS c FROM products")).rows[0].c) > 0) return;
  for (let i = 0; i < DEMO.length; i++) {
    const d = DEMO[i];
    await db.query("INSERT INTO products(n,c,p,m,e,b,active,created) VALUES($1,$2,$3,$4,$5,$6,1,$7)", [d[0], d[1], d[2], d[3], d[4], COLORS[i % COLORS.length], Date.now()]);
  }
  console.log("Added demo products.");
}
async function seedAdmin() {
  if (!ADMIN_EMAIL) return console.log("Admin panel disabled: set ADMIN_EMAIL and ADMIN_PASSWORD to enable it.");
  if (ADMIN_PASSWORD.length < 10) { ADMIN_EMAIL = ""; return console.log("Admin panel disabled: ADMIN_PASSWORD must be at least 10 characters."); }
  const salt = crypto.randomBytes(16).toString("hex"), hash = (await scrypt(ADMIN_PASSWORD, salt)).toString("hex");
  const u = (await db.query("SELECT id FROM users WHERE email=$1", [ADMIN_EMAIL])).rows[0];
  if (u) { await db.query("UPDATE users SET salt=$1,hash=$2 WHERE id=$3", [salt, hash, u.id]); await db.query("DELETE FROM sessions WHERE user_id=$1", [u.id]); }
  else await db.query("INSERT INTO users(name,email,salt,hash,created) VALUES('Admin',$1,$2,$3,$4)", [ADMIN_EMAIL, salt, hash, Date.now()]);
  console.log("Admin ready: " + ADMIN_EMAIL);
}

db.migrate().then(seed).then(seedAdmin)
  .then(() => server.listen(PORT, () => console.log("Super Mart running on port " + PORT)))
  .catch(e => { console.error("Startup failed:", e.message); process.exit(1); });
module.exports = { server };
