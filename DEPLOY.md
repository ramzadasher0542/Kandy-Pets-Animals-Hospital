# DEPLOY - CeylonPets on Vercel

Vercel is the only production deployment target. Supabase provides Auth,
Postgres, RLS, cloud sync, and persistence.

## Vercel Project Settings

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 20 or newer
- Required environment variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

Never add a service-role key, database password, sync secret, or other
write-authorizing credential to a `VITE_*` variable. Vite embeds those values in
the browser bundle.

## Release Checklist

1. Run `npm run lint`.
2. Run `npm run build`.
3. Merge the reviewed change into `main`.
4. Wait for the Vercel deployment to report `Ready`.
5. Verify administrator login, restricted staff login, Settings visibility, and
   the controlled checkout smoke test.
6. Confirm the Supabase Auth/RLS health checks remain green.

## Security Boundary

- Supabase Auth is the only login mechanism.
- Postgres RLS is the data boundary; browser UI checks are not treated as a
  security boundary.
- Anonymous table access and destructive RPC execution remain denied.
- Browser-initiated cloud erase remains disabled.
- Staff Management and payroll are deferred from the active beta UI. Their cloud tables remain untouched and are not part of the current release scope.
- The Data & Operations screen offers a versioned full JSON snapshot and an
  admin-confirmed beta merge restore. Restore never deletes rows or changes
  Supabase Auth passwords. Provider-managed recovery is still required for
  catastrophic database loss.

## Recovery Boundary

Supabase free tier does not provide certified scheduled backups or PITR. Keep
weekly exports outside Supabase. The browser restore is a convenience merge,
not a certified disaster-recovery system; do not claim enterprise recovery
readiness until an external restore procedure is verified or a paid recovery
plan exists.

## Rollback

Use the Vercel deployment history to promote the last known-good deployment.
After rollback, re-run the administrator and restricted-staff login checks.
