-- Execute as the migration owner. All fictional accounts and libraries roll back.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  operation uuid := gen_random_uuid();
  document jsonb := '{"identity":{"userId":"00000000-0000-4000-8000-000000000001","createdAt":"2026-01-01T00:00:00.000Z"},"catalog":{"artists":[],"albums":[],"albumArtists":[],"tracks":[],"coreTracks":[],"releases":[],"releaseTracks":[]},"library":{"userAlbums":[],"albumRatings":[],"trackRatings":[],"ownedItems":[],"purchaseWishes":[]}}';
  result jsonb;
  visible_rows integer;
begin
  insert into auth.users(id, email, aud, role, email_confirmed_at) values
    (a, a::text || '@example.invalid', 'authenticated', 'authenticated', now()),
    (b, b::text || '@example.invalid', 'authenticated', 'authenticated', now());
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  result := public.save_library_snapshot(a, 0, operation, document, 3);
  if (result->>'revision')::integer <> 1 then raise exception 'Initial revision failed'; end if;
  result := public.save_library_snapshot(a, 0, operation, document, 3);
  if (result->>'revision')::integer <> 1 then raise exception 'Idempotent retry failed'; end if;
  begin
    perform public.save_library_snapshot(a, 0, gen_random_uuid(), document, 3);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_library_snapshot(b, 1, gen_random_uuid(), document, 3);
    raise exception 'Foreign account was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.library_snapshots set revision = 99 where owner_id = a;
    raise exception 'Direct write was accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into visible_rows from public.library_snapshots;
  if visible_rows <> 0 then raise exception 'RLS exposed another account'; end if;
  result := public.save_library_snapshot(b, 0, gen_random_uuid(), document, 3);
  select count(*) into visible_rows from public.library_snapshots;
  if visible_rows <> 1 then raise exception 'Own library is inaccessible'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  result := public.save_library_snapshot(a, 1, gen_random_uuid(), document, 3);
  if (result->>'revision')::integer <> 2 then raise exception 'Compare and swap failed'; end if;
  execute 'set local role anon';
  begin
    perform count(*) from public.library_snapshots;
    raise exception 'Anonymous read was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_library_snapshot(a, 2, gen_random_uuid(), document, 3);
    raise exception 'Anonymous write was accepted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$$;
rollback;
select 'RLS, account isolation, CAS, idempotency and denied anonymous/direct writes: PASS; fictional data rolled back' as validation;
