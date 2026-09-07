-- Additional, wholly synthetic Odovi records for the 0.3.0 release checks.
-- Run only in the runner-owned disposable project, after the setup journey.
-- psql -v ON_ERROR_STOP=1 -v fixture_day=YYYY-MM-DD -f insights-fixture.sql
-- TeslaMate remains read-only: this fixture writes only to the Odovi database.
begin;

create temporary table insights_fixture_context on commit drop as
select :'fixture_day'::date as fixture_day,
  (:'fixture_day'::date + time '02:00') at time zone 'Europe/Zurich' as anchor,
  (select id from vehicles where source = 'teslamate' order by id limit 1) as vehicle_id;

do $$
begin
  if (select vehicle_id is null from insights_fixture_context) then
    raise exception 'The synchronized synthetic TeslaMate vehicle is required';
  end if;
  if (select fixture_day from insights_fixture_context) >= (now() at time zone 'Europe/Zurich')::date then
    raise exception 'The analytics fixture day must be wholly in the past';
  end if;
  if exists (select 1 from charge_sessions where source = 'release-acceptance-insights')
    or exists (select 1 from places where source = 'release-acceptance-insights') then
    raise exception 'Refusing to duplicate an existing analytics fixture';
  end if;
end $$;

insert into places (name, type, lat, lon, address, source, source_id)
values
  ('Acceptance Home', 'home', 47.375, 8.545, 'Synthetic home', 'release-acceptance-insights', 'home'),
  ('Acceptance Lake', 'other', 47.255, 8.625, 'Synthetic destination', 'release-acceptance-insights', 'lake');

-- Three private arrivals at Home and one elsewhere make visit weighting and
-- Home exclusion observable. A fifth, business drive must remain excluded.
insert into drives (
  vehicle_id, start_time, end_time, start_lat, start_lon, end_lat, end_lon,
  end_place_id, distance_km, duration_seconds, consumed_energy_kwh,
  energy_is_estimated, classification, source, source_id
)
select context.vehicle_id, context.anchor + interval '10 hours' + n * interval '30 minutes',
  context.anchor + interval '10 hours 20 minutes' + n * interval '30 minutes',
  47.375, 8.545, destination.lat, destination.lon, destination.id,
  (n + 1) * 10, 1200, (n + 1) * 2, n % 2 = 0,
  (case when n = 4 then 'business' else 'private' end)::drive_classification,
  'release-acceptance-insights', 'drive-' || n
from insights_fixture_context context
cross join generate_series(0, 4) n
join places destination on destination.source = 'release-acceptance-insights'
  and destination.source_id = case when n < 3 then 'home' else 'lake' end;

-- Twelve recent DC sessions exercise both selector limits. Session 11 has no
-- curve and must not be replaced by an older row; session 10 has a slower,
-- fully recorded 45-minute 10-80% window. All others take 35 minutes.
insert into charge_sessions (
  vehicle_id, start_time, end_time, place_id, lat, lon, start_soc, end_soc,
  energy_added_kwh, max_power_kw, charger_type, outside_temp_avg,
  duration_seconds, cost, currency, cost_source, source, source_id
)
select context.vehicle_id, context.anchor + n * interval '50 minutes',
  context.anchor + n * interval '50 minutes' + case when n = 10 then interval '45 minutes' else interval '35 minutes' end,
  destination.id, destination.lat, destination.lon, 10, 80, 50,
  case when n = 10 then 110 else 120 end, 'dc', 16,
  case when n = 10 then 2700 else 2100 end,
  case when n % 2 = 0 then 2.10 else 3.20 end,
  case when n % 2 = 0 then 'EUR' else 'CHF' end,
  'manual', 'release-acceptance-insights', 'dc-' || n
from insights_fixture_context context
cross join generate_series(0, 11) n
join places destination on destination.source = 'release-acceptance-insights'
  and destination.source_id = case when n % 2 = 0 then 'home' else 'lake' end;

insert into charge_points (charge_session_id, ts, soc, power_kw, outside_temp)
select session.id, session.start_time + sample * (session.duration_seconds / 35.0) * interval '1 second',
  10 + sample * 2, session.max_power_kw - sample * 2, 16
from charge_sessions session
cross join generate_series(0, 35) sample
where session.source = 'release-acceptance-insights' and session.source_id <> 'dc-11';

do $$
begin
  if (select count(*) from drives where source = 'release-acceptance-insights' and classification = 'private') <> 4
    or (select count(*) from charge_sessions where source = 'release-acceptance-insights' and end_time <= now()) <> 12
    or (select count(*) from charge_points point join charge_sessions session on session.id = point.charge_session_id
      where session.source = 'release-acceptance-insights') <> 396 then
    raise exception 'The complete analytics fixture was not created';
  end if;
end $$;

select json_build_object(
  'fixtureDay', fixture_day, 'insightsYear', extract(year from fixture_day)::int,
  'privateDrives', 4, 'privateDestinations', 2, 'completedDcSessions', 12,
  'sessionsWithPoints', 11, 'chargePoints', 396
) from insights_fixture_context;
commit;
