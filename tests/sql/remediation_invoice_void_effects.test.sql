-- Read-only catalog/grant assertions for server-owned invoice void effects.
-- Run after the remediation migrations on a disposable or staging target.

do $$
begin
  if to_regprocedure('public.void_invoice_and_reverse_revenue_auth(uuid)') is null then
    raise exception 'FAIL: authenticated invoice void RPC is missing';
  end if;
  if not has_function_privilege('authenticated', 'public.void_invoice_and_reverse_revenue_auth(uuid)', 'EXECUTE') then
    raise exception 'FAIL: authenticated invoice void RPC grant is missing';
  end if;
  if has_table_privilege('authenticated', 'public.invoices', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     or has_table_privilege('authenticated', 'public.invoices', 'DELETE') then
    raise exception 'FAIL: authenticated retains direct invoice mutation privilege';
  end if;
  raise notice 'VHMS INVOICE VOID AUTHORITY: PASS';
end
$$;
