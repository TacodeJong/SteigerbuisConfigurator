-- Export pack: one-time €5 unlock for footprint + BOM print (no Paid save/publish)
alter table public.profiles
  add column if not exists export_pack boolean not null default false;

-- Clients must not set export_pack themselves (webhook / service role only)
create or replace function public.protect_profile_paid_fields()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and auth.uid() = old.id then
    if new.is_paid is distinct from old.is_paid
       or new.paid_until is distinct from old.paid_until
       or new.export_pack is distinct from old.export_pack then
      raise exception 'paid_fields_immutable';
    end if;
  end if;
  return new;
end;
$$;
