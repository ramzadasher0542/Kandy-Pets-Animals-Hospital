-- Remediation P1.3: enforce one open shift per clinic, not one globally.
-- This migration intentionally fails before changing the index if existing open
-- rows cannot satisfy the new tenant invariant.

begin;

do $$
begin
  if exists (
    select 1
    from public.shifts
    where "isOpen" = true
      and clinic_id is null
  ) then
    raise exception 'OPEN_SHIFT_CLINIC_REQUIRED: an open shift has no clinic_id';
  end if;

  if exists (
    select clinic_id
    from public.shifts
    where "isOpen" = true
    group by clinic_id
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_OPEN_SHIFT_CLINIC: resolve duplicate open shifts first';
  end if;
end
$$;

drop index if exists public.uniq_shifts_single_open;

alter table public.shifts
  drop constraint if exists shifts_open_requires_clinic;

alter table public.shifts
  add constraint shifts_open_requires_clinic
  check ("isOpen" is not true or clinic_id is not null);

create unique index uniq_shifts_single_open
  on public.shifts (clinic_id)
  where "isOpen" = true;

commit;
