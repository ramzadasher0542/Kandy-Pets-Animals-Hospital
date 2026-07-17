# Onboarding a New Hospital — CeylonPets VHMS

End-to-end runbook for deploying a fresh installation to a paying client.

**Every deployment gets its own Supabase project, its own sync secret, and its own
Provider + Owner passwords.** Nothing is ever reused between clients. One reused
Provider password means one leak compromises every hospital you have ever sold to.

> ⚠️ **Do NOT run `supabase_schema.sql` for a new hospital.** That file is the
> incremental ALTER history of the original Kandy Pets installation and is kept
> only as a historical record. Use **`bootstrap_schema.sql`**.

---

## 0. Before you start

- The Supabase account/organisation that will own the new project
- `openssl` available (`openssl version`)
- Node + `npx tsx` available
- A password manager open and ready — you will paste two passwords into it and
  they will never be shown again

---

## 1. Create the Supabase project

1. Supabase dashboard → **New project**.
2. Name it after the client (e.g. `colombo-pet-clinic`).
3. Pick the region closest to the clinic (Sri Lanka → `ap-northeast-1`).
4. Save the generated **database password** into your password manager immediately.
5. Wait for status **ACTIVE_HEALTHY**.

---

## 2. Generate this deployment's sync secret

```bash
openssl rand -hex 32
```

Copy it into your password manager under this client's entry, labelled
**"sync secret"**. This value is what the app sends in the `x-sync-secret`
header; every RLS policy checks it. **It is unique per hospital.**

---

## 3. Run the bootstrap schema

`bootstrap_schema.sql` creates all **23 tables**, enables **RLS on all 23**, and
creates **23 policies** — the consolidated final shape, not the ALTER history.

1. Substitute the real secret (do **not** edit the file in place and commit it):

   ```bash
   SECRET=$(openssl rand -hex 32)      # or reuse the one from step 2
   sed "s/__SYNC_SECRET_PLACEHOLDER__/$SECRET/g" bootstrap_schema.sql > /tmp/bootstrap_filled.sql
   grep -c '__SYNC_SECRET_PLACEHOLDER__' /tmp/bootstrap_filled.sql   # MUST print 0
   ```

2. Paste `/tmp/bootstrap_filled.sql` into the Supabase **SQL Editor** and run it.

3. **Delete `/tmp/bootstrap_filled.sql` afterwards** — it contains the live secret:

   ```bash
   rm -f /tmp/bootstrap_filled.sql
   ```

4. Verify (all counts must be **23**, `rls_missing` must be **0**):

   ```sql
   SELECT
     (SELECT count(*) FROM pg_tables  WHERE schemaname='public') AS tables,
     (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
     (SELECT count(*) FROM pg_tables  WHERE schemaname='public' AND rowsecurity=true)  AS rls_enabled,
     (SELECT count(*) FROM pg_tables  WHERE schemaname='public' AND rowsecurity=false) AS rls_missing;
   ```

> **Why camelCase matters.** Every column is quoted camelCase matching
> `src/types.ts` exactly, because the sync engine does **no** field-name
> translation. A single snake_case column silently breaks sync for that field
> forever: PostgREST rejects the unknown column, `syncEngine` logs and swallows
> the error, and the row never leaves the till. Never "fix" a column by renaming
> it to snake_case.

---

## 4. Generate the Provider + Owner passwords

```bash
npx tsx scripts/onboard-new-hospital.ts "Colombo Pet Clinic"
```

This prints, **once**:

- **Provider** (`provider_root`) — vendor root. **You keep this. The hospital never gets it.**
- **Hospital Owner** (`hospital_owner`) — the client's top account.
- An `INSERT` statement containing **only bcrypt hashes**.

**Do this immediately, in this order:**

1. Copy the **Provider** password → your password manager (your own vault).
2. Copy the **Owner** password → a **separate** entry, marked for handover.
3. Run the printed `INSERT` in the Supabase SQL Editor.
4. **Clear your terminal scrollback** (`clear && printf '\033[3J'`, or close the window).

**Never:**
- paste either password into a chat, an AI tool, a ticket, or a commit
- write them to a file, screenshot them, or email them to yourself
- store the Provider and Owner passwords in the same place
- reuse either password on another deployment

---

## 5. Configure the app's `.env`

```env
VITE_SUPABASE_URL=https://<new-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<new project's anon/publishable key>
VITE_SYNC_SECRET=<the sync secret from step 2>
```

`.env` must be **git-ignored**. Confirm before building:

```bash
git check-ignore -v .env    # must print a matching .gitignore rule
```

---

## 6. Package the Electron app

```bash
npm install
npx tsc --noEmit          # must exit 0
npm run build
# then your Electron packaging step
```

Install on the clinic's machine and confirm:
- the login screen lists `hospital_owner`
- signing in as `hospital_owner` works with the password from step 4
- **`provider_root` is NOT handed over** and its password is not on that machine

---

## 7. Hand over the Owner password — separately

The Owner password must reach the client through a **different channel** from
where the Provider password lives.

- ✅ Provider password → your password manager, only.
- ✅ Owner password → spoken on a call, or a one-time secret link (e.g. a
  self-destructing note), or written on paper handed over in person.
- ❌ **Never** send both through the same app, email thread, or chat.
- ❌ **Never** send the Owner password through the VHMS itself.
- Tell the client to change it on first login (Settings → Staff & Security →
  Change Password, minimum 8 characters).

---

## 8. Post-handover checklist

- [ ] `bootstrap_schema.sql` verification query returned 23 / 23 / 23 / 0
- [ ] `INSERT` ran; `SELECT username, role FROM staff_users` shows
      `provider_root → provider` and `hospital_owner → owner`
- [ ] Both `pin` values start with `$2b$10$` (bcrypt — never plaintext)
- [ ] Provider password in your vault; Owner password delivered separately
- [ ] Terminal scrollback cleared; `/tmp/bootstrap_filled.sql` deleted
- [ ] `.env` git-ignored and not committed
- [ ] Client confirmed they can log in and changed their password

---

## Notes

- **`auth_audit` is deliberately not a cloud table.** Authorization records stay
  local to the till by design (`syncEngine`'s `STORE_MAPPINGS` excludes it).
- **`provider` cannot be created from any UI** — not the staff screen, not the
  access matrix. This script is the only sanctioned way to mint one.
- **First sync takes ~30s.** The engine pulls all 23 tables before its first
  push and is rate-limited to one cycle per 30 seconds. An empty cloud right
  after install is expected, not a fault.
