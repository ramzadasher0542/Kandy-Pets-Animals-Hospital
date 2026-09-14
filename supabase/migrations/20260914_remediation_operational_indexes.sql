-- Remediation P6.2: predicate-aware indexes for bounded tenant operations.

begin;

create index if not exists idx_invoices_clinic_date_status
  on public.invoices (clinic_id, date desc, "paymentStatus")
  where is_deleted = false;

create index if not exists idx_appointments_clinic_date_status
  on public.appointments (clinic_id, date desc, status)
  where is_deleted = false;

create index if not exists idx_clinic_queue_clinic_status_service
  on public.clinic_queue (clinic_id, status, "serviceType", "checkInTime" desc)
  where is_deleted = false;

create index if not exists idx_inventory_batches_clinic_item_expiry
  on public.inventory_batches (clinic_id, "inventoryItemId", "expiryDate")
  where is_deleted = false;

create index if not exists idx_shifts_clinic_open_start
  on public.shifts (clinic_id, "isOpen", "startTime" desc)
  where is_deleted = false;

commit;
