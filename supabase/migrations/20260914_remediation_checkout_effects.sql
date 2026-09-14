-- Remediation P2.1: tenant-scoped, idempotent checkout effects.
-- This supersedes the unscoped 20260821 checkout-effects design. The outbox is
-- populated by an invoice trigger so every invoice path gets the same boundary.

begin;

do $$
begin
  if to_regprocedure('public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)') is null
     or to_regprocedure('public.atomic_stock_decrement(uuid,integer)') is null
     or to_regprocedure('public.current_clinic_id()') is null then
    raise exception 'CHECKOUT_PREREQUISITES_REQUIRED';
  end if;
end
$$;

create table if not exists public.checkout_effects (
  invoice_id uuid primary key,
  clinic_id uuid not null,
  client_id text,
  client_value_delta numeric not null default 0,
  appointment_id text,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.checkout_effects
  add column if not exists clinic_id uuid;
alter table public.checkout_effects
  add column if not exists client_id text;
alter table public.checkout_effects
  add column if not exists client_value_delta numeric not null default 0;
alter table public.checkout_effects
  add column if not exists appointment_id text;
alter table public.checkout_effects
  add column if not exists source_refs jsonb not null default '[]'::jsonb;
alter table public.checkout_effects
  add column if not exists status text not null default 'pending';
alter table public.checkout_effects
  add column if not exists created_at timestamptz not null default now();
alter table public.checkout_effects
  add column if not exists applied_at timestamptz;

update public.checkout_effects e
set clinic_id = i.clinic_id
from public.invoices i
where i.id = e.invoice_id
  and e.clinic_id is null;

do $$
begin
  if exists (select 1 from public.checkout_effects where clinic_id is null) then
    raise exception 'CHECKOUT_EFFECT_CLINIC_REQUIRED: unable to derive clinic from invoice';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_effects'::regclass
      and conname = 'checkout_effects_invoice_fk'
  ) then
    alter table public.checkout_effects
      add constraint checkout_effects_invoice_fk
      foreign key (invoice_id) references public.invoices(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checkout_effects'::regclass
      and conname = 'checkout_effects_clinic_fk'
  ) then
    alter table public.checkout_effects
      add constraint checkout_effects_clinic_fk
      foreign key (clinic_id) references public.clinics(id);
  end if;
end
$$;

alter table public.checkout_effects
  alter column clinic_id set not null;

-- Recover paid invoices that committed while the outbox objects were absent.
insert into public.checkout_effects (
  invoice_id, clinic_id, client_id, client_value_delta, appointment_id, source_refs
)
select
  i.id,
  i.clinic_id,
  p."clientId",
  coalesce(i.sales_total, 0),
  nullif(i."appointmentId", ''),
  coalesce(jsonb_agg(ref) filter (where ref is not null), '[]'::jsonb)
from public.invoices i
left join public.pets p
  on p.id::text = i."patientId"
 and p.clinic_id = i.clinic_id
left join lateral jsonb_array_elements(coalesce(i.items, '[]'::jsonb)) line on true
left join lateral jsonb_array_elements(
  case when jsonb_typeof(line->'sourceRefs') = 'array'
    then line->'sourceRefs'
    else '[]'::jsonb
  end
) ref on true
where i."paymentStatus" = 'paid'
  and i.clinic_id is not null
group by i.id, i.clinic_id, p."clientId", i.sales_total, i."appointmentId"
on conflict (invoice_id) do nothing;

create index if not exists checkout_effects_clinic_status_idx
  on public.checkout_effects (clinic_id, status, created_at);

alter table public.checkout_effects enable row level security;
revoke all on public.checkout_effects from public, anon, authenticated;

create or replace function public.enqueue_checkout_effect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
  v_patient_id text;
  v_source_refs jsonb := '[]'::jsonb;
begin
  if new."paymentStatus" <> 'paid' then
    return new;
  end if;
  if new.clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  v_patient_id := nullif(new."patientId", '');
  if v_patient_id is not null and v_patient_id <> 'RETAIL' then
    select p."clientId"
      into v_client_id
    from public.pets p
    where p.id::text = v_patient_id
      and p.clinic_id = new.clinic_id;
    if not found then
      raise exception 'PATIENT_NOT_FOUND: %', v_patient_id;
    end if;
  end if;

  select coalesce(jsonb_agg(ref), '[]'::jsonb)
    into v_source_refs
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) line
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(line->'sourceRefs') = 'array'
      then line->'sourceRefs'
      else '[]'::jsonb
    end
  ) ref;

  insert into public.checkout_effects (
    invoice_id, clinic_id, client_id, client_value_delta, appointment_id, source_refs
  ) values (
    new.id,
    new.clinic_id,
    v_client_id,
    coalesce(new.sales_total, 0),
    nullif(new."appointmentId", ''),
    v_source_refs
  )
  on conflict (invoice_id) do nothing;

  return new;
