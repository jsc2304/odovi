-- Additional synthetic records for calendar and analytics accessibility checks.
-- Use only the runner-owned disposable Odovi database, after setup and sync.
-- psql -v ON_ERROR_STOP=1 -v fixture_day=YYYY-MM-DD -f analytics-access-fixture.sql
-- TeslaMate remains read-only. Commute records leave the private/business
-- counts in insights-fixture.sql unchanged.
begin;

create temporary table analytics_access_context on commit drop as
select :'fixture_day'::date as fixture_day,
  (:'fixture_day'::date + time '04:00') at time zone 'Europe/Berlin' as anchor,
  (select id from vehicles where source = 'teslamate' order by id limit 1) as vehicle_id;

do $$
begin
  if (select vehicle_id is null from analytics_access_context) then
    raise exception 'The synchronized synthetic TeslaMate vehicle is required';
  end if;
  if (select fixture_day from analytics_access_context) >= (now() at time zone 'Europe/Berlin')::date then
    raise exception 'The accessibility fixture day must be wholly in the past';
  end if;
  if exists (select 1 from drives where source = 'release-acceptance-analytics-access')
    or exists (select 1 from places where source = 'release-acceptance-analytics-access') then
    raise exception 'Refusing to duplicate an existing accessibility fixture';
  end if;
end $$;

insert into places (name, type, lat, lon, address, source, source_id)
select 'Acceptance Destination ' || lpad(n::text, 2, '0'), 'other',
  48 + n * 0.01, 11 + n * 0.01, 'Synthetic destination ' || n,
  'release-acceptance-analytics-access', 'destination-' || n
from generate_series(0, 11) n;

insert into drives (
  vehicle_id, start_time, end_time, start_lat, start_lon, end_lat, end_lon,
  start_address, end_address, end_place_id, distance_km, duration_seconds,
  consumed_energy_kwh, avg_consumption_wh_km, outside_temp_avg,
  energy_is_estimated, classification, source, source_id
)
select context.vehicle_id, context.anchor + n * interval '15 minutes',
  context.anchor + n * interval '15 minutes' + (600 + n % 5 * 60) * interval '1 second',
  48, 11, destination.lat, destination.lon, 'Synthetic start', destination.address,
  destination.id, 12 + n, 600 + n % 5 * 60,
  (12 + n) * (160 + n % 3 * 15) / 1000.0,
  160 + n % 3 * 15, -5 + n % 8 * 5, n % 4 = 0,
  'commute', 'release-acceptance-analytics-access', 'access-drive-' || n
from analytics_access_context context
cross join generate_series(0, 34) n
join places destination on destination.source = 'release-acceptance-analytics-access'
  and destination.source_id = 'destination-' || n % 12;

do $$
begin
  if exists (select 1 from drives group by vehicle_id, source_id having count(*) > 1) then
    raise exception 'Derived park identifiers require distinct synthetic drive identifiers';
  end if;
  if (select count(*) from drives where source = 'release-acceptance-analytics-access'
    and end_time <= now() and distance_km >= 2 and avg_consumption_wh_km is not null) <> 35
    or (select count(*) from places where source = 'release-acceptance-analytics-access') <> 12 then
    raise exception 'The complete accessibility fixture was not created';
  end if;
end $$;

select json_build_object('fixtureDay', fixture_day, 'usableDrives', 35,
  'commuteDestinations', 12, 'source', 'release-acceptance-analytics-access')
from analytics_access_context;
commit;
