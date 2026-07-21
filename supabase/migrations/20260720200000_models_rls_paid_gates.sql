-- P0: models RLS — Paid-gates afdwingen via security-definer RPCs
-- Directe PostgREST INSERT/UPDATE omzeilen limieten (save_limit / paid_required).
-- Reads + DELETE van eigen models blijven via table grants/policies.
-- Writes/publish/fork: alleen save_model / publish_model / unpublish_model / fork_model.

-- Drop permissive write policies
drop policy if exists models_insert_own on public.models;
drop policy if exists models_update_own on public.models;

-- Keep select (own + published) and delete-own
drop policy if exists models_select_own_or_published on public.models;
create policy models_select_own_or_published on public.models
  for select using (
    owner_id = auth.uid() or visibility = 'published'
  );

drop policy if exists models_delete_own on public.models;
create policy models_delete_own on public.models
  for delete using (owner_id = auth.uid());

-- Revoke direct client writes; RPCs (security definer) bypass RLS as owner
revoke insert, update on public.models from authenticated;
revoke insert, update on public.models from anon;

-- Explicit remaining grants
grant select on public.models to anon, authenticated;
grant delete on public.models to authenticated;

comment on table public.models is
  'Cloud models. INSERT/UPDATE only via save_model / publish_model / unpublish_model / fork_model RPCs. Clients may SELECT and DELETE (own).';
