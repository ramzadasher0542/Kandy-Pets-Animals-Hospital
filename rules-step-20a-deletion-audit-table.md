Step 20A Rules: Create Missing Deletion Audit Table

Mission

Reconcile the missing deletion\_audit table in the live Supabase project. This is a schema-and-access task only. Do not change ReportsManager yet and do not create payslips; staff/payroll remains frozen.



Required Access

Use Supabase MCP.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Do not migrate or delete existing data.

Required Work

Inspect the live database, existing table conventions, current roles, RLS posture and the exact DeletionAudit TypeScript shape.

Confirm that public.deletion\_audit is absent before creating it.

Create the table with the repository's intended columns and compatible live types:

id uuid primary key default gen\_random\_uuid()

entity\_type text not null

entity\_id text not null

entity\_name text default ''

deleted\_by text not null

deleted\_at text not null

had\_history boolean default false

history\_summary text default ''

override\_confirmed boolean default false

created\_at timestamptz default now()

updated\_at timestamptz not null default now()

is\_deleted boolean not null default false

\_dirty boolean not null default false

Enable RLS.

Create only the least-privilege policies required by the current app and the next read-only ReportsManager step. Never grant to PUBLIC.

Do not copy the legacy x-sync-secret = '\_\_SYNC\_SECRET\_PLACEHOLDER\_\_' policy from the repository unchanged.

If the current local-PIN app only operates as anon, do not silently expose sensitive audit history with a broad anon policy. Stop and report the exact access decision needed, or use a safe no-read policy until authentication is resolved.

Add a checked-in migration/source SQL artifact and update only the corresponding deletion\_audit section of supabase\_schema.sql and bootstrap\_schema.sql if their policy definitions are stale.

Do not create or alter payslips, shift\_reconciliations, staff tables, auth tables or ReportsManager code.

Verification

Print SQL before applying it through Supabase MCP.

Verify the live table columns, nullability, defaults, RLS state, policies and grants after applying it.

Verify the table is empty and no existing tables/data were changed.

No mutating application test is required; no audit rows should be inserted.

Run npx tsc --noEmit and npm run build if source files changed.

Report the known F2/F3 baseline without repairing it.

Inspect the diff, commit only intended files and push to main.

Stop Conditions

Stop before applying SQL if:



The table already exists under another name or schema.

The live role/access model cannot safely support the intended read.

Creating a policy would require broad anon access to audit history.

The repository column contract differs from the live conventions.

Report the exact mismatch instead of guessing.





