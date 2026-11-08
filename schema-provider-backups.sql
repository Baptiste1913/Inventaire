-- Inventaires U V31.27 — espaces séparés par méthode de connexion.
-- À exécuter UNE FOIS dans Supabase SQL Editor AVANT de publier V31.27.
CREATE TABLE IF NOT EXISTS public.provider_backups (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','email')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,provider)
);
ALTER TABLE public.provider_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_backups FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_backups TO authenticated;
DROP POLICY IF EXISTS "Read own provider backups" ON public.provider_backups;
DROP POLICY IF EXISTS "Insert own provider backups" ON public.provider_backups;
DROP POLICY IF EXISTS "Update own provider backups" ON public.provider_backups;
DROP POLICY IF EXISTS "Delete own provider backups" ON public.provider_backups;
CREATE POLICY "Read own provider backups" ON public.provider_backups FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY "Insert own provider backups" ON public.provider_backups FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY "Update own provider backups" ON public.provider_backups FOR UPDATE TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY "Delete own provider backups" ON public.provider_backups FOR DELETE TO authenticated USING ((SELECT auth.uid())=user_id);
-- Migration non destructive : les anciennes sauvegardes V31.26 sont attribuées à Google.
-- Si une sauvegarde Google existe déjà dans la nouvelle table, elle n'est pas remplacée.
INSERT INTO public.provider_backups(user_id,provider,data,updated_at)
SELECT user_id,'google',data,updated_at FROM public.user_backups
ON CONFLICT (user_id,provider) DO NOTHING;
