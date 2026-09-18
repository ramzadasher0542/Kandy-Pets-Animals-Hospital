-- Restore the execution grant required by tenant RLS policies.
-- current_clinic_id() is SECURITY DEFINER and must remain inaccessible to anon.

begin;

do $$
begin
  if to_regprocedure('public.current_clinic_id()') is null then
    raise exception 'CURRENT_CLINIC_ID_REQUIRED: helper function is missing';
  end if;
end
$$;

revoke all on function public.current_clinic_id() from public, anon, authenticated, service_role;
grant execute on function public.current_clinic_id() to authenticated, service_role;

commit;
