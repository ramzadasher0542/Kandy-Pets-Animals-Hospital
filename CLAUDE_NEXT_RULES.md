Rules Claude Must Follow

Required Setup

Claude Opus 4.8.

Supabase MCP ON.

Authenticated GitHub checkout.

Authenticated production and kpah-dev Supabase access.

Keep Supabase and Vercel on free tiers.

Missing access means BLOCKED. Do not guess.



Login Design

Supabase Auth email/password is the real staff login.

Existing PINs are secondary confirmation only.

Map auth.uid() to the actual existing staff record.

No open signup.

No magic-link dependency.

No browser service-role key.

No client PIN, local role, or sync header as database security.

Safety

Never mutate clinic rows during testing.

Never run wipe, purge, TRUNCATE, bulk DELETE, or bulk UPDATE.

Never reopen anonymous access.

Never invent identities, passwords, schema, roles, or RLS predicates.

Never weaken a failing test.

Keep cloud erase disabled.

Keep production deny-by-default until authenticated RLS is proven.

Required Files

Create supabase/migrations/20260808\_free\_auth\_rls.sql.

Create tests/sql/step32\_free\_auth\_rls.test.sql.

Modify src/App.tsx login/session code and lines 1759-1775.

Modify src/lib/supabase.ts:54.

Modify src/lib/auth.ts.

Review src/lib/requireAuth.ts:52-63,246+ as UI-only.

Modify supabase\_schema.sql:35-756.

Modify bootstrap\_schema.sql:52-706.

Modify shift\_accounting\_rpc.sql:299-308.

Preserve safe changes in src/lib/db.ts:868-910 and src/components/SystemSettings.tsx:1035-1077.

Fix src/components/POSRegister.tsx:635 and tests/cv1-close-visit.spec.ts:95.

Confirm root STEP\_31\_RULES.md is absent.

Ready Gates

Real Supabase Auth login works.

Staff mapping works.

Authenticated RLS is verified live.

Accounting RPCs validate the actor.

Anonymous access remains denied.

Cloud erase remains disabled.

Typecheck and build pass.

Security tests pass.

Test A and Test B pass.

kpah-dev is a real mirror.

Synthetic pilot leaves zero residue.

All gates are required for FREE STAGING READY. Real clinic readiness additionally requires recovery proof, which is not available on the free Supabase tier.





