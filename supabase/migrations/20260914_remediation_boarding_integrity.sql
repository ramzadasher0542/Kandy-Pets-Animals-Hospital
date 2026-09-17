-- Remediation P2.3: enforce active-cage occupancy and preserve boarding
-- settlement provenance for invoice void/reversal.

begin;

create unique index if not exists uniq_active_boarding_cage_per_clinic
  on public.boarding_records (clinic_id, "cageNumber")
  where status = 'active'
    and coalesce(is_deleted, false) = false
    and nullif(trim("cageNumber"), '') is not null;

create or replace function public.assert_boarding_cage_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active'
     and not coalesce(new.is_deleted, false)
     and nullif(trim(new."cageNumber"), '') is not null
     and exists (
       select 1
       from public.boarding_records b
       where b.clinic_id = new.clinic_id
         and b."cageNumber" = new."cageNumber"
         and b.status = 'active'
         and not coalesce(b.is_deleted, false)
         and b.id <> new.id
     ) then
    raise exception 'CAGE_OCCUPIED: %', new."cageNumber";
  end if;
  return new;
end;
$$;

drop trigger if exists assert_boarding_cage_available_before_write on public.boarding_records;
create trigger assert_boarding_cage_available_before_write
before insert or update of "cageNumber", status, clinic_id, is_deleted
on public.boarding_records
for each row execute function public.assert_boarding_cage_available();

create or replace function public.set_boarding_billed_auth(
  p_boarding_id uuid,
  p_billed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boarding public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding billed state';
  end if;
  if p_boarding_id is null or p_billed is null then
    raise exception 'INVALID_BOARDING_BILLED_PAYLOAD';
  end if;
  update public.boarding_records
  set billed = p_billed, updated_at = now()
  where id = p_boarding_id
    and clinic_id = public.current_clinic_id();
  if not found then
    raise exception 'BOARDING_NOT_FOUND';
  end if;
  select * into v_boarding
  from public.boarding_records
  where id = p_boarding_id and clinic_id = public.current_clinic_id();
  return to_jsonb(v_boarding);
end;
$$;

-- Settlement invoices reuse the boarding UUID as their invoice UUID. Attach the
-- boarding source reference before the existing checkout-effect trigger runs.
create or replace function public.attach_boarding_invoice_source_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refs jsonb;
begin
  if new."paymentStatus" = 'paid'
     and new.clinic_id is not null
     and exists (
       select 1 from public.boarding_records b
       where b.id = new.id and b.clinic_id = new.clinic_id
     )
     and jsonb_typeof(new.items) = 'array'
     and jsonb_array_length(new.items) > 0 then
    v_refs := coalesce(new.items->0->'sourceRefs', '[]'::jsonb);
    if jsonb_typeof(v_refs) <> 'array' then
      raise exception 'INVALID_SOURCE_REFERENCE';
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_refs) ref
      where ref->>'type' = 'boarding' and ref->>'id' = new.id::text
    ) then
      new.items := jsonb_set(
        new.items,
        '{0,sourceRefs}',
        v_refs || jsonb_build_array(jsonb_build_object('type', 'boarding', 'id', new.id::text)),
        true
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attach_boarding_invoice_source_ref_before_insert on public.invoices;
create trigger attach_boarding_invoice_source_ref_before_insert
before insert on public.invoices
for each row execute function public.attach_boarding_invoice_source_ref();

-- Settlement runs through the authenticated RPC, so apply the queued effect in
-- the same transaction before settlement marks the boarding row billed. This
-- keeps the effect available for a later invoice-void compensation.
create or replace function public.process_boarding_settlement_effect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new."paymentStatus" = 'paid'
     and auth.uid() is not null
     and exists (
       select 1 from public.boarding_records b
       where b.id = new.id and b.clinic_id = new.clinic_id
     ) then
    perform public.process_checkout_effects_auth(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists zz_process_boarding_settlement_effect_after_insert on public.invoices;
create trigger zz_process_boarding_settlement_effect_after_insert
after insert on public.invoices
for each row execute function public.process_boarding_settlement_effect();

revoke all on function public.assert_boarding_cage_available() from public, anon, authenticated, service_role;
revoke all on function public.attach_boarding_invoice_source_ref() from public, anon, authenticated, service_role;
revoke all on function public.process_boarding_settlement_effect() from public, anon, authenticated, service_role;

commit;
