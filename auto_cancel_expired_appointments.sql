-- Migration: Automated Appointment Expiry Sweeper
-- Description: Creates a secure database function and trigger to auto-cancel booked appointments whose dates have passed, logging results to telemetry.

-- Enable pg_cron extension if not present
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Write function to sweeper appointments table
CREATE OR REPLACE FUNCTION public.auto_cancel_expired_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Perform update targeting the appointments table (mapping fuzzy intent visit_date to date)
  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE status = 'booked'
    AND date::date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert telemetry entry into system_alerts table
  INSERT INTO public.system_alerts (severity, category, message, timestamp, read)
  VALUES (
    'info',
    'appointment',
    'Automated Appointment Expiry Sweeper executed: ' || v_count || ' expired bookings auto-cancelled.',
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    false
  );

  -- Notify cache invalidation so postgrest has new data
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Unschedule any existing cron job if exists to prevent duplication
DO $$
BEGIN
  PERFORM cron.unschedule('auto-cancel-expired-bookings-job');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- Schedule the function to run at 23:59 (11:59 PM) every day
SELECT cron.schedule(
    'auto-cancel-expired-bookings-job',
    '59 23 * * *',
    'SELECT public.auto_cancel_expired_bookings();'
);
