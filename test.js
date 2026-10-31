"use strict";
// Integration test: starts the real server with a fake DB and exercises every API route.
process.env.PORT = "3199"; process.env.NODE_ENV = "test"; process.env.TRUST_PROXY = "1";
process.env.ADMIN_EMAIL = "owner@shop.in"; process.env.ADMIN_PASSWORD = "OwnerPass#2026";
process.env.WHATSAPP = "7025005875"; process.env.UPI_PHONE = "7025005875";
const path = require("node:path");
const dbPath = require.resolve("./db.js");
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: require("./test-fake-db.js") };
require("./server.js");

const B = "http://localhost:3199", J = { "Content-Type": "application/json" };
let pass = 0, bad = 0;
const ok = (c, m) => { if (c) pass++; else { bad++; console.log("FAIL:", m); } };
function client(ip) {
  let ck = "";
  return async (url, body, method, extra) => {
    const r = await fetch(B + url, { method: method || (body ? "POST" : "GET"), headers: Object.assign({}, body ? J : {}, ck ? { cookie: ck } : {}, ip ? { "x-forwarded-for": ip } : {}, extra || {}), body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(";")[0].startsWith("sm_sid=;") ? "" : sc.split(";")[0];
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* not json */ }
    return { s: r.status, j, h: r.headers, t };
  };
}
(async () => {
  await new Promise(r => setTimeout(r, 1500));
  const anon = client("1.1.1.1"), cu = client("2.2.2.2"), ad = client("3.3.3.3"), cu2 = client("4.4.4.4");
  let r = await anon("/healthz"); ok(r.s === 200, "health");
  r = await anon("/"); ok(r.s === 200 && /Super/.test(r.t) && r.h.get("content-security-policy"), "index + CSP");
  r = await anon("/api/config"); ok(r.j.whatsapp === "917025005875" && r.j.upiPhone === "7025005875", "config adds +91");
  r = await anon("/api/products"); ok(r.j.products.length === 16 && r.j.products[0].rc === 0, "16 demo products");
  r = await anon("/api/orders"); ok(r.s === 401, "orders need login");
  r = await anon("/api/admin/orders"); ok(r.s === 401, "admin needs login");

  r = await cu("/api/register", { name: "Anu K", email: "Anu@X.com", password: "password123" }); ok(r.s === 200 && r.j.user.admin === false, "register");
  r = await anon("/api/register", { name: "Evil", email: "owner@shop.in", password: "password123" }); ok(r.s === 409, "cannot register admin email");
  r = await anon("/api/register", { name: "A", email: "bad", password: "x" }); ok(r.s === 400, "validation");
  r = await cu("/api/me"); ok(r.j.user && r.j.user.email === "anu@x.com", "me");
  r = await cu("/api/admin/orders"); ok(r.s === 403, "customer blocked from admin");
  r = await cu("/api/admin/product", { n: "Hack", c: "x1", p: 1, m: 1, e: "x" }); ok(r.s === 403, "customer cannot add product");

  const order = { items: [{ id: 3, qty: 1, price: 1 }, { id: 14, qty: 2 }], name: "Anu K", phone: "9876501234", pin: "682001", address: "House 5, Kochi, Kerala", payment: "UPI" };
  r = await cu("/api/orders", order); ok(r.s === 201 && r.j.total === 999 + 458, "order total computed by server (price tampering ignored): " + JSON.stringify(r.j));
  const oid = r.j.id;
  r = await cu("/api/orders", Object.assign({}, order, { items: [{ id: 1, qty: -5 }] })); ok(r.s === 400, "negative qty rejected");
  r = await cu("/api/orders", Object.assign({}, order, { items: [{ id: 9999, qty: 1 }] })); ok(r.s === 400, "unknown product rejected");
  r = await cu("/api/orders", Object.assign({}, order, { payment: "Bitcoin" })); ok(r.s === 400, "bad payment rejected");
  r = await cu("/api/orders"); ok(r.j.orders.length === 1 && r.j.orders[0].items.length === 2 && r.j.orders[0].items[0].mine === 0, "customer sees own order history");
  r = await cu("/api/ratings", { product_id: 3, stars: 5 }); ok(r.s === 403, "cannot rate before delivery");

  r = await ad("/api/login", { email: "owner@shop.in", password: "wrong-password" }); ok(r.s === 401, "admin wrong password");
  r = await ad("/api/login", { email: "owner@shop.in", password: "OwnerPass#2026" }); ok(r.s === 200 && r.j.user.admin === true, "admin login");
  r = await ad("/api/admin/orders"); ok(r.j.orders.length === 1 && r.j.orders[0].customer === "Anu K", "admin sees order with customer name");
  r = await ad("/api/admin/status", { id: oid, status: "Hacked" }); ok(r.s === 400, "bad status rejected");
  r = await ad("/api/admin/status", { id: oid, status: "Delivered" }); ok(r.s === 200, "mark delivered");

  r = await cu("/api/ratings", { product_id: 3, stars: 5 }); ok(r.s === 200 && r.j.r === 5 && r.j.rc === 1, "rate after delivery");
  r = await cu("/api/ratings", { product_id: 3, stars: 4 }); ok(r.s === 200 && r.j.r === 4 && r.j.rc === 1, "re-rating updates, not duplicates");
  r = await cu("/api/ratings", { product_id: 5, stars: 5 }); ok(r.s === 403, "cannot rate a product never bought");
  r = await cu("/api/ratings", { product_id: 3, stars: 9 }); ok(r.s === 400, "stars range");
  r = await anon("/api/products"); const sp = r.j.products.find(p => p.id === 3); ok(sp.r === 4 && sp.rc === 1, "public product shows average rating");
  r = await cu("/api/orders"); ok(r.j.orders[0].status === "Delivered" && r.j.orders[0].items.find(i => i.id === 3).mine === 4, "customer sees status + own rating");

  r = await cu2("/api/register", { name: "Ravi P", email: "ravi@x.com", password: "password123" });
  r = await cu2("/api/orders", { items: [{ id: 1, qty: 1 }], name: "Ravi P", phone: "9123456780", pin: "682002", address: "Flat 2, Kochi, Kerala", payment: "Cash on delivery" }); ok(r.s === 201, "second customer order");
  r = await ad("/api/admin/customers"); ok(r.j.customers.length === 2, "customers list excludes admin: " + r.j.customers.length);
  const anu = r.j.customers.find(c => c.email === "anu@x.com"); ok(anu && anu.orders === 1 && anu.spent === 1457, "customer stats");
  r = await ad("/api/admin/customers/" + anu.id + "/orders"); ok(r.j.orders.length === 1 && r.j.customer.name === "Anu K", "per-customer order list");
  r = await ad("/api/admin/customers/99999/orders"); ok(r.s === 404, "unknown customer");

  r = await ad("/api/admin/image", { data: "not an image" }); ok(r.s === 400, "reject non-image");
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7)]).toString("base64");
  r = await ad("/api/admin/image", { data: "data:image/jpeg;base64," + jpg }); ok(r.s === 201 && r.j.id, "upload photo"); const imgId = r.j.id;
  r = await fetch(B + "/img/" + imgId); ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg" && (await r.arrayBuffer()).byteLength === 504, "serve photo bytes");
  r = await ad("/api/admin/product", { n: "Acrylic Phone Stand", c: "Accessories", p: 149, m: 199, e: "📱", active: true, image_id: imgId }); ok(r.s === 201, "add product with photo");
  r = await anon("/api/products"); const np = r.j.products.find(p => p.n === "Acrylic Phone Stand"); ok(np && np.img === "/img/" + imgId, "public product has image url");
  r = await ad("/api/admin/product", { n: "Bad", c: "Grocery", p: 200, m: 100, e: "x" }); ok(r.s === 400, "mrp < price rejected");
  r = await ad("/api/admin/product", { id: np.id, n: "Acrylic Phone Stand", c: "Accessories", p: 129, m: 199, e: "📱", active: false }); ok(r.s === 200, "edit keeps photo");
  r = await anon("/api/products"); ok(!r.j.products.find(p => p.id === np.id), "hidden product not public");
  r = await ad("/api/admin/products"); const hp = r.j.products.find(p => p.id === np.id); ok(hp && hp.on === 0 && hp.img, "admin still sees hidden product with photo");
  r = await ad("/api/admin/product-delete", { id: np.id }); ok(r.j.deleted === true, "delete unused product");
  r = await ad("/api/admin/product-delete", { id: 3 }); ok(r.j.deleted === false && r.j.hidden === true, "ordered product is hidden, not deleted");
  r = await cu("/api/orders"); ok(r.j.orders[0].items.find(i => i.id === 3), "order history survives product hiding");

  r = await anon("/api/login", { email: "a@b.c", password: "x12345678" }, "POST", { origin: "http://evil.com" }); ok(r.s === 403, "cross-origin POST blocked");
  r = await anon("/api/login", { email: "a@b.c' OR 1=1--", password: "x12345678" }); ok(r.s === 400, "SQL injection attempt rejected");
  r = await fetch(B + "/api/login", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }); ok(r.status === 415, "non-JSON blocked");
  r = await cu("/api/logout", {}); r = await cu("/api/me"); ok(r.j.user === null, "logout ends session");
  const rl = client("9.9.9.9"); let last = 0; for (let i = 0; i < 12; i++) last = (await rl("/api/login", { email: "ravi@x.com", password: "wrongpass1" })).s;
  ok(last === 429, "login rate limit"); r = await client("8.8.8.8")("/api/login", { email: "anu@x.com", password: "password123" }); ok(r.s === 200, "rate limit is per client, not global");
  console.log(`\n${pass} passed, ${bad} failed`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
