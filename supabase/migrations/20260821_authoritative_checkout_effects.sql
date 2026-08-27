-- Step 39 - authoritative checkout and durable post-checkout effects
--
-- The browser may propose an invoice, but it must not choose catalog prices,
-- tax, cost, payment totals, shift ownership, or staff identity. This migration
-- keeps the existing RPC signature for the deployed client while moving those
-- decisions into Postgres.

begin;

create table if not exists public.checkout_effects (
  invoice_id uuid primary key,
  client_id text,
  client_value_delta numeric not null default 0,
  appointment_id text,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'applied')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

alter table public.checkout_effects enable row level security;
revoke all on public.checkout_effects from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)') is null then
    raise exception 'checkout implementation RPC is missing; apply Step 33 first';
  end if;
  if to_regprocedure('public.atomic_stock_decrement(uuid,integer)') is null then
    raise exception 'atomic stock RPC is missing; apply the stock schema first';
  end if;
  if to_regprocedure('public._invoice_method_cents(jsonb)') is null then
    raise exception 'shift accounting helpers are missing; apply Step 28 first';
  end if;
  if to_regclass('public.system_config') is null then
    raise exception 'system_config is required for authoritative tax calculation';
  end if;
end
$$;

-- This implementation is called only by the authenticated wrapper below. It
-- replaces the previous client-trusted implementation without changing the
-- browser RPC signature.
create or replace function public.commit_checkout_invoice_and_stock_impl(
  p_invoice jsonb,
  p_stock_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_shift_id uuid;
  v_appointment_id uuid;
  v_patient_id text;
  v_created_by text;
  v_role text;
  v_payment_method text;
  v_line jsonb;
  v_payment jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_unit_price numeric;
  v_split_amount numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_tax_rate numeric := 0;
  v_tax numeric := 0;
  v_sales_total numeric := 0;
  v_cogs numeric := 0;
  v_taxable numeric := 0;
  v_split_total numeric := 0;
  v_stock_key text;
  v_stock_value text;
  v_remaining numeric;
  v_canonical_items jsonb := '[]'::jsonb;
  v_stock_quantities jsonb := '{}'::jsonb;
  v_source_refs jsonb := '[]'::jsonb;
  v_split_payments jsonb := '[]'::jsonb;
  v_full jsonb;
  v_existing public.invoices;
  v_product record;
  v_cash integer;
  v_card integer;
  v_bank integer;
  v_inserted integer;
begin
  if p_invoice is null
     or jsonb_typeof(p_invoice) <> 'object'
     or jsonb_typeof(p_invoice->'items') <> 'array' then
    raise exception 'INVALID_INVOICE_PAYLOAD';
  end if;

  begin
    v_invoice_id := (nullif(p_invoice->>'id', ''))::uuid;
  exception when others then
    raise exception 'INVALID_INVOICE_ID';
  end;
  if v_invoice_id is null then
    raise exception 'INVALID_INVOICE_ID';
  end if;

  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout';
  end if;

  begin
    v_discount := coalesce(nullif(p_invoice->>'discount', '')::numeric, 0);
  exception when others then
    raise exception 'INVALID_DISCOUNT';
  end;
  if v_discount < 0 then
    raise exception 'INVALID_DISCOUNT';
  end if;

  -- Resolve every line from the current inventory catalog. The client price,
  -- name, SKU, category, cost, and line total are deliberately ignored.
  for v_line in select value from jsonb_array_elements(p_invoice->'items') loop
    begin
      v_item_id := (nullif(v_line->>'itemId', ''))::uuid;
      v_qty := nullif(v_line->>'quantity', '')::numeric;
    exception when others then
      raise exception 'INVALID_INVOICE_LINE';
    end;
    if v_item_id is null or v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then
      raise exception 'INVALID_INVOICE_LINE';
    end if;

    select name, sku, category, price, cost
      into v_product
    from public.inventory
    where id = v_item_id
      and coalesce(is_deleted, false) = false
    for update;
    if not found then
      raise exception 'CATALOG_ITEM_NOT_FOUND: %', v_item_id;
    end if;
    if coalesce(v_product.price, 0) < 0 or coalesce(v_product.cost, 0) < 0 then
      raise exception 'INVALID_CATALOG_PRICE: %', v_item_id;
    end if;

    v_unit_price := round(coalesce(v_product.price, 0)::numeric, 2);
    v_subtotal := v_subtotal + (v_unit_price * v_qty);
    v_cogs := v_cogs + (round(coalesce(v_product.cost, 0)::numeric, 2) * v_qty);
    v_canonical_items := v_canonical_items || jsonb_build_array(jsonb_build_object(
      'itemId', v_item_id::text,
      'sku', coalesce(v_product.sku, ''),
      'name', coalesce(v_product.name, ''),
      'category', coalesce(v_product.category, ''),
      'quantity', v_qty,
      'unitPrice', v_unit_price,
      'totalPrice', round(v_unit_price * v_qty, 2),
      'sourceRefs', case
        when jsonb_typeof(v_line->'sourceRefs') = 'array' then v_line->'sourceRefs'
        else '[]'::jsonb
      end
    ));

    if coalesce(v_product.category, '') not in ('service', 'lab_service') then
      v_stock_quantities := jsonb_set(
        v_stock_quantities,
        array[v_item_id::text],
        to_jsonb(coalesce((v_stock_quantities->>v_item_id::text)::numeric, 0) + v_qty),
        true
      );
    end if;

    if jsonb_typeof(v_line->'sourceRefs') = 'array' then
      v_source_refs := v_source_refs || v_line->'sourceRefs';
    end if;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_cogs := round(v_cogs, 2);
  if v_discount > v_subtotal then
    raise exception 'INVALID_DISCOUNT';
  end if;
  if v_subtotal > 0
     and v_discount / v_subtotal > 0.10
     and v_role not in ('owner', 'manager', 'admin', 'provider') then
    raise exception 'DISCOUNT_APPROVAL_REQUIRED';
  end if;

  select coalesce(tax_rate, 0)
    into v_tax_rate
  from public.system_config
  where id = 'global';
  v_tax_rate := coalesce(v_tax_rate, 0);
  if v_tax_rate < 0 or v_tax_rate > 1 then
    raise exception 'INVALID_TAX_CONFIGURATION';
  end if;

  v_taxable := greatest(0, v_subtotal - v_discount);
  v_tax := round(v_taxable * v_tax_rate, 0);
  v_sales_total := round(v_taxable + v_tax, 2);

  v_payment_method := lower(coalesce(nullif(p_invoice->>'paymentMethod', ''), ''));
  if v_payment_method not in ('cash', 'card', 'bank_transfer', 'split') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;

  if v_payment_method = 'split' then
    if jsonb_typeof(p_invoice->'splitPayments') <> 'array' then
      raise exception 'INVALID_SPLIT_PAYMENT';
    end if;
    for v_payment in select value from jsonb_array_elements(p_invoice->'splitPayments') loop
      begin
        v_split_amount := nullif(v_payment->>'amount', '')::numeric;
      exception when others then
        raise exception 'INVALID_SPLIT_PAYMENT';
      end;
      if v_payment->>'method' not in ('cash', 'card', 'bank_transfer')
         or v_split_amount is null or v_split_amount <= 0 then
        raise exception 'INVALID_SPLIT_PAYMENT';
      end if;
      v_split_total := v_split_total + round(v_split_amount, 2);
      v_split_payments := v_split_payments || jsonb_build_array(jsonb_build_object(
        'method', v_payment->>'method',
        'amount', round(v_split_amount, 2)
      ));
    end loop;
    if abs(v_split_total - v_sales_total) > 0.01 then
      raise exception 'SPLIT_PAYMENT_TOTAL_MISMATCH';
    end if;
  end if;

  begin
    v_shift_id := (nullif(p_invoice->>'shiftId', ''))::uuid;
  exception when others then
    raise exception 'INVALID_SHIFT_ID';
  end;
  if v_shift_id is null then
    raise exception 'OPEN_SHIFT_REQUIRED';
  end if;
  perform 1
  from public.shifts
  where id = v_shift_id
    and "isOpen" = true
    and coalesce(is_deleted, false) = false
  for update;
  if not found then
    raise exception 'OPEN_SHIFT_REQUIRED';
  end if;

  if nullif(p_invoice->>'appointmentId', '') is not null then
    begin
      v_appointment_id := (p_invoice->>'appointmentId')::uuid;
    exception when others then
      raise exception 'INVALID_APPOINTMENT_ID';
    end;
    perform 1 from public.appointments where id = v_appointment_id;
    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND: %', v_appointment_id;
    end if;
  end if;

  select name into v_created_by
  from public.users
  where auth_user_id = auth.uid()
    and active = true
    and coalesce(is_deleted, false) = false;
  if v_created_by is null then
    raise exception 'STAFF_IDENTITY_NOT_FOUND';
  end if;

  -- Server fields are appended last so no client value can override them.
  v_full := jsonb_build_object(
    'is_deleted', false,
    '_dirty', false,
    'created_at', now(),
    'updated_at', now()
  ) || p_invoice || jsonb_build_object(
    'items', v_canonical_items,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax,
    'sales_total', v_sales_total,
    'cogs', v_cogs,
    'profit', round(v_sales_total - v_cogs, 2),
    'paymentMethod', v_payment_method,
    'splitPayments', case when v_payment_method = 'split' then v_split_payments else '[]'::jsonb end,
    'paymentStatus', 'paid',
    'shiftId', v_shift_id::text,
    'createdBy', v_created_by,
    'date', coalesce(nullif(p_invoice->>'date', ''), to_char(current_date, 'YYYY-MM-DD')),
    'updated_at', now()
  );

  insert into public.invoices
  select * from jsonb_populate_record(null::public.invoices, v_full)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing from public.invoices where id = v_invoice_id;
    if not found then
      raise exception 'INVOICE_COMMIT_RETRY_FAILED';
    end if;
    for v_stock_key, v_stock_value in select key, value from jsonb_each_text(v_stock_quantities) loop
      select stock into v_remaining from public.inventory where id = v_stock_key::uuid;
      v_stock_quantities := jsonb_set(v_stock_quantities, array[v_stock_key], to_jsonb(v_remaining), true);
    end loop;
    return jsonb_build_object(
      'invoice_id', v_invoice_id,
      'already_committed', true,
      'remaining_stock', v_stock_quantities,
      'invoice', to_jsonb(v_existing)
    );
  end if;

  if v_appointment_id is not null then
    update public.appointments
    set status = 'completed', updated_at = now()
    where id = v_appointment_id;
    update public.clinic_queue
    set status = 'completed', is_deleted = true
    where "appointmentId"::text = v_appointment_id::text
      and coalesce(is_deleted, false) = false;
  end if;

  for v_stock_key, v_stock_value in select key, value from jsonb_each_text(v_stock_quantities) loop
    v_remaining := public.atomic_stock_decrement(
      v_stock_key::uuid,
      -round(v_stock_value::numeric)::integer
    );
    v_stock_quantities := jsonb_set(v_stock_quantities, array[v_stock_key], to_jsonb(v_remaining), true);
  end loop;

  select * into v_cash, v_card, v_bank from public._invoice_method_cents(v_full);
  perform public.apply_shift_revenue(v_shift_id, v_cash, v_card, v_bank);

  v_patient_id := nullif(v_full->>'patientId', '');
  insert into public.checkout_effects (
    invoice_id, client_id, client_value_delta, appointment_id, source_refs
  )
  select v_invoice_id,
         case when v_patient_id is null or v_patient_id = 'RETAIL' then null
              else (select "clientId"::text from public.pets where id::text = v_patient_id limit 1)
         end,
         v_sales_total,
         case when v_appointment_id is null then null else v_appointment_id::text end,
         v_source_refs
  on conflict (invoice_id) do nothing;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_committed', false,
    'remaining_stock', v_stock_quantities,
    'invoice', v_full
  );
