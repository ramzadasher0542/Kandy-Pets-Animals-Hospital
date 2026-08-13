-- Step 34 — Cloud staff, payroll, and audit contracts
--
-- This migration is additive and idempotent. It creates the cloud tables that
-- the application boot path reads and writes. It does not modify or delete
-- existing clinical, financial, or identity rows.

begin;

-- Staff roster -----------------------------------------------------------
create table if not exists public.staff_profiles (
  id text primary key,
  "userId" text,
  "fullName" text not null,
  position text not null default '',
  department text not null default '',
  "employmentType" text not null default 'hourly',
  "hourlyRate" integer,
  "monthlySalary" integer,
  "hireDate" text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Time clock -------------------------------------------------------------
create table if not exists public.time_entries (
  id text primary key,
  "staffId" text not null,
  date text not null,
  "clockIn" timestamptz not null,
  "clockOut" timestamptz,
  "durationMinutes" integer,
  "enteredBy" text not null,
  source text not null default 'manager',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Staff schedule ---------------------------------------------------------
create table if not exists public.schedule_entries (
  id text primary key,
  "staffId" text not null,
  "shiftStart" timestamptz not null,
  "shiftEnd" timestamptz not null,
  role text not null default '',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Payroll ----------------------------------------------------------------
create table if not exists public.payslips (
  id text primary key,
  "staffId" text not null,
  "periodStart" text not null,
  "periodEnd" text not null,
  "grossPayCents" integer not null default 0,
  deductions jsonb not null default '[]'::jsonb,
  "netPayCents" integer not null default 0,
  status text not null default 'draft',
  "generatedBy" text not null,
  "generatedAt" timestamptz not null default now(),
  "paidAt" timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Clinical deletion audit -----------------------------------------------
create table if not exists public.deletion_audit (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  entity_name text,
  deleted_by text not null,
  deleted_at timestamptz not null,
  had_history boolean,
  history_summary text,
  override_confirmed boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

-- Authorization audit ----------------------------------------------------
create table if not exists public.auth_audit (
  id text primary key,
  action text not null,
  action_description text not null,
  attempted_by text not null,
  attempted_by_name text not null,
  attempted_by_role text not null,
  allowed boolean not null,
  is_override boolean not null default false,
  approved_by text,
  approved_by_name text,
  approved_by_role text,
  reason text,
  timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Config fields used by the cloud app. ----------------------------------
do $$
begin
  if to_regclass('public.system_config') is not null then
    alter table public.system_config
      add column if not exists action_policies jsonb not null default '{}'::jsonb;
  end if;
end
$$;

-- Every new table is deny-by-default until a linked Auth staff identity is
-- present. Existing rows are untouched.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'staff_profiles', 'time_entries', 'schedule_entries', 'payslips',
    'deletion_audit', 'auth_audit'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
  end loop;
end
$$;

-- Roster: all active staff may read; managers may maintain it.
drop policy if exists staff_select_staff_profiles on public.staff_profiles;
drop policy if exists staff_insert_staff_profiles on public.staff_profiles;
drop policy if exists staff_update_staff_profiles on public.staff_profiles;
create policy staff_select_staff_profiles on public.staff_profiles
  for select to authenticated using (public.is_staff());
create policy staff_insert_staff_profiles on public.staff_profiles
  for insert to authenticated with check (public.is_staff_manager());
create policy staff_update_staff_profiles on public.staff_profiles
  for update to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());

-- Time entries: staff may record/read clock data; the server still requires a
-- linked active Auth identity for every write.
drop policy if exists staff_select_time_entries on public.time_entries;
drop policy if exists staff_insert_time_entries on public.time_entries;
drop policy if exists staff_update_time_entries on public.time_entries;
create policy staff_select_time_entries on public.time_entries
  for select to authenticated using (public.is_staff());
create policy staff_insert_time_entries on public.time_entries
  for insert to authenticated
  with check (public.is_staff());
create policy staff_update_time_entries on public.time_entries
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Schedules and payroll are manager-owned records.
drop policy if exists manager_select_schedule_entries on public.schedule_entries;
drop policy if exists manager_insert_schedule_entries on public.schedule_entries;
drop policy if exists manager_update_schedule_entries on public.schedule_entries;
create policy manager_select_schedule_entries on public.schedule_entries
  for select to authenticated using (public.is_staff());
create policy manager_insert_schedule_entries on public.schedule_entries
  for insert to authenticated with check (public.is_staff_manager());
create policy manager_update_schedule_entries on public.schedule_entries
  for update to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());

drop policy if exists manager_select_payslips on public.payslips;
drop policy if exists manager_insert_payslips on public.payslips;
drop policy if exists manager_update_payslips on public.payslips;
create policy manager_select_payslips on public.payslips
  for select to authenticated using (public.is_staff_manager());
create policy manager_insert_payslips on public.payslips
  for insert to authenticated with check (public.is_staff_manager());
create policy manager_update_payslips on public.payslips
  for update to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager());

-- Deletion audit rows are written by the authenticated app and reviewed by
-- managers. There is intentionally no DELETE policy.
drop policy if exists staff_insert_deletion_audit on public.deletion_audit;
drop policy if exists manager_select_deletion_audit on public.deletion_audit;
create policy staff_insert_deletion_audit on public.deletion_audit
  for insert to authenticated with check (public.is_staff());
create policy manager_select_deletion_audit on public.deletion_audit
  for select to authenticated using (public.is_staff_manager());

-- Authorization audit is append-only from the browser and readable by managers.
drop policy if exists staff_insert_auth_audit on public.auth_audit;
drop policy if exists manager_select_auth_audit on public.auth_audit;
create policy staff_insert_auth_audit on public.auth_audit
  for insert to authenticated with check (public.is_staff());
create policy manager_select_auth_audit on public.auth_audit
  for select to authenticated using (public.is_staff_manager());

grant select on public.staff_profiles, public.time_entries, public.schedule_entries to authenticated;
grant insert, update on public.staff_profiles, public.time_entries, public.schedule_entries to authenticated;
grant select, insert, update on public.payslips to authenticated;
grant select, insert on public.deletion_audit, public.auth_audit to authenticated;

-- system_config contains global operational settings, not credentials. Reads
-- are available to staff; writes are manager-only. The prior generic update
-- policy is removed so this table is not writable by every staff role.
do $$
begin
  if to_regclass('public.system_config') is not null then
    execute 'drop policy if exists staff_update on public.system_config';
    execute 'drop policy if exists staff_insert on public.system_config';
    execute 'create policy manager_update_system_config on public.system_config for update to authenticated using (public.is_staff_manager()) with check (public.is_staff_manager())';
    execute 'create policy manager_insert_system_config on public.system_config for insert to authenticated with check (public.is_staff_manager())';
    execute 'grant select on public.system_config to authenticated';
    execute 'grant insert, update on public.system_config to authenticated';
  end if;
end
$$;

commit;
