-- Synthetic energy records in the runner-owned disposable archive only.
begin;
create temporary table energy_context on commit drop as
select (select id from vehicles order by id limit 1) as primary_vehicle_id,
  date_trunc('month', :'fixture_day'::date)::date - interval '1 month' as latest_month,
  date_trunc('minute', now()) - interval '4 hours' as charge_end;

insert into vehicles (display_name, source, source_id)
values ('Energy analytics fixture', 'release-acceptance-energy', 'vehicle'),
  ('Empty energy fixture', 'release-acceptance-energy', 'empty');

alter table energy_context add column vehicle_id bigint;
alter table energy_context add column empty_vehicle_id bigint;
update energy_context set
  vehicle_id = (select id from vehicles where source = 'release-acceptance-energy' and source_id = 'vehicle'),
  empty_vehicle_id = (select id from vehicles where source = 'release-acceptance-energy' and source_id = 'empty');

insert into places (name, type, lat, lon, source, source_id)
values ('Energy fixture charger', 'charger', 47, 8, 'release-acceptance-energy', 'charger');

insert into charge_sessions (vehicle_id, start_time, end_time, end_soc,
  end_rated_range_km, energy_added_kwh, energy_used_kwh, cost, currency,
  charger_type, place_id, source, source_id)
select c.vehicle_id,
  (c.latest_month - m * interval '1 month' + (n + 1) * interval '1 day') at time zone 'Europe/Zurich',
  (c.latest_month - m * interval '1 month' + (n + 1) * interval '1 day' + interval '1 hour') at time zone 'Europe/Zurich',
  80, case when m = 2 then 400 else 392 end, 20, 22, 6, 'EUR', 'ac',
  (select id from places where source = 'release-acceptance-energy'),
  'release-acceptance-energy', 'range-' || m || '-' || n
from energy_context c cross join (values (0), (2)) months(m)
cross join generate_series(0, 2) n;

insert into charge_sessions (vehicle_id, start_time, end_time, end_soc,
  end_rated_range_km, energy_added_kwh, energy_used_kwh, cost, currency,
  charger_type, address, source, source_id)
select c.vehicle_id,
  (c.latest_month + (n + 5) * interval '1 day') at time zone 'Europe/Zurich',
  (c.latest_month + (n + 5) * interval '1 day' + interval '1 hour') at time zone 'Europe/Zurich',
  80, rated_range, added, drawn, price, currency, kind::charger_type,
  address, 'release-acceptance-energy', 'economics-' || n
from energy_context c cross join (values
  (0, 392.0, 40.0, 40.0, 20.0, 'USD', 'dc', 'Synthetic fast charger'),
  (1, 392.0, 10.0, 12.0, 0.0, 'EUR', 'ac', 'Synthetic free charger'),
  (2, null, 15.0, null, null, null, null, null),
  (3, null, 30.0, 20.0, 8.0, 'EUR', 'ac', 'Synthetic inconsistent meter'),
  (4, null, 5.0, 6.0, 2.0, null, 'ac', null)
) extra(n, rated_range, added, drawn, price, currency, kind, address);

insert into charge_sessions (vehicle_id, start_time, end_time, end_soc,
  energy_added_kwh, source, source_id)
select primary_vehicle_id, charge_end - interval '1 hour', charge_end,
  80, 30, 'release-acceptance-energy', 'latest-charge' from energy_context;

insert into drives (vehicle_id, start_time, end_time, distance_km,
  duration_seconds, consumed_energy_kwh, energy_is_estimated,
  start_lat, start_lon, end_lat, end_lon, start_address, end_address, source, source_id)
select c.primary_vehicle_id, c.charge_end + start_minutes * interval '1 minute',
  c.charge_end + end_minutes * interval '1 minute', distance,
  (end_minutes - start_minutes) * 60, energy, estimated,
  47.1, 8.1, 47.2, 8.2, 'Synthetic energy start', 'Synthetic energy destination',
  'release-acceptance-energy', 'since-charge-' || n
from energy_context c cross join (values
  (0, 10, 30, 12.0, 2.4, false),
  (1, 45, 65, 18.0, 3.6, true),
  (2, -5, 5, 999.0, 99.9, false)
) d(n, start_minutes, end_minutes, distance, energy, estimated);

insert into route_points (drive_id, ts, lat, lon)
select id, start_time, start_lat, start_lon from drives where source = 'release-acceptance-energy'
union all
select id, end_time, end_lat, end_lon from drives where source = 'release-acceptance-energy';

do $$
begin
  if (select count(*) from charge_sessions where source = 'release-acceptance-energy') <> 12 then
    raise exception 'Incomplete energy fixture';
  end if;
  if (select source_id from charge_sessions where vehicle_id = (select primary_vehicle_id from energy_context)
      and end_time <= now() order by end_time desc, id desc limit 1) <> 'latest-charge' then
    raise exception 'Since-charge fixture must supply the latest completed boundary';
  end if;
end $$;

select json_build_object('vehicleId', vehicle_id, 'emptyVehicleId', empty_vehicle_id,
  'month', to_char(latest_month, 'YYYY-MM')) from energy_context;
commit;
