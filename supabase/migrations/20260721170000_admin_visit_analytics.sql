-- Visit analytics for admin dashboard (privacy-friendly, no PII/IP storage)

create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  visitor_key text not null,
  route text not null,
  path text not null,
  visited_at timestamptz not null default now(),
  user_agent text,
  constraint page_visits_visitor_key_len check (char_length(visitor_key) between 16 and 128),
  constraint page_visits_route_nonempty check (char_length(trim(route)) > 0),
  constraint page_visits_path_nonempty check (char_length(trim(path)) > 0)
);

create index if not exists page_visits_visited_at_idx on public.page_visits (visited_at desc);
create index if not exists page_visits_visitor_time_idx on public.page_visits (visitor_key, visited_at desc);
create index if not exists page_visits_route_time_idx on public.page_visits (route, visited_at desc);

alter table public.page_visits enable row level security;

drop policy if exists page_visits_insert_anon on public.page_visits;
create policy page_visits_insert_anon on public.page_visits
  for insert
  to anon
  with check (true);

drop policy if exists page_visits_insert_authenticated on public.page_visits;
create policy page_visits_insert_authenticated on public.page_visits
  for insert
  to authenticated
  with check (true);

create or replace function public.admin_visit_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from timestamptz := now() - make_interval(days => v_days);
  v_bucket text := case when v_days <= 2 then 'hour' else 'day' end;
  v_total integer := 0;
  v_unique integer := 0;
  v_series jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.is_current_user_admin() then
    raise exception 'admin_required';
  end if;

  select
    count(*)::integer,
    count(distinct visitor_key)::integer
  into v_total, v_unique
  from public.page_visits
  where visited_at >= v_from;

  if v_bucket = 'hour' then
    with points as (
      select generate_series(
        date_trunc('hour', v_from),
        date_trunc('hour', now()),
        interval '1 hour'
      ) as bucket
    ),
    aggregated as (
      select
        date_trunc('hour', visited_at) as bucket,
        count(*)::integer as visits,
        count(distinct visitor_key)::integer as uniques
      from public.page_visits
      where visited_at >= v_from
      group by 1
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket', points.bucket,
          'visits', coalesce(aggregated.visits, 0),
          'uniques', coalesce(aggregated.uniques, 0)
        )
        order by points.bucket
      ),
      '[]'::jsonb
    )
    into v_series
    from points
    left join aggregated using (bucket);
  else
    with points as (
      select generate_series(
        date_trunc('day', v_from),
        date_trunc('day', now()),
        interval '1 day'
      ) as bucket
    ),
    aggregated as (
      select
        date_trunc('day', visited_at) as bucket,
        count(*)::integer as visits,
        count(distinct visitor_key)::integer as uniques
      from public.page_visits
      where visited_at >= v_from
      group by 1
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket', points.bucket,
          'visits', coalesce(aggregated.visits, 0),
          'uniques', coalesce(aggregated.uniques, 0)
        )
        order by points.bucket
      ),
      '[]'::jsonb
    )
    into v_series
    from points
    left join aggregated using (bucket);
  end if;

  return jsonb_build_object(
    'range_days', v_days,
    'granularity', v_bucket,
    'total_visits', v_total,
    'unique_visitors', v_unique,
    'series', v_series
  );
end;
$$;

revoke all on function public.admin_visit_analytics(integer) from public;
grant execute on function public.admin_visit_analytics(integer) to authenticated;
