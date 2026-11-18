-- Run as migration owner after all migrations. Fictional accounts roll back.
begin;
do $$
declare
  account_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  source_reference jsonb := '{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-11-15T12:00:00.000Z"}';
  document jsonb := '{"identity":{"userId":"00000000-0000-4000-8000-000000000001","createdAt":"2026-01-01T00:00:00.000Z"},"catalog":{"artists":[],"albums":[],"albumArtists":[],"tracks":[],"coreTracks":[],"releases":[],"releaseTracks":[]},"library":{"userAlbums":[],"albumRatings":[],"albumGenreRatings":[],"trackRatings":[],"ownedItems":[],"purchaseWishes":[]}}';
  invalid_document jsonb;
  invalid_reference jsonb;
  result jsonb;
begin
  insert into auth.users(id, email, aud, role, email_confirmed_at) values (account_id, account_id::text || '@example.invalid', 'authenticated', 'authenticated', now());
  document := jsonb_set(document, '{catalog,artists}', jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-000000001000', 'name', 'Grupo ficticio', 'musicBrainz', source_reference)));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  result := public.save_library_snapshot(account_id, 0, operation_id, document, 8);
  if (result->>'revision')::integer <> 1 or result #> '{snapshot,catalog,artists,0,musicBrainz}' is distinct from source_reference then raise exception 'Source reference was not preserved'; end if;
  result := public.save_library_snapshot(account_id, 0, operation_id, document, 8);
  if (result->>'revision')::integer <> 1 then raise exception 'Retry duplicated the write'; end if;
  for invalid_reference in select value from jsonb_array_elements('[{"id":"invalid","retrievedAt":"2026-11-15T12:00:00.000Z"},{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-02-30T12:00:00.000Z"},{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-11-15T12:00:00.000Z","extra":true},null]') loop
    invalid_document := jsonb_set(document, '{catalog,artists,0,musicBrainz}', invalid_reference);
    begin
      perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 8);
      raise exception 'Invalid source reference was accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  invalid_document := jsonb_set(document, '{catalog,artists}', (document #> '{catalog,artists}') || jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-000000001001', 'name', 'Otro grupo ficticio', 'musicBrainz', source_reference)));
  begin
    perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 8);
    raise exception 'Duplicate source identity was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), document, 7);
    raise exception 'Version 7 accepted a version 8 field';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), document #- '{catalog,artists,0,musicBrainz}', 7);
    raise exception 'Downgrade after version 8 was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(account_id, 0, gen_random_uuid(), document, 8);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  if (select revision from public.library_snapshots where owner_id = account_id) <> 1 then raise exception 'Rejected changes modified the library'; end if;
  execute 'reset role';
end;
$$;
rollback;
select 'MusicBrainz references, strict timestamps, uniqueness, idempotency, downgrade guard and CAS: PASS; fictional data rolled back' as validation;
