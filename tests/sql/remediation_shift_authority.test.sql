-- Read-only catalog/grant assertions for server-owned shift mutations.
-- Run after the remediation migrations on a disposable or staging target.

do $$
begin
  if to_regprocedure('public.open_shift_auth(uuid,integer)') is null
     or to_regprocedure('public.restore_shift_auth(jsonb)') is null then
    raise exception 'FAIL: shift authority RPC is missing';
  end if;
  if has_table_privilege('authenticated', 'public.shifts', 'INSERT')
     or has_table_privilege('authenticated', 'public.shifts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.shifts', 'DELETE') then
    raise exception 'FAIL: authenticated retains direct shift mutation privilege';
  end if;
  if not has_function_privilege('authenticated', 'public.open_shift_auth(uuid,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.restore_shift_auth(jsonb)', 'EXECUTE') then
    raise exception 'FAIL: authenticated shift authority grant is missing';
  end if;
  raise notice 'VHMS SHIFT AUTHORITY: PASS';
end
$$;
