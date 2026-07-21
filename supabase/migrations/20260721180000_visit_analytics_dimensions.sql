-- Visit analytics dimensions: browser, OS, referrer/UTM, privacy-friendly location

alter table public.page_visits
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists timezone text,
  add column if not exists country_code text;

alter table public.page_visits
  drop constraint if exists page_visits_browser_len,
  drop constraint if exists page_visits_os_len,
  drop constraint if exists page_visits_referrer_host_len,
  drop constraint if exists page_visits_utm_source_len,
  drop constraint if exists page_visits_utm_medium_len,
  drop constraint if exists page_visits_utm_campaign_len,
  drop constraint if exists page_visits_timezone_len,
  drop constraint if exists page_visits_country_code_len;

alter table public.page_visits
  add constraint page_visits_browser_len check (browser is null or char_length(browser) <= 32),
  add constraint page_visits_os_len check (os is null or char_length(os) <= 32),
  add constraint page_visits_referrer_host_len check (referrer_host is null or char_length(referrer_host) <= 253),
  add constraint page_visits_utm_source_len check (utm_source is null or char_length(utm_source) <= 64),
  add constraint page_visits_utm_medium_len check (utm_medium is null or char_length(utm_medium) <= 64),
  add constraint page_visits_utm_campaign_len check (utm_campaign is null or char_length(utm_campaign) <= 64),
  add constraint page_visits_timezone_len check (timezone is null or char_length(timezone) <= 64),
  add constraint page_visits_country_code_len check (
    country_code is null or char_length(country_code) = 2
  );

create index if not exists page_visits_browser_time_idx
  on public.page_visits (browser, visited_at desc);
create index if not exists page_visits_os_time_idx
  on public.page_visits (os, visited_at desc);
create index if not exists page_visits_referrer_time_idx
  on public.page_visits (referrer_host, visited_at desc);
create index if not exists page_visits_location_time_idx
  on public.page_visits (country_code, timezone, visited_at desc);

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
  v_browsers jsonb := '[]'::jsonb;
  v_oses jsonb := '[]'::jsonb;
  v_referrers jsonb := '[]'::jsonb;
  v_utm jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', key,
        'visits', visits,
        'uniques', uniques
      )
      order by visits desc, key
    ),
    '[]'::jsonb
  )
  into v_browsers
  from (
    select
      coalesce(nullif(trim(browser), ''), 'Onbekend') as key,
      count(*)::integer as visits,
      count(distinct visitor_key)::integer as uniques
    from public.page_visits
    where visited_at >= v_from
    group by 1
  ) browsers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', key,
        'visits', visits,
        'uniques', uniques
      )
      order by visits desc, key
    ),
    '[]'::jsonb
  )
  into v_oses
  from (
    select
      coalesce(nullif(trim(os), ''), 'Onbekend') as key,
      count(*)::integer as visits,
      count(distinct visitor_key)::integer as uniques
    from public.page_visits
    where visited_at >= v_from
    group by 1
  ) oses;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', key,
        'visits', visits,
        'uniques', uniques
      )
      order by visits desc, key
    ),
    '[]'::jsonb
  )
  into v_referrers
  from (
    select
      case
        when referrer_host is null or trim(referrer_host) = '' then 'Direct'
        else left(trim(referrer_host), 253)
      end as key,
      count(*)::integer as visits,
      count(distinct visitor_key)::integer as uniques
    from public.page_visits
    where visited_at >= v_from
    group by 1
    order by 2 desc, 1
    limit 25
  ) referrers;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'source', source,
        'medium', medium,
        'campaign', campaign,
        'visits', visits,
        'uniques', uniques
      )
      order by visits desc, source, medium, campaign
    ),
    '[]'::jsonb
  )
  into v_utm
  from (
    select
      coalesce(nullif(trim(utm_source), ''), '(geen)') as source,
      coalesce(nullif(trim(utm_medium), ''), '(geen)') as medium,
      coalesce(nullif(trim(utm_campaign), ''), '(geen)') as campaign,
      count(*)::integer as visits,
      count(distinct visitor_key)::integer as uniques
    from public.page_visits
    where visited_at >= v_from
      and (
        nullif(trim(utm_source), '') is not null
        or nullif(trim(utm_medium), '') is not null
        or nullif(trim(utm_campaign), '') is not null
      )
    group by 1, 2, 3
    order by 4 desc, 1, 2, 3
    limit 25
  ) utm;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', key,
        'country_code', country_code,
        'timezone', timezone,
        'visits', visits,
        'uniques', uniques
      )
      order by visits desc, key
    ),
    '[]'::jsonb
  )
  into v_locations
  from (
    select
      case
        when nullif(trim(country_code), '') is not null then upper(trim(country_code))
        when nullif(trim(timezone), '') is not null then trim(timezone)
        else 'Onbekend'
      end as key,
      nullif(upper(trim(country_code)), '') as country_code,
      nullif(trim(timezone), '') as timezone,
      count(*)::integer as visits,
      count(distinct visitor_key)::integer as uniques
    from public.page_visits
    where visited_at >= v_from
    group by 1, 2, 3
    order by 4 desc, 1
    limit 25
  ) locations;

  return jsonb_build_object(
    'range_days', v_days,
    'granularity', v_bucket,
    'total_visits', v_total,
    'unique_visitors', v_unique,
    'series', v_series,
    'browsers', v_browsers,
    'oses', v_oses,
    'referrers', v_referrers,
    'utm', v_utm,
    'locations', v_locations
  );
end;
$$;

revoke all on function public.admin_visit_analytics(integer) from public;
grant execute on function public.admin_visit_analytics(integer) to authenticated;
