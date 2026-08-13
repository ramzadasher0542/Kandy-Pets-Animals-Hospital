# Onboarding a New Hospital - CeylonPets VHMS

This runbook describes the Vercel + Supabase Auth/RLS deployment model. Every
hospital gets its own Supabase project and its own Auth identities. Passwords
must stay in the owner's password manager and must never be committed, emailed
to the agent, or pasted into chat.

## 1. Create the Supabase project

1. Create a dedicated Supabase project for the hospital.
2. Save the database password in a password manager.
3. Wait for the project to report healthy.
4. Provision the schema and apply the current files under
   `supabase/migrations/` in order.

**Do not use `bootstrap_schema.sql` or `supabase_schema.sql` for a new
deployment yet.** They are historical schema scripts and contain the retired
shared-header policy model. A new Auth/RLS baseline must replace them before a
new hospital can be onboarded safely.

## 2. Create Auth identities

Create each staff identity in Supabase Authentication using email/password.
Confirm the email address through Supabase's normal verification flow. Do not
invent, reset, or store passwords in this repository.

Recommended first identity:

- One hospital administrator with role `admin`.
- Additional staff with only the role they need: `cashier`, `veterinarian`,
  `manager`, or `groomer`.

## 3. Link Auth to staff rows

Each active `public.users` row must point to exactly one Auth identity through
`auth_user_id`. Link identities only after confirming the email and intended
role. Verify that:

- `active = true`
- `is_deleted = false`
- `role` is the intended least-privilege role
- `auth_user_id` is unique
- no PIN hash is selected by browser queries

The administrator is the only clinic role with all panel and Settings access.
Use the administrator's Panel Access Matrix to filter other roles. Do not issue
`admin` or `provider` through the ordinary staff UI.

## 4. Configure Vercel

Set only these production variables in the Vercel project:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Never put a service-role key, database password, sync secret, or other
write-authorizing value in a `VITE_*` variable. Vite embeds those values in the
browser bundle.

## 5. Release checks

Run before merging:

```bash
npm run lint
npm run build
```

After Vercel reports `Ready`, verify:

1. Administrator login and all Settings tabs.
2. Non-admin login and filtered panels.
3. Anonymous access is denied by RLS.
4. A controlled appointment and checkout flow.
5. A second authenticated device can read the same authorized data.
6. Export and restore/recovery procedures are documented and tested.

## 6. Recovery boundary

Supabase free tier does not provide certified scheduled backups or PITR. Do not
claim enterprise recovery readiness until an external export/restore process or
a paid recovery plan has been verified.

Payroll is intentionally deferred. Do not configure or rely on the dormant
payslips table until the owner explicitly reopens that feature.

## 7. Vercel rollback

Use Vercel deployment history to promote the last known-good deployment. After
rollback, repeat the administrator and restricted-staff checks above.
