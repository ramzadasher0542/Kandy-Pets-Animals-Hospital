-- Remediation P2.2/P5.1: keep invoice-void customer/source effects inside the
-- authenticated server boundary. The browser must not repair financial history
-- with follow-up table writes.

begin;

do $$
begin
  if to_regprocedure('public.void_invoice_and_reverse_revenue(uuid)') is null
     or to_regclass('public.checkout_effects') is null
     or to_regprocedure('public.current_clinic_id()') is null then
    raise exception 'VOID_EFFECT_PREREQUISITES_REQUIRED';
  end if;
end
$$;

create or replace function public.void_invoice_and_reverse_revenue_auth(
  p_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_effect_status text;
  v_effect_client_id text;
  v_effect_delta numeric := 0;
  v_source_refs jsonb := '[]'::jsonb;
  v_ref jsonb;
  v_ref_type text;
  v_ref_id text;
  v_result jsonb;
  v_client_updated integer := 0;
  v_sources_released integer := 0;
  v_rows integer := 0;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: void invoice';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or p_invoice_id is null then
    raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id;
  end if;

  perform 1
  from public.invoices
  where id = p_invoice_id
    and clinic_id = v_clinic_id
  for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id;
  end if;

  select status, client_id, client_value_delta, source_refs
    into v_effect_status, v_effect_client_id, v_effect_delta, v_source_refs
  from public.checkout_effects
  where invoice_id = p_invoice_id
    and clinic_id = v_clinic_id
  for update;

  v_result := public.void_invoice_and_reverse_revenue(p_invoice_id);
  if coalesce((v_result->>'already_void')::boolean, false) then
    return v_result;
  end if;

  -- A pending checkout effect must never apply after its invoice is voided.
  if v_effect_status = 'pending' then
    update public.checkout_effects
    set status = 'applied', applied_at = now()
    where invoice_id = p_invoice_id
      and clinic_id = v_clinic_id;
  elsif v_effect_status = 'applied' and v_effect_client_id is not null and v_effect_delta <> 0 then
    update public.clients
    set lifetime_value = greatest(0, coalesce(lifetime_value, 0) - v_effect_delta),
        updated_at = now()
    where client_id = v_effect_client_id
      and clinic_id = v_clinic_id;
    get diagnostics v_client_updated = row_count;
    if v_client_updated = 0 then
      raise exception 'CLIENT_NOT_FOUND: %', v_effect_client_id;
    end if;
  end if;

  -- Release any referenced source row that is currently billed. This is safe for
  -- a new pending effect (the update becomes a no-op) and repairs legacy rows
  -- that were billed before the outbox existed.
  if jsonb_typeof(v_source_refs) = 'array' then
    for v_ref in select value from jsonb_array_elements(v_source_refs) loop
      v_ref_type := v_ref->>'type';
      v_ref_id := nullif(v_ref->>'id', '');
      if v_ref_type not in ('vaccination', 'grooming', 'lab', 'boarding') or v_ref_id is null then
        raise exception 'INVALID_SOURCE_REFERENCE';
      end if;

      if v_ref_type = 'vaccination' then
        update public.vaccinations set billed = false, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = true;
      elsif v_ref_type = 'grooming' then
        update public.grooming_logs set billed = false, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = true;
      elsif v_ref_type = 'lab' then
        update public.lab_results set billed = false, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = true;
      elsif v_ref_type = 'boarding' then
        update public.boarding_records set billed = false, updated_at = now()
        where id::text = v_ref_id and clinic_id = v_clinic_id and billed = true;
      end if;
      get diagnostics v_rows = row_count;
      v_sources_released := v_sources_released + v_rows;
    end loop;
  end if;

  return v_result || jsonb_build_object(
    'client_reversed', v_client_updated > 0,
    'sources_released', v_sources_released
  );
end;
$$;

revoke all on function public.void_invoice_and_reverse_revenue_auth(uuid) from public, anon;
grant execute on function public.void_invoice_and_reverse_revenue_auth(uuid) to authenticated, service_role;

commit;
