-- Exécuter dans Supabase > SQL Editor (une seule fois).
create table if not exists public.inventory_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.inventory_backups enable row level security;
revoke all on public.inventory_backups from anon;
grant select, insert, update, delete on public.inventory_backups to authenticated;
drop policy if exists "Users read own backups" on public.inventory_backups;
create policy "Users read own backups" on public.inventory_backups for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users create own backups" on public.inventory_backups;
create policy "Users create own backups" on public.inventory_backups for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own backups" on public.inventory_backups;
create policy "Users update own backups" on public.inventory_backups for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete own backups" on public.inventory_backups;
create policy "Users delete own backups" on public.inventory_backups for delete to authenticated using ((select auth.uid()) = user_id);
