-- Public catalog metadata only. No library data, queries, IPs or user identities.
create table auditorium_private.musicbrainz_gate (
  singleton boolean primary key default true check (singleton),
  active_id uuid,
  lease_until timestamptz not null default '-infinity',
  next_allowed timestamptz not null default '-infinity'
);
insert into auditorium_private.musicbrainz_gate(singleton) values (true);
create table auditorium_private.musicbrainz_queue (
  request_id uuid primary key,
  added_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '45 seconds'
);
create index musicbrainz_queue_order on auditorium_private.musicbrainz_queue(added_at, request_id);
create table auditorium_private.musicbrainz_cache (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  body text not null check (octet_length(body) <= 2097152 and jsonb_typeof(body::jsonb) = 'object'),
  added_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '6 hours'
);
create index musicbrainz_cache_age on auditorium_private.musicbrainz_cache(added_at, cache_key);
alter table auditorium_private.musicbrainz_gate enable row level security;
alter table auditorium_private.musicbrainz_queue enable row level security;
alter table auditorium_private.musicbrainz_cache enable row level security;
revoke all on auditorium_private.musicbrainz_gate, auditorium_private.musicbrainz_queue, auditorium_private.musicbrainz_cache from public, anon, authenticated;
grant usage on schema auditorium_private to service_role;
grant select, insert, update, delete on auditorium_private.musicbrainz_gate, auditorium_private.musicbrainz_queue, auditorium_private.musicbrainz_cache to service_role;

create function public.musicbrainz_enter(p_request_id uuid, p_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz := clock_timestamp();
  cached text;
  gate auditorium_private.musicbrainz_gate;
  head_id uuid;
begin
  if p_request_id is null or p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid catalog request' using errcode = '22023';
  end if;
  select body into cached from auditorium_private.musicbrainz_cache where cache_key = p_key and expires_at > now_at;
  if found then
    delete from auditorium_private.musicbrainz_queue where request_id = p_request_id;
    return jsonb_build_object('state', 'cached', 'body', cached);
  end if;
  perform pg_advisory_xact_lock(1329641567, 1948326150);
  now_at := clock_timestamp();
  delete from auditorium_private.musicbrainz_queue where expires_at <= now_at;
  select * into strict gate from auditorium_private.musicbrainz_gate where singleton;
  if gate.active_id is not null and gate.lease_until <= now_at then
    delete from auditorium_private.musicbrainz_queue where request_id = gate.active_id;
    update auditorium_private.musicbrainz_gate set active_id = null, lease_until = '-infinity' where singleton;
    gate.active_id := null;
    gate.lease_until := '-infinity';
  end if;
  if not exists (select 1 from auditorium_private.musicbrainz_queue where request_id = p_request_id) then
    if (select count(*) from auditorium_private.musicbrainz_queue) >= 32 then
      return jsonb_build_object('state', 'busy');
    end if;
    insert into auditorium_private.musicbrainz_queue(request_id) values (p_request_id);
  end if;
  select request_id into head_id from auditorium_private.musicbrainz_queue order by added_at, request_id limit 1;
  if gate.lease_until > now_at or gate.next_allowed > now_at or head_id is distinct from p_request_id then
    return jsonb_build_object('state', 'wait', 'retry_ms', case when gate.lease_until > now_at or head_id is distinct from p_request_id then 250 else greatest(50, least(1100, ceil(extract(epoch from (gate.next_allowed - now_at)) * 1000)::integer)) end);
  end if;
  update auditorium_private.musicbrainz_gate set active_id = p_request_id, lease_until = now_at + interval '30 seconds' where singleton;
  return jsonb_build_object('state', 'acquired');
end;
$$;

create function public.musicbrainz_leave(p_request_id uuid, p_key text, p_body text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  gate auditorium_private.musicbrainz_gate;
  now_at timestamptz;
begin
  if p_request_id is null or p_key is null or p_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid catalog request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(1329641567, 1948326150);
  delete from auditorium_private.musicbrainz_queue where request_id = p_request_id;
  select * into strict gate from auditorium_private.musicbrainz_gate where singleton;
  if gate.active_id is distinct from p_request_id then
    return jsonb_build_object('released', false);
  end if;
  now_at := clock_timestamp();
  if p_body is not null and gate.lease_until > now_at then
    insert into auditorium_private.musicbrainz_cache(cache_key, body, added_at, expires_at)
      values (p_key, p_body, now_at, now_at + interval '6 hours')
      on conflict (cache_key) do update set body = excluded.body, added_at = excluded.added_at, expires_at = excluded.expires_at;
    delete from auditorium_private.musicbrainz_cache where expires_at <= now_at;
    -- Bound both the number of responses and their total uncompressed bytes.
    while (select count(*) > 128 or coalesce(sum(octet_length(body)),0) > 16777216 from auditorium_private.musicbrainz_cache) loop
      delete from auditorium_private.musicbrainz_cache where cache_key = (select cache_key from auditorium_private.musicbrainz_cache order by added_at, cache_key limit 1);
    end loop;
  end if;
  update auditorium_private.musicbrainz_gate set active_id = null, lease_until = '-infinity', next_allowed = clock_timestamp() + interval '1100 milliseconds' where singleton;
  return jsonb_build_object('released', true);
end;
$$;
revoke all on function public.musicbrainz_enter(uuid, text), public.musicbrainz_leave(uuid, text, text) from public, anon, authenticated;
grant execute on function public.musicbrainz_enter(uuid, text), public.musicbrainz_leave(uuid, text, text) to service_role;
