-- V32 : exécuter dans Supabase SQL Editor AVANT la mise en ligne.
-- Verrouille chaque sauvegarde et refuse toute écriture basée sur une ancienne version.
CREATE OR REPLACE FUNCTION public.save_provider_backup_safe(
 p_provider text, p_expected jsonb, p_data jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE old_data jsonb; current_user_id uuid := (select auth.uid());
BEGIN
 IF current_user_id IS NULL OR p_provider <> 'google' OR p_data IS NULL THEN RAISE EXCEPTION 'Accès refusé'; END IF;
 -- Serialize competing updates for this user/provider even when the row does not yet exist.
 PERFORM pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_provider, 0));
 SELECT data INTO old_data FROM public.provider_backups
 WHERE user_id=current_user_id AND provider=p_provider FOR UPDATE;
 IF NOT FOUND THEN
   IF p_expected IS NOT NULL THEN RETURN false; END IF;
   INSERT INTO public.provider_backups(user_id,provider,data,updated_at)
   VALUES(current_user_id,p_provider,p_data,now());
   RETURN true;
 END IF;
 IF old_data IS DISTINCT FROM p_expected THEN RETURN false; END IF;
 UPDATE public.provider_backups SET data=p_data,updated_at=now()
 WHERE user_id=current_user_id AND provider=p_provider;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.save_provider_backup_safe(text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_provider_backup_safe(text,jsonb,jsonb) TO authenticated;