end;
$$;

-- The wrapper is the only browser entry point. It keeps the role check visible
-- at the API boundary and delegates the data mutation to the server-owned impl.
create or replace function public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout';
  end if;
  return public.commit_checkout_invoice_and_stock_impl(p_invoice, p_stock_items);
end;
$$;

-- Durable retry boundary for client lifetime value and clinical source billing.
-- If the browser loses the response after the invoice commits, this function can
-- safely be called again; the outbox row is applied at most once.
create or replace function public.process_checkout_effects_auth(
  p_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect public.checkout_effects;
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
  if p_invoice_id is null then
    raise exception 'INVALID_INVOICE_ID';
  end if;

  select * into v_effect
  from public.checkout_effects
  where invoice_id = p_invoice_id
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
    where client_id::text = v_effect.client_id;
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
        update public.vaccinations set billed = true, updated_at = now() where id::text = v_ref_id;
      elsif v_ref_type = 'grooming' then
        update public.grooming_logs set billed = true, updated_at = now() where id::text = v_ref_id;
      elsif v_ref_type = 'lab' then
        update public.lab_results set billed = true, updated_at = now() where id::text = v_ref_id;
      elsif v_ref_type = 'boarding' then
        update public.boarding_records set billed = true, updated_at = now() where id::text = v_ref_id;
      end if;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then
        raise exception 'SOURCE_RECORD_NOT_FOUND: %/%', v_ref_type, v_ref_id;
      end if;
    end loop;
  end if;

  update public.checkout_effects
  set status = 'applied', applied_at = now()
  where invoice_id = p_invoice_id;

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

-- Best-effort drain used at authenticated boot. Each invoice is still isolated
-- in its own subtransaction, so one malformed historical source cannot prevent
-- later pending effects from being retried.
create or replace function public.process_pending_checkout_effects_auth()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_processed integer := 0;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout effects';
  end if;

  for v_invoice_id in
    select invoice_id
    from public.checkout_effects
    where status = 'pending'
    order by created_at
    for update skip locked
  loop
    begin
      perform public.process_checkout_effects_auth(v_invoice_id);
      v_processed := v_processed + 1;
    exception when others then
      -- Leave the row pending for a later retry; do not hide the checkout itself.
      null;
    end;
  end loop;
  return v_processed;
end;
$$;

revoke all on function public.commit_checkout_invoice_and_stock_impl(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) from public, anon;
revoke all on function public.process_checkout_effects_auth(uuid) from public, anon;
revoke all on function public.process_pending_checkout_effects_auth() from public, anon;
grant execute on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.process_checkout_effects_auth(uuid) to authenticated, service_role;
grant execute on function public.process_pending_checkout_effects_auth() to authenticated, service_role;

-- Narrow direct writes. Reads remain active-staff scoped because the current app
-- hydrates its shared clinical workspace in one request; direct mutations must
-- still follow the role matrix and high-risk RPCs above.
do $$
declare
  table_name text;
begin
  -- Front desk / clinical operational records.
  foreach table_name in array array['appointments','boarding_records','clients','clinic_queue','grooming_logs','lab_results','pets','vaccinations'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists staff_insert on public.%I', table_name);
      execute format('drop policy if exists staff_update on public.%I', table_name);
      execute format('drop policy if exists role_insert on public.%I', table_name);
      execute format('drop policy if exists role_update on public.%I', table_name);
      execute format('create policy role_insert on public.%I for insert to authenticated with check (public.current_staff_role() = any (array[''cashier'',''veterinarian'',''groomer'',''manager'',''owner'',''admin'',''provider'']))', table_name);
      execute format('create policy role_update on public.%I for update to authenticated using (public.current_staff_role() = any (array[''cashier'',''veterinarian'',''groomer'',''manager'',''owner'',''admin'',''provider''])) with check (public.current_staff_role() = any (array[''cashier'',''veterinarian'',''groomer'',''manager'',''owner'',''admin'',''provider'']))', table_name);
    end if;
  end loop;

  if to_regclass('public.medical_records') is not null then
    drop policy if exists staff_insert on public.medical_records;
    drop policy if exists staff_update on public.medical_records;
    drop policy if exists role_insert on public.medical_records;
    drop policy if exists role_update on public.medical_records;
    create policy role_insert on public.medical_records for insert to authenticated
      with check (public.current_staff_role() = any (array['veterinarian','manager','owner','admin','provider']));
    create policy role_update on public.medical_records for update to authenticated
      using (public.current_staff_role() = any (array['veterinarian','manager','owner','admin','provider']))
      with check (public.current_staff_role() = any (array['veterinarian','manager','owner','admin','provider']));
  end if;

  -- The browser only inserts invoices through the authoritative checkout RPC;
  -- manager/root direct updates remain for controlled administrative corrections.
  if to_regclass('public.invoices') is not null then
    drop policy if exists staff_insert on public.invoices;
    drop policy if exists staff_update on public.invoices;
    drop policy if exists role_insert on public.invoices;
    drop policy if exists role_update on public.invoices;
    create policy role_insert on public.invoices for insert to authenticated
      with check (public.current_staff_role() = any (array['owner','manager','admin','provider']));
    create policy role_update on public.invoices for update to authenticated
      using (public.current_staff_role() = any (array['owner','manager','admin','provider']))
      with check (public.current_staff_role() = any (array['owner','manager','admin','provider']));
  end if;

  -- Catalog, batch, supplier, category, and financial setup writes are manager-owned.
  foreach table_name in array array['inventory','inventory_batches','inventory_categories','suppliers','system_config'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists staff_insert on public.%I', table_name);
      execute format('drop policy if exists staff_update on public.%I', table_name);
      execute format('drop policy if exists role_insert on public.%I', table_name);
      execute format('drop policy if exists role_update on public.%I', table_name);
      execute format('create policy role_insert on public.%I for insert to authenticated with check (public.current_staff_role() = any (array[''owner'',''manager'',''admin'',''provider'']))', table_name);
      execute format('create policy role_update on public.%I for update to authenticated using (public.current_staff_role() = any (array[''owner'',''manager'',''admin'',''provider''])) with check (public.current_staff_role() = any (array[''owner'',''manager'',''admin'',''provider'']))', table_name);
    end if;
  end loop;

  -- Shift rows are opened by the POS insert and closed/reconciled through the
  -- guarded RPC; no browser role receives a direct shift UPDATE policy here.
  if to_regclass('public.shifts') is not null then
    drop policy if exists staff_insert on public.shifts;
    drop policy if exists staff_update on public.shifts;
    drop policy if exists role_insert on public.shifts;
    drop policy if exists role_update on public.shifts;
    create policy role_insert on public.shifts for insert to authenticated
      with check (public.current_staff_role() = any (array['cashier','owner','manager','admin','provider']));
  end if;
end
$$;

commit;
