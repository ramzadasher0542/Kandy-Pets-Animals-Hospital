-- Remediation P2.1: validate checkout source references at the invoice boundary
-- and retain retry failures for operator-visible diagnosis.

begin;

alter table public.checkout_effects
  add column if not exists attempt_count integer not null default 0;
alter table public.checkout_effects
  add column if not exists last_error text;
alter table public.checkout_effects
  add column if not exists last_attempt_at timestamptz;

create or replace function public.validate_checkout_source_ref(
  p_type text,
  p_id text,
  p_clinic_id uuid,
  p_patient_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pet_id text;
  v_billed boolean;
  v_found boolean := false;
begin
  if p_type not in ('vaccination', 'grooming', 'lab', 'boarding')
     or nullif(trim(p_id), '') is null
     or p_clinic_id is null
     or p_patient_id is null
     or p_patient_id = 'RETAIL' then
    raise exception 'INVALID_SOURCE_REFERENCE';
  end if;

  if p_type = 'vaccination' then
    select "petId", billed into v_pet_id, v_billed
    from public.vaccinations
    where id::text = p_id and clinic_id = p_clinic_id and not coalesce(is_deleted, false)
    for update;
    v_found := found;
  elsif p_type = 'grooming' then
    select "petId", billed into v_pet_id, v_billed
    from public.grooming_logs
    where id::text = p_id and clinic_id = p_clinic_id and not coalesce(is_deleted, false)
    for update;
    v_found := found;
  elsif p_type = 'lab' then
    select "petId", billed into v_pet_id, v_billed
    from public.lab_results
    where id::text = p_id and clinic_id = p_clinic_id and not coalesce(is_deleted, false)
    for update;
    v_found := found;
  elsif p_type = 'boarding' then
    select "petId", billed into v_pet_id, v_billed
    from public.boarding_records
    where id::text = p_id and clinic_id = p_clinic_id and not coalesce(is_deleted, false)
    for update;
    v_found := found;
  end if;

  if not v_found then
    raise exception 'SOURCE_RECORD_NOT_FOUND: %/%', p_type, p_id;
  end if;
  if v_pet_id is distinct from p_patient_id then
    raise exception 'SOURCE_PET_SCOPE_MISMATCH: %/%', p_type, p_id;
  end if;
  if coalesce(v_billed, false) then
    raise exception 'SOURCE_ALREADY_BILLED: %/%', p_type, p_id;
  end if;
end;
$$;

revoke all on function public.validate_checkout_source_ref(text, text, uuid, text)
  from public, anon, authenticated, service_role;

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
  v_ref jsonb;
begin
  if new."paymentStatus" <> 'paid' then
    return new;
  end if;
  if new.clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  v_patient_id := nullif(new."patientId", '');
  if v_patient_id is not null and v_patient_id <> 'RETAIL' then
    select p."clientId" into v_client_id
    from public.pets p
    where p.id::text = v_patient_id and p.clinic_id = new.clinic_id;
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

  if exists (
    select 1
    from (
      select ref->>'type' as ref_type, ref->>'id' as ref_id
      from jsonb_array_elements(v_source_refs) ref
    ) refs
    group by ref_type, ref_id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_SOURCE_REFERENCE';
  end if;

  for v_ref in select value from jsonb_array_elements(v_source_refs) loop
    perform public.validate_checkout_source_ref(
      v_ref->>'type', v_ref->>'id', new.clinic_id, v_patient_id
    );
  end loop;

  insert into public.checkout_effects (
    invoice_id, clinic_id, client_id, client_value_delta, appointment_id, source_refs
  ) values (
    new.id, new.clinic_id, v_client_id, coalesce(new.sales_total, 0),
    nullif(new."appointmentId", ''), v_source_refs
  ) on conflict (invoice_id) do nothing;

  return new;
end;
$$;

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
  v_patient_id text;
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

  select nullif("patientId", '') into v_patient_id
  from public.invoices
  where id = p_invoice_id and clinic_id = v_clinic_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id;
  end if;

  select * into v_effect
  from public.checkout_effects
  where invoice_id = p_invoice_id and clinic_id = v_clinic_id
  for update;
  if not found then
    return jsonb_build_object('processed', false, 'no_effects', true, 'invoice_id', p_invoice_id);
  end if;
  if v_effect.status = 'applied' then
    return jsonb_build_object(
      'processed', false, 'already_processed', true, 'invoice_id', p_invoice_id,
      'client_id', v_effect.client_id, 'client_value_delta', v_effect.client_value_delta,
      'source_refs', v_effect.source_refs
    );
  end if;

  if v_effect.client_id is not null and v_effect.client_value_delta <> 0 then
    update public.clients
    set lifetime_value = coalesce(lifetime_value, 0) + v_effect.client_value_delta,
        updated_at = now()
    where client_id = v_effect.client_id and clinic_id = v_clinic_id;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'CLIENT_NOT_FOUND: %', v_effect.client_id;
    end if;
  end if;

  if jsonb_typeof(v_effect.source_refs) = 'array' then
    for v_ref in select value from jsonb_array_elements(v_effect.source_refs) loop
      v_ref_type := v_ref->>'type';
      v_ref_id := nullif(v_ref->>'id', '');
      perform public.validate_checkout_source_ref(v_ref_type, v_ref_id, v_clinic_id, v_patient_id);

      if v_ref_type = 'vaccination' then
        update public.vaccinations set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = false;
      elsif v_ref_type = 'grooming' then
        update public.grooming_logs set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = false;
      elsif v_ref_type = 'lab' then
        update public.lab_results set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = false;
      elsif v_ref_type = 'boarding' then
        update public.boarding_records set billed = true, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = false;
      end if;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'SOURCE_RECORD_NOT_FOUND: %/%', v_ref_type, v_ref_id;
      end if;
    end loop;
  end if;

  update public.checkout_effects
  set status = 'applied', applied_at = now(), last_error = null
  where invoice_id = p_invoice_id and clinic_id = v_clinic_id;

  return jsonb_build_object(
    'processed', true, 'already_processed', false, 'invoice_id', p_invoice_id,
    'client_id', v_effect.client_id, 'client_value_delta', v_effect.client_value_delta,
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
  v_error text;
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
    select invoice_id from public.checkout_effects
    where clinic_id = v_clinic_id and status = 'pending'
    order by created_at for update skip locked
  loop
    begin
      perform public.process_checkout_effects_auth(v_invoice_id);
      v_processed := v_processed + 1;
    exception when others then
      get stacked diagnostics v_error = message_text;
      update public.checkout_effects
      set attempt_count = coalesce(attempt_count, 0) + 1,
          last_error = left(v_error, 1000),
          last_attempt_at = now()
      where invoice_id = v_invoice_id and clinic_id = v_clinic_id;
    end;
  end loop;
  return v_processed;
end;
$$;

revoke all on function public.validate_checkout_source_ref(text, text, uuid, text)
  from public, anon, authenticated, service_role;

commit;