end;
$$;

drop trigger if exists enqueue_checkout_effect_after_invoice on public.invoices;
create trigger enqueue_checkout_effect_after_invoice
after insert or update of "paymentStatus" on public.invoices
for each row execute function public.enqueue_checkout_effect();

create or replace function public.process_checkout_effects_auth(
  p_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect public.checkout_effects;
  v_clinic_id uuid;
  v_ref jsonb;
  v_ref_type text;
  v_ref_id text;
  v_updated integer;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout effects';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or p_invoice_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  select * into v_effect
  from public.checkout_effects
  where invoice_id = p_invoice_id
    and clinic_id = v_clinic_id
  for update;
  if not found then
    return jsonb_build_object('processed', false, 'no_effects', true, 'invoice_id', p_invoice_id);
  end if;
  if v_effect.status = 'applied' then
    return jsonb_build_object(
      'processed', false,
      'already_processed', true,
      'invoice_id', p_invoice_id,
      'client_id', v_effect.client_id,
      'client_value_delta', v_effect.client_value_delta,
      'source_refs', v_effect.source_refs
    );
  end if;

  if v_effect.client_id is not null and v_effect.client_value_delta <> 0 then
    update public.clients
    set lifetime_value = coalesce(lifetime_value, 0) + v_effect.client_value_delta,
        updated_at = now()
    where client_id = v_effect.client_id
      and clinic_id = v_clinic_id;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'CLIENT_NOT_FOUND: %', v_effect.client_id;
    end if;
  end if;

  if jsonb_typeof(v_effect.source_refs) = 'array' then
    for v_ref in select value from jsonb_array_elements(v_effect.source_refs) loop
      v_ref_type := v_ref->>'type';
      v_ref_id := nullif(v_ref->>'id', '');
      if v_ref_type not in ('vaccination', 'grooming', 'lab', 'boarding') or v_ref_id is null then
        raise exception 'INVALID_SOURCE_REFERENCE';
      end if;

      if v_ref_type = 'vaccination' then
        update public.vaccinations set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id;
      elsif v_ref_type = 'grooming' then
        update public.grooming_logs set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id;
      elsif v_ref_type = 'lab' then
        update public.lab_results set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id;
      elsif v_ref_type = 'boarding' then
        update public.boarding_records set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id;
      end if;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'SOURCE_RECORD_NOT_FOUND: %/%', v_ref_type, v_ref_id;
      end if;
    end loop;
  end if;

  update public.checkout_effects
  set status = 'applied', applied_at = now()
  where invoice_id = p_invoice_id
    and clinic_id = v_clinic_id;

  return jsonb_build_object(
    'processed', true,
    'already_processed', false,
    'invoice_id', p_invoice_id,
    'client_id', v_effect.client_id,
    'client_value_delta', v_effect.client_value_delta,
    'source_refs', v_effect.source_refs
  );
end;
$$;

create or replace function public.process_pending_checkout_effects_auth()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_clinic_id uuid;
  v_processed integer := 0;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout effects';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  for v_invoice_id in
    select invoice_id
    from public.checkout_effects
    where clinic_id = v_clinic_id
      and status = 'pending'
    order by created_at
    for update skip locked
  loop
    begin
      perform public.process_checkout_effects_auth(v_invoice_id);
      v_processed := v_processed + 1;
    exception when others then
      null;
    end;
  end loop;
  return v_processed;
end;
$$;

-- Customer identity edits are the only non-checkout invoice update currently
-- needed by the browser. Keep that narrow edit separate from financial writes.
create or replace function public.update_invoice_customer_auth(
  p_invoice_id uuid,
  p_owner_name text,
  p_owner_phone text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: invoice customer update';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or p_invoice_id is null
     or nullif(trim(p_owner_name), '') is null then
    raise exception 'INVALID_INVOICE_CUSTOMER_PAYLOAD';
  end if;
  update public.invoices
  set "ownerName" = left(trim(p_owner_name), 200),
      "ownerPhone" = left(trim(coalesce(p_owner_phone, '')), 40),
      updated_at = now()
  where id = p_invoice_id
    and clinic_id = v_clinic_id
    and coalesce(is_deleted, false) = false;
  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;
end;
$$;

-- Recreate the browser checkout wrapper in this remediation migration so a
-- target that already recorded 20260903 still receives the corrected guard.
create or replace function public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_clinic_id uuid;
  v_invoice_id uuid;
  v_shift_id uuid;
  v_appointment_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_quantity numeric;
  v_category text;
  v_expected_stock jsonb := '{}'::jsonb;
  v_supplied_stock jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;
  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object'
     or jsonb_typeof(p_invoice->'items') <> 'array'
     or p_stock_items is null or jsonb_typeof(p_stock_items) <> 'array' then
    raise exception 'INVALID_CHECKOUT_PAYLOAD';
  end if;

  begin
    v_invoice_id := (nullif(p_invoice->>'id', ''))::uuid;
  exception when others then
    raise exception 'INVALID_INVOICE_ID';
  end;
  if v_invoice_id is null
     or nullif(p_invoice->>'clinic_id', '')::uuid is distinct from v_clinic_id then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;
  if exists (select 1 from public.invoices where id = v_invoice_id and clinic_id <> v_clinic_id) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  if nullif(p_invoice->>'shiftId', '') is not null then
    begin
      v_shift_id := (p_invoice->>'shiftId')::uuid;
    exception when others then
      raise exception 'INVALID_SHIFT_ID';
    end;
    if not exists (select 1 from public.shifts where id = v_shift_id and clinic_id = v_clinic_id)
       or exists (select 1 from public.shifts where id = v_shift_id and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  if nullif(p_invoice->>'appointmentId', '') is not null then
    begin
      v_appointment_id := (p_invoice->>'appointmentId')::uuid;
    exception when others then
      raise exception 'INVALID_APPOINTMENT_ID';
    end;
    if not exists (select 1 from public.appointments where id = v_appointment_id and clinic_id = v_clinic_id)
       or exists (select 1 from public.appointments where id = v_appointment_id and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  if nullif(p_invoice->>'patientId', '') is not null and p_invoice->>'patientId' <> 'RETAIL' then
    if not exists (select 1 from public.pets where id::text = p_invoice->>'patientId' and clinic_id = v_clinic_id)
       or exists (select 1 from public.pets where id::text = p_invoice->>'patientId' and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_invoice->'items') loop
    begin
      v_item_id := (nullif(v_item->>'itemId', ''))::uuid;
      v_quantity := nullif(v_item->>'quantity', '')::numeric;
    exception when others then
      raise exception 'INVALID_INVOICE_LINE';
    end;
    if v_item_id is null or v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'INVALID_INVOICE_LINE';
    end if;
    select category into v_category
    from public.inventory
    where id = v_item_id
      and clinic_id = v_clinic_id
      and coalesce(is_deleted, false) = false
    for update;
    if not found then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    if coalesce(v_category, '') not in ('service', 'lab_service') then
      v_expected_stock := jsonb_set(
        v_expected_stock,
        array[v_item_id::text],
        to_jsonb(coalesce((v_expected_stock->>v_item_id::text)::numeric, 0) + v_quantity),
        true
      );
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_stock_items) loop
    begin
      v_item_id := (nullif(v_item->>'item_id', ''))::uuid;
      v_quantity := nullif(v_item->>'qty', '')::numeric;
    exception when others then
      raise exception 'INVALID_STOCK_ITEM_ID';
    end;
    if v_item_id is null or v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity)
       or not exists (
         select 1 from public.inventory
         where id = v_item_id
           and clinic_id = v_clinic_id
           and coalesce(is_deleted, false) = false
       ) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    v_supplied_stock := jsonb_set(
      v_supplied_stock,
      array[v_item_id::text],
      to_jsonb(coalesce((v_supplied_stock->>v_item_id::text)::numeric, 0) + v_quantity),
      true
    );
  end loop;

  if v_expected_stock <> v_supplied_stock then
    raise exception 'STOCK_ITEMS_MISMATCH';
  end if;

  return public.commit_checkout_invoice_and_stock_impl(
    jsonb_set(p_invoice, '{clinic_id}', to_jsonb(v_clinic_id::text), true),
    p_stock_items
  );
end;
$$;

revoke all on function public.enqueue_checkout_effect() from public, anon, authenticated;
revoke all on function public.process_checkout_effects_auth(uuid) from public, anon;
revoke all on function public.process_pending_checkout_effects_auth() from public, anon;
revoke all on function public.update_invoice_customer_auth(uuid, text, text) from public, anon;
revoke all on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) from public, anon;
revoke insert, update, delete on public.invoices from authenticated;
grant select on public.invoices to authenticated;
grant execute on function public.process_checkout_effects_auth(uuid) to authenticated, service_role;
grant execute on function public.process_pending_checkout_effects_auth() to authenticated, service_role;
grant execute on function public.update_invoice_customer_auth(uuid, text, text) to authenticated, service_role;
grant execute on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) to authenticated, service_role;

commit;
