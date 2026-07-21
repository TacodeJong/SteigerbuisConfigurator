-- Admin role + site-wide app settings (feature flags)
-- Admin is NOT unlockable via URL; grant only via SQL / service role.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Clients must never set is_admin (or paid fields) themselves
create or replace function public.protect_profile_paid_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'admin_field_immutable';
    end if;
    if auth.uid() = old.id then
      if new.is_paid is distinct from old.is_paid
         or new.paid_until is distinct from old.paid_until
         or new.export_pack is distinct from old.export_pack then
        raise exception 'paid_fields_immutable';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- app_settings: public read, admin write via RPC
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('planks_enabled', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_all on public.app_settings;
create policy app_settings_select_all on public.app_settings
  for select using (true);

grant select on public.app_settings to anon, authenticated;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_current_user_admin() from public;
grant execute on function public.is_current_user_admin() to authenticated;

create or replace function public.set_app_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  insert into public.app_settings (key, value, updated_at)
  values (p_key, p_value, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

revoke all on function public.set_app_setting(text, jsonb) from public;
grant execute on function public.set_app_setting(text, jsonb) to authenticated;

comment on column public.profiles.is_admin is
  'Site admin. Grant only via SQL/service role, e.g. UPDATE profiles SET is_admin = true WHERE id = …';
