-- PHASE 5: per-tenant feature flags.
CREATE TABLE IF NOT EXISTS public.clinic_settings (
  clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  tax_enabled boolean NOT NULL DEFAULT true,
  grooming_enabled boolean NOT NULL DEFAULT true,
  boarding_enabled boolean NOT NULL DEFAULT true
);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_settings_read ON public.clinic_settings;
CREATE POLICY clinic_settings_read ON public.clinic_settings
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.current_clinic_id()
    OR public.is_current_user_superadmin()
  );

DROP POLICY IF EXISTS clinic_settings_superadmin_write ON public.clinic_settings;
CREATE POLICY clinic_settings_superadmin_write ON public.clinic_settings
  FOR ALL
  TO authenticated
  USING (public.is_current_user_superadmin())
  WITH CHECK (public.is_current_user_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_settings TO authenticated;

INSERT INTO public.clinic_settings (clinic_id)
SELECT id FROM public.clinics
ON CONFLICT (clinic_id) DO NOTHING;
