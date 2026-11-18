-- Run as migration owner after all migrations. Fictional accounts roll back.
begin;
do $$
declare
  account_id uuid := gen_random_uuid();
  operation_id uuid := gen_random_uuid();
  source_reference jsonb := '{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-11-16T12:00:00.000Z"}';
  document jsonb := '{"identity":{"userId":"00000000-0000-4000-8000-000000000001","createdAt":"2026-01-01T00:00:00.000Z"},"catalog":{"artists":[],"albums":[],"albumArtists":[],"tracks":[],"coreTracks":[],"releases":[],"releaseTracks":[]},"library":{"userAlbums":[],"albumRatings":[],"albumGenreRatings":[],"trackRatings":[],"ownedItems":[],"purchaseWishes":[]}}';
  invalid_document jsonb;
  invalid_reference jsonb;
  collection_name text;
  result jsonb;
begin
  insert into auth.users(id, email, aud, role, email_confirmed_at) values (account_id, account_id::text || '@example.invalid', 'authenticated', 'authenticated', now());
  document := jsonb_set(document, '{catalog,releases}', jsonb_build_array(jsonb_build_object('id', '00000000-0000-4000-8000-000000002000', 'albumId', '00000000-0000-4000-8000-000000001000', 'format', 'cd', 'musicBrainz', source_reference)));
  -- One recording may appear on two distinct local albums.
  document := jsonb_set(document, '{catalog,tracks}', jsonb_build_array(
    jsonb_build_object('id', '00000000-0000-4000-8000-000000003000', 'albumId', '00000000-0000-4000-8000-000000001000', 'title', 'Pista ficticia', 'musicBrainz', source_reference),
    jsonb_build_object('id', '00000000-0000-4000-8000-000000003001', 'albumId', '00000000-0000-4000-8000-000000001001', 'title', 'Pista ficticia en otro álbum', 'musicBrainz', source_reference)
  ));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  result := public.save_library_snapshot(account_id, 0, operation_id, document, 9);
  if (result->>'revision')::integer <> 1 or result->'snapshot' is distinct from document then raise exception 'Edition or recording metadata changed'; end if;
  result := public.save_library_snapshot(account_id, 0, operation_id, document, 9);
  if (result->>'revision')::integer <> 1 then raise exception 'Retry duplicated the write'; end if;
  foreach collection_name in array array['releases', 'tracks'] loop
    for invalid_reference in select value from jsonb_array_elements('[{"id":"invalid","retrievedAt":"2026-11-16T12:00:00.000Z"},{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-02-30T12:00:00.000Z"},{"id":"00000000-0000-4000-8000-000000009000","retrievedAt":"2026-11-16T12:00:00.000Z","extra":true},null]') loop
      invalid_document := jsonb_set(document, array['catalog', collection_name, '0', 'musicBrainz'], invalid_reference);
      begin
        perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 9);
        raise exception 'Invalid edition or recording identity was accepted';
      exception when invalid_parameter_value then null;
      end;
    end loop;
    invalid_document := jsonb_set(document, array['catalog', collection_name], (document #> array['catalog', collection_name]) || jsonb_build_array((document #> array['catalog', collection_name, '0']) || '{"id":"00000000-0000-4000-8000-000000003002"}'));
    begin
      perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 9);
      raise exception 'Duplicate edition or recording in the same album was accepted';
    exception when invalid_parameter_value then null;
    end;
    -- Strip the other new field so both collections are checked independently.
    invalid_document := jsonb_set(document, array['catalog', case when collection_name = 'tracks' then 'releases' else 'tracks' end], '[]');
    begin
      perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 8);
      raise exception 'Version 8 accepted a version 9 field';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  foreach invalid_document in array array[
    document #- '{catalog,tracks,0,albumId}',
    jsonb_set(document, '{catalog,tracks,0,albumId}', '"invalid"'),
    document #- '{catalog,tracks}'
  ] loop
    begin
      perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), invalid_document, 9);
      raise exception 'Invalid recording collection was accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.save_library_snapshot(account_id, 1, gen_random_uuid(), jsonb_set(jsonb_set(document, '{catalog,tracks}', '[]'), '{catalog,releases}', '[]'), 8);
    raise exception 'Downgrade after version 9 was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(account_id, 0, gen_random_uuid(), document, 9);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_library_snapshot(gen_random_uuid(), 1, gen_random_uuid(), document, 9);
    raise exception 'Different account was accepted';
  exception when insufficient_privilege then null;
  end;
  if (select revision from public.library_snapshots where owner_id = account_id) <> 1 then raise exception 'Rejected changes modified the library'; end if;
  execute 'reset role';
end;
$$;
rollback;
select 'Edition and recording references, per-album identity, strict versions, CAS and ownership: PASS; fictional data rolled back' as validation;
