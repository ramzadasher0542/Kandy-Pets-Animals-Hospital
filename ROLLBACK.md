# Rollback — CeylonPets VHMS

Vercel is the only production deployment target. Use the Vercel deployment
history to promote the last known-good deployment if the current release has a
runtime regression.

## Recovery Steps

1. In Vercel, open the project deployment history and promote the previous
   `Ready` production deployment.
2. Verify the linked administrator can sign in through Supabase Auth.
3. Verify restricted staff access, Settings visibility, cloud reads, and the
   controlled checkout smoke test.
4. If the issue involves data, do not erase rows from the browser. Use the
   external backup/recovery procedure or provider-managed Supabase recovery.

## Identity Safety

- Auth passwords are managed only by Supabase Auth.
- Staff roles are linked through `public.users.auth_user_id`.
- Never add passwords, PINs, service-role keys, database passwords, or deployment
  tokens to source files, documentation, or browser code.
- If an Auth identity is missing its app role, link it to an active
  `public.users` row through the controlled Supabase SQL process, then verify
  the login before changing any clinical data.

## Beta Recovery Boundary

The Data & Operations screen provides a versioned JSON snapshot and an
admin-confirmed merge restore. It does not delete rows or change Auth
passwords. It is a beta convenience tool, not a substitute for a certified
disaster-recovery plan.
