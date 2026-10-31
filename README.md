# Super Mart (free hosting edition)

Node.js shop with customer accounts, order history, star ratings, admin panel, WhatsApp ordering and UPI.
**One web service serves both the website and the API** (no CORS, safe same-site cookies) and keeps all data in
**PostgreSQL**, so nothing important lives on the server's disk.

```
Phone browser --> Render (Node, free web service)  --> Neon (PostgreSQL, free)
                  your-shop.onrender.com               orders, customers, sessions, ratings, product photos
```
Why not Cloudflare Pages + separate API? A split site needs CORS and cross-site cookies, which many mobile browsers block,
and it adds a second thing to configure. One service is simpler and more reliable.

## Files (all in one folder on purpose: Android cannot upload folders to GitHub)
| File | Purpose |
|---|---|
| server.js | web server and all API routes |
| db.js | PostgreSQL connection and migration runner |
| 001_init.sql | database schema (runs automatically on first start) |
| index.html, app.js, style.css | the website |
| package.json | dependency (`pg`), start command |
| env.example | list of environment variable names |
| test.js, test-fake-db.js | optional automated tests (not needed for deployment) |

## Free services and their limits (checked in provider docs on 31 Oct 2026; re-check, free plans change)
- **Neon (database):** free plan, no card. 0.5 GB storage and 100 compute-hours per month per project; compute sleeps after
  5 idle minutes and wakes in a moment. If a monthly limit is hit, compute is suspended until next month. Backups are limited,
  so export your data now and then.
- **Render (web service):** free instance sleeps after 15 minutes without visitors; the first visit afterwards can take up to
  about a minute. Its local disk is erased on restart, which is why this project stores everything in Neon.
  Render can restart a free service at any time. Free subdomain: `something.onrender.com`.
- **GitHub:** only stores your code. (GitHub Pages is not allowed for running an online shop, so it is not used.)
- Product photos are stored inside Neon (about 40-80 KB each), so 0.5 GB holds thousands.

## Deploy from an Android phone
Use Chrome. For GitHub and Render you may need "Desktop site" (Chrome menu) if a button is missing.

### 1. Get the files
Download `supermart.zip`, open it in the **Files** app and extract it. You get the folder with the files above.

### 2. Neon database
1. Open neon.com, sign up (Google/GitHub is fine). Create a project named `super-mart`; choose the region nearest India in the list.
2. On the project dashboard tap **Connect**. Copy the connection string (starts with `postgresql://`). This is your `DATABASE_URL`.
   Keep it private: it contains the database password.

### 3. GitHub
1. github.com, sign up, tap **+ > New repository**. Name `super-mart`, choose **Private**, tap Create.
2. Tap **uploading an existing file** (or Add file > Upload files). Select all the extracted files (about 10), wait for upload, tap **Commit changes**.
   Do not upload anything containing real passwords.

### 4. Render web service
1. render.com, sign up with GitHub. **New > Web Service**, connect your GitHub account, pick the `super-mart` repo.
2. Fill in exactly:
   - Language: **Node**
   - Branch: `main`
   - Root Directory: *(leave empty)*
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
3. Under **Environment Variables** add these (names must match exactly):

| Name | Value / where to get it |
|---|---|
| DATABASE_URL | the Neon connection string from step 2 |
| ADMIN_EMAIL | your own email; this becomes the admin login |
| ADMIN_PASSWORD | a long password you invent (at least 10 characters). Never share or commit it |
| WHATSAPP | order WhatsApp number, e.g. `917025005875` (10 digits also works, +91 is added) |
| UPI_PHONE | phone number customers can pay by UPI, e.g. `7025005875` |
| UPI_ID | optional full UPI ID like `name@bank` (from GPay/PhonePe profile). If set, customers get a "Pay with UPI" button |
| STORE_NAME | `Super Mart` |
| NODE_ENV | `production` |
| TRUST_PROXY | `1` |
| SEED_DEMO | `1` to start with 16 demo products, `0` for an empty shop |

4. Tap **Create Web Service**. The first deploy takes a few minutes. When the log says `Super Mart running`, open the URL shown at the top.

### 5. Test the published site (do all of these)
1. Open the URL. Products appear (first load can be slow if the service was asleep).
2. Create a customer account with a different email, add items, place an order (Cash on delivery). Tap **Send order on WhatsApp**: WhatsApp must open with the order text.
3. Tap your name at the top: the order appears under My orders.
4. Log out, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. An **Admin** button appears.
5. Admin > Orders: the order is there. Set status **Delivered**. Admin > Customers: tap the customer to see only their orders.
6. Log in as the customer again: stars appear on the delivered items; rate one. The rating shows on the product card.
7. Admin > Products: add a product with a photo from your gallery, edit it, hide it, delete it.
8. Wait 20 minutes, open the site again and check that your order and customer account are still there (persistence).
9. UPI: choose UPI at checkout and confirm the shown number or button is correct. Pay Rs 1 to yourself from another phone first.

## Changing the site later
On GitHub open a file, tap the pencil icon, edit, **Commit changes**. Render redeploys by itself. Or ask Claude for the change.
Products, prices, photos and order status are changed in the Admin panel, no code needed.
To change the admin password: edit `ADMIN_PASSWORD` in Render > Environment and let it redeploy (the old password stops working).

## Rules built in
- Passwords are hashed with scrypt. Sessions are random tokens stored (hashed) in the database, sent in an HttpOnly, SameSite=Strict, Secure cookie.
- All admin routes check the admin account server-side. The admin password comes only from environment variables.
- Prices and totals are calculated on the server; browser values are ignored.
- Login and register are rate-limited per IP and per email (memory based, resets when the service restarts).
- A customer can rate a product only after an order containing it is marked **Delivered**.
- A product that has past orders cannot be deleted; it is hidden instead so order history stays intact.

## What cannot work reliably on a free plan
- Slow first visit after idle (Render sleep, Neon wake-up).
- No automatic payment checking. WhatsApp links cannot attach pictures; the order text includes a link to each product photo.
  Check your bank/UPI app before marking an order **Paid** or sending goods.
- No emails (no password reset, no order emails). A customer who forgets a password needs a new account or you must help manually.
- Free-tier quotas can run out under heavy traffic, and providers may change free plans. This is not "free forever".
- Limited backups on Neon free.

## What was tested, and what was not
Tested by me (`npm test`, 52 checks): every API route, login/admin protection, price tampering, ratings rules, per-customer
order views, product add/edit/hide/delete, photo upload and serving, rate limiting. These ran against an in-memory SQLite stand-in
(`test-fake-db.js`) because no PostgreSQL server was available where the code was written.
**Not tested:** the real PostgreSQL/Neon connection, the Render deployment, the website in a phone browser (screens, photo picker,
star taps), and opening WhatsApp/UPI links. Expect that a first deploy may need a small fix. If something fails, copy the error from
Render > Logs and send it to Claude.

## Troubleshooting
- Log says `DATABASE_URL is not set`: add it under Environment and redeploy.
- `Startup failed ... password authentication` or `ENOTFOUND`: re-copy the Neon connection string.
- Site says "Could not load products": wait a minute (waking up) and refresh; if it persists check Render > Logs.
- No Admin button: ADMIN_EMAIL/ADMIN_PASSWORD missing or password shorter than 10 characters (the log says "Admin panel disabled").
