# DEPLOY — Kandy Pets → Cloudflare Pages (supervised pilot)

Bridge deployment for ONE client, gated behind Cloudflare Access. Not the final
architecture (Electron packaging comes later). **Read the WARNING section before
going live.**

## 1. Cloudflare Pages — build settings

In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
(or Direct Upload of the `dist/` folder). Set:

| Setting | Value |
|---|---|
| Framework preset | None / Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20+ (set `NODE_VERSION=20` env var if needed) |

`public/_redirects` and `public/_headers` are copied into `dist/` automatically by
the build — they give SPA routing (no 404 on refresh/deep link) and security
headers. Do not move them.

## 2. Environment variables (Pages → Settings → Environment variables → Production)

Set these to the **same values as your local `.env`** (they get inlined into the
JavaScript bundle at build time):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_SYNC_SECRET`   ← ⚠ ends up readable in the bundle (see WARNING)

(EmailJS for the Z-Report is configured in-app under Settings, not via env.)

After setting env vars, trigger a redeploy so they are baked in.

## 3. Cloudflare Access (the ONLY thing stopping strangers)

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

1. **Application name**: Kandy Pets
2. **Session duration**: e.g. 24 hours
3. **Application domain**: your Pages domain (e.g. `kandy-pets.pages.dev`, or your
   custom domain if attached)
4. **Add policy**:
   - Policy name: `Allowed staff`
   - Action: **Allow**
   - Include → **Emails** → add each authorised email address (the allow-list)
5. Save. Now only those emails can load the app at all; everyone else is blocked
   by Cloudflare before the app even downloads.

Verify: open the Pages URL in an incognito window → you should hit Cloudflare's
login, and a non-listed email must be denied.

## 4. Post-deploy smoke test
- Load the URL (through Access) → login screen appears.
- Log in as `ashpoint_owner` with the default PIN → the red **DEFAULT PASSWORD IN
  USE** banner appears → change it to a 12+ char password immediately (see below).
- Refresh on any screen → no 404.

---

## ⚠️ WARNING — what is NOT secure about this deployment

This is a **supervised pilot**. It is safe ONLY because Cloudflare Access
restricts who can reach it. Do not remove Access, and do not treat this as
production-grade multi-tenant security.

1. **Default password on every fresh browser.** `system_config` does not sync, so
   any new browser/device starts with the shipped default provider password
   (`5692`). The in-app banner nags to change it, but the change is per-device and
   does not propagate. Anyone who reaches the app (i.e. anyone allow-listed in
   Access, or anyone if Access is misconfigured) can log in as root with `5692`
   until it is changed on that device.

2. **The Supabase sync secret is in the JavaScript bundle.** Verified in this
   build: `dist/assets/index-*.js` contains `VITE_SUPABASE_URL`, the
   `sb_publishable_…` anon key (Supabase's public key — expected), **and
   `VITE_SUPABASE_SYNC_SECRET`**. The current RLS policies (queried in an earlier
   session; not re-verifiable now — MCP offline) grant the `anon` role **ALL**
   operations when the `x-sync-secret` header matches. Because that secret is
   readable in the bundle, anyone who can download the bundle can **read, write,
   and delete every row** in the synced tables (clients, pets, appointments,
   medical_records, invoices, etc.). RLS does **not** stop them — the secret is
   the whole gate, and it has leaked. Cloudflare Access is what actually protects
   the data.

3. **No `sb_secret`/`service_role` key leaked** (checked) — so the exposure is
   bounded by the RLS policies above, not unlimited admin.

### Must change before this stops being a supervised pilot
- Move writes behind a real server (Edge Function / API) that holds the sync
  secret server-side, so it is never in the browser; tighten RLS to not trust a
  bundled header.
- Give each real user a real per-account credential (server-side auth), replacing
  the shared config-backed provider password.
- Rotate `VITE_SUPABASE_SYNC_SECRET` after the pilot (it is compromised by design
  here).
