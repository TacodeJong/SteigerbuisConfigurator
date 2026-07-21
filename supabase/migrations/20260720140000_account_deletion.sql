-- Account deletion + anonymized audit log for admins
-- Client path: Edge Function `delete-account` (service role wipes auth.users).
-- Fallback RPC: `delete_my_account` (audit + public data; tries auth.users delete).

-- ---------------------------------------------------------------------------
-- deleted_accounts: anonymized audit trail (no plaintext email)
-- ---------------------------------------------------------------------------
create table if not exists public.deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  former_user_id uuid not null,
  email_hash text not null,
  display_name_redacted text,
  had_paid boolean not null default false,
  reason text
);

create index if not exists deleted_accounts_deleted_at_idx
  on public.deleted_accounts (deleted_at desc);

alter table public.deleted_accounts enable row level security;

-- No direct client writes; service role / security definer only.
drop policy if exists deleted_accounts_admin_select on public.deleted_accounts;
create policy deleted_accounts_admin_select on public.deleted_accounts
  for select
  to authenticated
  using (public.is_current_user_admin());

grant select on public.deleted_accounts to authenticated;

comment on table public.deleted_accounts is
  'Anonymized account-deletion audit. No plaintext email; content is not recoverable.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.hash_email_for_audit(p_email text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    digest(lower(trim(coalesce(p_email, ''))), 'sha256'),
    'hex'
  );
$$;

create or replace function public.redact_display_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  trimmed text := trim(coalesce(p_name, ''));
  first_char text;
begin
  if trimmed = '' then
    return null;
  end if;
  first_char := left(trimmed, 1);
  return first_char || '***';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: user-initiated deletion (audit + wipe public rows; auth.users if allowed)
-- Prefer Edge Function `delete-account` for reliable auth wipe.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(
  confirm_email text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  u_email text;
  v_profile public.profiles%rowtype;
  v_confirm text := trim(coalesce(confirm_email, ''));
  v_had_paid boolean := false;
begin
  if uid is null then
    raise exception 'unauthorized';
  end if;

  select email into u_email from auth.users where id = uid;
  if u_email is null then
    raise exception 'unauthorized';
  end if;

  if upper(v_confirm) <> 'VERWIJDER'
     and lower(v_confirm) <> lower(trim(u_email)) then
    raise exception 'confirm_mismatch'
      using message = 'Typ je e-mailadres of VERWIJDER om te bevestigen.';
  end if;

  select * into v_profile from public.profiles where id = uid;
  if found then
    v_had_paid := coalesce(v_profile.is_paid, false)
      and (v_profile.paid_until is null or v_profile.paid_until > now());
  end if;

  insert into public.deleted_accounts (
    former_user_id,
    email_hash,
    display_name_redacted,
    had_paid,
    reason
  ) values (
    uid,
    public.hash_email_for_audit(u_email),
    public.redact_display_name(v_profile.display_name),
    v_had_paid,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  -- App data (models / favourites / follows / profile_discounts cascade)
  delete from public.profiles where id = uid;

  -- Best-effort auth wipe (may require elevated privileges; Edge Function is preferred)
  begin
    delete from auth.users where id = uid;
  exception
    when insufficient_privilege then
      raise exception 'auth_delete_requires_edge'
        using message = 'Gebruik de delete-account Edge Function om auth.users te wissen.';
    when others then
      raise;
  end;
end;
$$;

revoke all on function public.delete_my_account(text, text) from public;
grant execute on function public.delete_my_account(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin list + count
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_deleted_accounts(p_limit integer default 50)
returns setof public.deleted_accounts
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  return query
    select *
    from public.deleted_accounts
    order by deleted_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.admin_list_deleted_accounts(integer) from public;
grant execute on function public.admin_list_deleted_accounts(integer) to authenticated;

create or replace function public.admin_deleted_accounts_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;
  select count(*)::integer into n from public.deleted_accounts;
  return n;
end;
$$;

revoke all on function public.admin_deleted_accounts_count() from public;
grant execute on function public.admin_deleted_accounts_count() to authenticated;
