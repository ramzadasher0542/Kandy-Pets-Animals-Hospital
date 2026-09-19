-- Keep the checkout effect source-reference invariant true for every writer.
-- The column already defaults to an empty array, but an explicit NULL can bypass
-- that default when a legacy or future RPC omits source references.
CREATE OR REPLACE FUNCTION public.normalize_checkout_effect_source_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.source_refs := COALESCE(NEW.source_refs, '[]'::jsonb);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_checkout_effect_source_refs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_checkout_effect_source_refs() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_checkout_effect_source_refs() TO service_role;

DROP TRIGGER IF EXISTS checkout_effects_source_refs_not_null ON public.checkout_effects;
CREATE TRIGGER checkout_effects_source_refs_not_null
BEFORE INSERT OR UPDATE OF source_refs ON public.checkout_effects
FOR EACH ROW
EXECUTE FUNCTION public.normalize_checkout_effect_source_refs();
