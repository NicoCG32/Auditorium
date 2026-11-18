-- Run as migration owner. Public metadata fixtures and simulated clocks roll back.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  fixture_request_id uuid;
  key_a text := repeat('a',64);
  key_b text := repeat('b',64);
  result jsonb;
  i integer;
begin
  if has_function_privilege('anon', 'public.musicbrainz_enter(uuid,text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.musicbrainz_leave(uuid,text,text)', 'EXECUTE') then raise exception 'Catalog coordinator exposed to clients'; end if;
  if has_table_privilege('anon', 'auditorium_private.musicbrainz_cache', 'SELECT') or has_table_privilege('authenticated', 'auditorium_private.musicbrainz_queue', 'INSERT') then raise exception 'Private metadata tables exposed'; end if;
  perform pg_advisory_xact_lock(1329641567, 1948326150);
  execute 'set local role service_role';
  delete from auditorium_private.musicbrainz_cache;
  delete from auditorium_private.musicbrainz_queue;
  update auditorium_private.musicbrainz_gate set active_id=null,lease_until='-infinity',next_allowed='-infinity';
  result := public.musicbrainz_enter(a,key_a);
  if result->>'state' <> 'acquired' then raise exception 'First request did not acquire lease'; end if;
  result := public.musicbrainz_enter(b,key_b);
  if result->>'state' <> 'wait' then raise exception 'Concurrent request bypassed active lease'; end if;
  result := public.musicbrainz_leave(a,key_a,'{"artists":[]}');
  if not (result->>'released')::boolean then raise exception 'Lease did not release'; end if;
  result := public.musicbrainz_enter(c,key_a);
  if result->>'state' <> 'cached' or result->>'body' <> '{"artists":[]}' then raise exception 'Shared cache did not preserve body'; end if;
  result := public.musicbrainz_enter(b,key_b);
  if result->>'state' <> 'wait' or (result->>'retry_ms')::integer <= 0 then raise exception 'Cooldown was bypassed'; end if;
  -- Only fixtures move the clock; production derives every delay in the database.
  update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
  result := public.musicbrainz_enter(b,key_b);
  if result->>'state' <> 'acquired' then raise exception 'Queue did not resume after cooldown'; end if;
  result := public.musicbrainz_leave(a,key_a,'{"stale":true}');
  if (result->>'released')::boolean or (select active_id from auditorium_private.musicbrainz_gate) is distinct from b then raise exception 'Stale owner released another lease'; end if;
  perform public.musicbrainz_leave(b,key_b);
  if exists (select 1 from auditorium_private.musicbrainz_cache where cache_key=key_b) then raise exception 'Failed request filled cache'; end if;
  update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
  perform public.musicbrainz_enter(c,key_b);
  update auditorium_private.musicbrainz_gate set lease_until=clock_timestamp()-interval '1 second';
  result := public.musicbrainz_enter(d,key_b);
  if result->>'state' <> 'acquired' then raise exception 'Expired worker blocked the queue'; end if;
  perform public.musicbrainz_leave(c,key_b);
  if (select active_id from auditorium_private.musicbrainz_gate) is distinct from d then raise exception 'Expired worker released a current lease'; end if;
  begin
    perform public.musicbrainz_leave(d,key_b,'{"invalid":');
    raise exception 'Invalid cache JSON accepted';
  exception when invalid_text_representation then null;
  end;
  if (select active_id from auditorium_private.musicbrainz_gate) is distinct from d then raise exception 'Failed cache write partially released state'; end if;
  perform public.musicbrainz_leave(d,key_b);
  begin
    perform public.musicbrainz_enter(gen_random_uuid(),'invalid-key');
    raise exception 'Invalid cache key accepted';
  exception when invalid_parameter_value then null;
  end;
  delete from auditorium_private.musicbrainz_queue;
  update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
  insert into auditorium_private.musicbrainz_queue(request_id) select gen_random_uuid() from generate_series(1,32);
  result := public.musicbrainz_enter(gen_random_uuid(),key_b);
  if result->>'state' <> 'busy' then raise exception 'Queue bound exceeded'; end if;
  update auditorium_private.musicbrainz_queue set expires_at=clock_timestamp()-interval '1 second' where request_id=(select request_id from auditorium_private.musicbrainz_queue limit 1);
  result := public.musicbrainz_enter(gen_random_uuid(),key_b);
  if result->>'state' <> 'wait' or (select count(*) from auditorium_private.musicbrainz_queue) <> 32 then raise exception 'Expired queue entries did not recover'; end if;
  delete from auditorium_private.musicbrainz_queue;
  delete from auditorium_private.musicbrainz_cache;
  for i in 1..130 loop
    update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
    fixture_request_id := gen_random_uuid();
    perform public.musicbrainz_enter(fixture_request_id, lpad(to_hex(i),64,'0'));
    perform public.musicbrainz_leave(fixture_request_id, lpad(to_hex(i),64,'0'),'{"rows":[]}');
  end loop;
  if (select count(*) from auditorium_private.musicbrainz_cache) <> 128 then raise exception 'Cache row bound failed'; end if;
  for i in 131..139 loop
    update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
    fixture_request_id := gen_random_uuid();
    perform public.musicbrainz_enter(fixture_request_id, lpad(to_hex(i),64,'0'));
    perform public.musicbrainz_leave(fixture_request_id, lpad(to_hex(i),64,'0'),jsonb_build_object('rows',repeat('x',2097100))::text);
  end loop;
  if (select sum(octet_length(body)) from auditorium_private.musicbrainz_cache) > 16777216 then raise exception 'Cache byte bound failed'; end if;
  update auditorium_private.musicbrainz_cache set expires_at=clock_timestamp()-interval '1 second';
  update auditorium_private.musicbrainz_gate set next_allowed='-infinity';
  result := public.musicbrainz_enter(gen_random_uuid(),lpad(to_hex(139),64,'0'));
  if result->>'state' <> 'acquired' then raise exception 'Expired response was returned'; end if;
  execute 'reset role';
end;
$$;
rollback;
select 'Shared catalog lease, cooldown, queue/cache bounds, expiry, rollback and private grants: PASS; fixtures rolled back' as validation;
