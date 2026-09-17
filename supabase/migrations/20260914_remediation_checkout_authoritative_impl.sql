-- Remediation P2.2: replace the legacy checkout implementation with the
-- server-authoritative implementation required by the authenticated wrapper.
-- This migration is ordered before the zz release manifest.

begin;

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
  v_clinic_id uuid;
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
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null
     or nullif(p_invoice->>'clinic_id', '')::uuid is distinct from v_clinic_id then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  begin
    v_discount := coalesce(nullif(p_invoice->>'discount', '')::numeric, 0);
  exception when others then
    raise exception 'INVALID_DISCOUNT';
  end;
  if v_discount < 0 then
    raise exception 'INVALID_DISCOUNT';
  end if;

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
      and clinic_id = v_clinic_id
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
    and clinic_id = v_clinic_id
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
    perform 1
    from public.appointments
    where id = v_appointment_id
      and clinic_id = v_clinic_id;
    if not found then
      raise exception 'APPOINTMENT_NOT_FOUND: %', v_appointment_id;
    end if;
  end if;

  select name
    into v_created_by
  from public.users
  where auth_user_id = auth.uid()
    and clinic_id = v_clinic_id
    and active = true
    and coalesce(is_deleted, false) = false;
  if v_created_by is null then
    raise exception 'STAFF_IDENTITY_NOT_FOUND';
  end if;

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
    'clinic_id', v_clinic_id::text,
    'updated_at', now()
  );

  insert into public.invoices
  select * from jsonb_populate_record(null::public.invoices, v_full)
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_existing from public.invoices where id = v_invoice_id;
    if not found or v_existing.clinic_id is distinct from v_clinic_id then
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
    where id = v_appointment_id
      and clinic_id = v_clinic_id;
    update public.clinic_queue
    set status = 'completed', is_deleted = true
    where "appointmentId"::text = v_appointment_id::text
      and clinic_id = v_clinic_id
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
    invoice_id, clinic_id, client_id, client_value_delta, appointment_id, source_refs
  )
  select v_invoice_id,
         v_clinic_id,
         case when v_patient_id is null or v_patient_id = 'RETAIL' then null
              else (select "clientId"::text from public.pets where id::text = v_patient_id and clinic_id = v_clinic_id limit 1)
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

revoke all on function public.commit_checkout_invoice_and_stock_impl(jsonb, jsonb)
  from public, anon, authenticated, service_role;

commit;
