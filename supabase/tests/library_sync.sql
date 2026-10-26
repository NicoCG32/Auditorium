-- Execute as the migration owner. All fictional accounts and libraries roll back.
begin;

-- Generated from genreKey() on Node 24.22.1 / Unicode 17.0. These are fictional strings.
-- The normalizer remains private, so parity runs as the migration owner before changing roles.
do $genre_key_parity$
declare
  fixture jsonb;
begin
  for fixture in select value from jsonb_array_elements($fixtures$[{"value":"  M\u00c9TAL   Progresivo  ","expected":"metal progresivo"},{"value":"Stra\u00dfe","expected":"stra\u00dfe"},{"value":"STRASSE","expected":"strasse"},{"value":"\u00c6ther","expected":"\u00e6ther"},{"value":"AETHER","expected":"aether"},{"value":"\u0152UVRE","expected":"\u0153uvre"},{"value":"\u0110OOM","expected":"\u0111oom"},{"value":"\u0141\u00d3D\u0179","expected":"\u0142odz"},{"value":"\u0130NDIE","expected":"indie"},{"value":"\u1e9e","expected":"\u00df"},{"value":"Caf\u00e9","expected":"cafe"},{"value":"Cafe\u0301","expected":"cafe"},{"value":"\u03bf\u03a3","expected":"\u03bf\u03c2"},{"value":"\u039f\u03a3","expected":"\u03bf\u03c2"},{"value":"\u039f\u03a3\u0391","expected":"\u03bf\u03c3\u03b1"},{"value":"\u039f\u03a3\u200d","expected":"\u03bf\u03c2\u200d"},{"value":"\u039f\u03a3\u200d\u0391","expected":"\u03bf\u03c3\u200d\u03b1"},{"value":"\u1d43\u03a3","expected":"\u1d43\u03c3"},{"value":"A\u03a3\u1d43","expected":"a\u03c2\u1d43"},{"value":"\u6771\u4eac","expected":"\u6771\u4eac"},{"value":"\ud55c\uae00","expected":"\u1112\u1161\u11ab\u1100\u1173\u11af"},{"value":"\u13a0\u13a1","expected":"\uab70\uab71"},{"value":"\ud801\udc00\ud801\udc01","expected":"\ud801\udc28\ud801\udc29"},{"value":"\ufeff\tM\u00c9TAL\u00a0\u1680\u2000\u2028\u2029\u202f\u205f\u3000PROGRESIVO\r\n","expected":"metal progresivo"},{"value":"Metal\u0085Rock","expected":"metal\u0085rock"},{"value":"Metal\u200bRock","expected":"metal\u200brock"},{"value":"a\u1ab0\u1dc0\u20d0\ufe20","expected":"a"},{"value":"a\ud834\udd65\ud838\udc00","expected":"a"},{"value":"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00","expected":"\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00"}]$fixtures$::jsonb) loop
    if auditorium_private.album_genre_key(fixture->>'value') is distinct from fixture->>'expected' then
      raise exception 'Genre normalizer differs from JavaScript for %', fixture->>'value';
    end if;
  end loop;
end;
$genre_key_parity$;

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  operation uuid := gen_random_uuid();
  document jsonb := '{"identity":{"userId":"00000000-0000-4000-8000-000000000001","createdAt":"2026-01-01T00:00:00.000Z"},"catalog":{"artists":[],"albums":[],"albumArtists":[],"tracks":[],"coreTracks":[],"releases":[],"releaseTracks":[]},"library":{"userAlbums":[],"albumRatings":[],"trackRatings":[],"ownedItems":[],"purchaseWishes":[]}}';
  result jsonb;
  visible_rows integer;
  invalid_case jsonb;
  valid_genre_rating jsonb;
  invalid_document jsonb;
  expected_version integer;
  notes text := 'Contexto ficticio: albumGenreRatings, referenceReleaseId y scoreUnits son parte de esta nota, no de su estructura.';
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
  operation := gen_random_uuid();
  result := public.save_library_snapshot(a, 2, operation, document, 4);
  if (result->>'revision')::integer <> 3 then raise exception 'Version 4 upgrade failed'; end if;
  if (select schema_version from public.library_snapshots where owner_id = a) <> 4 then raise exception 'Stored version did not upgrade'; end if;
  result := public.save_library_snapshot(a, 2, operation, document, 4);
  if (result->>'revision')::integer <> 3 then raise exception 'Version 4 idempotency failed'; end if;
  begin
    perform public.save_library_snapshot(a, 3, gen_random_uuid(), document, 3);
    raise exception 'Schema downgrade was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 3, gen_random_uuid(), document, 8);
    raise exception 'Unknown schema was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 3, gen_random_uuid(), jsonb_set(document, '{library,userAlbums}', '[{"links":[]}]'), 3);
    raise exception 'Version 3 accepted link fields';
  exception when invalid_parameter_value then null;
  end;
  if (select revision from public.library_snapshots where owner_id = a) <> 3 then raise exception 'Rejected writes changed the revision'; end if;
  operation := gen_random_uuid();
  document := jsonb_set(document, '{catalog,albums}', '[{"id":"00000000-0000-4000-8000-000000000002","title":"Demo Ficticia","primaryType":"ep","categories":["demo","split"],"publicationStatus":"unreleased"}]');
  result := public.save_library_snapshot(a, 3, operation, document, 5);
  if (result->>'revision')::integer <> 4 then raise exception 'Version 5 upgrade failed'; end if;
  if (select schema_version from public.library_snapshots where owner_id = a) <> 5 then raise exception 'Stored version 5 missing'; end if;
  result := public.save_library_snapshot(a, 3, operation, document, 5);
  if (result->>'revision')::integer <> 4 then raise exception 'Version 5 idempotency failed'; end if;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), document, 4);
    raise exception 'Version 4 accepted classification or downgraded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{catalog,albums,0,primaryType}', '"demo"'), 5);
    raise exception 'Mixed primary type was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{catalog,albums,0,categories}', '["demo","demo"]'), 5);
    raise exception 'Duplicate categories were accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{catalog,albums}', '[{"releaseType":"demo"}]'), 5);
    raise exception 'Version 5 accepted historical album shape';
  exception when invalid_parameter_value then null;
  end;
  if (select revision from public.library_snapshots where owner_id = a) <> 4 then raise exception 'Rejected classifications changed the revision'; end if;
  document := jsonb_set(document, '{library,userAlbums}', '[{"id":"00000000-0000-4000-8000-000000000003","albumId":"00000000-0000-4000-8000-000000000002"}]');
  document := jsonb_set(document, '{catalog,releases}', '[{"id":"00000000-0000-4000-8000-000000000004","albumId":"00000000-0000-4000-8000-000000000002","format":"digital"}]');
  document := jsonb_set(document, '{library,albumRatings}', '[{"userAlbumId":"00000000-0000-4000-8000-000000000003","scoreUnits":19,"updatedAt":"2026-01-01T00:00:00.000Z","referenceReleaseId":"00000000-0000-4000-8000-000000000004"}]');
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), document, 5);
    raise exception 'Historical reader accepted a rating reference';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{library,albumRatings,0,referenceReleaseId}', 'null'), 6);
    raise exception 'Null reference accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{library,albumRatings,0,referenceReleaseId}', '"missing"'), 6);
    raise exception 'Invalid reference accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{catalog,releases,0,albumId}', '"00000000-0000-4000-8000-000000000099"'), 6);
    raise exception 'Foreign album reference accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 4, gen_random_uuid(), jsonb_set(document, '{catalog,releases}', '[]'), 6);
    raise exception 'Missing edition accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select revision from public.library_snapshots where owner_id = a) <> 4 then raise exception 'Rejected references changed revision'; end if;
  operation := gen_random_uuid();
  result := public.save_library_snapshot(a, 4, operation, document, 6);
  if (result->>'revision')::integer <> 5 then raise exception 'Version 6 upgrade failed'; end if;
  if (select schema_version from public.library_snapshots where owner_id = a) <> 6 then raise exception 'Stored version 6 missing'; end if;
  result := public.save_library_snapshot(a, 4, operation, document, 6);
  if (result->>'revision')::integer <> 5 then raise exception 'Version 6 idempotency failed'; end if;
  begin
    perform public.save_library_snapshot(a, 5, gen_random_uuid(), document #- '{library,albumRatings,0,referenceReleaseId}', 5);
    raise exception 'Version 6 downgraded';
  exception when invalid_parameter_value then null;
  end;
  result := public.save_library_snapshot(a, 5, gen_random_uuid(), document #- '{library,albumRatings,0,referenceReleaseId}', 6);
  if (result #>> '{snapshot,library,albumRatings,0,scoreUnits}')::integer <> 19 then raise exception 'Clearing reference changed score'; end if;
  -- Version 7 owns only the new collection; labels and personal notes retain their data.
  document := jsonb_set(document, '{catalog,albums,0,genres}', jsonb_build_array('MÉTAL　PROGRESIVO', 'Straße', 'Æther', 'ΟΣ', '東京', repeat('😀', 40)));
  document := jsonb_set(document, '{library,userAlbums,0,personalNotes}', to_jsonb(notes));
  document := jsonb_set(document, '{library,userAlbums,0,addedAt}', '"2024-01-01T00:00:00.000Z"');
  document := jsonb_set(document, '{catalog,releases}', (document #> '{catalog,releases}') || '[{"id":"00000000-0000-4000-8000-000000000005","albumId":"00000000-0000-4000-8000-000000000099","format":"digital"}]'::jsonb);
  -- A field name inside a personal note does not require wire version 7.
  result := public.save_library_snapshot(a, 6, gen_random_uuid(), document, 6);
  if result #>> '{snapshot,library,userAlbums,0,personalNotes}' <> notes then raise exception 'Version 6 note context changed'; end if;
  for expected_version in 3..6 loop
    begin
      perform public.save_library_snapshot(a, 7, gen_random_uuid(), jsonb_set(document, '{library,albumGenreRatings}', '[]'), expected_version);
      raise exception 'Historical version % accepted genre collection', expected_version;
    exception when invalid_parameter_value then
      if sqlerrm <> 'Genre ratings require schema version 7' then raise; end if;
    end;
  end loop;
  begin
    perform public.save_library_snapshot(a, 7, gen_random_uuid(), jsonb_set(document, '{library,albumGenreRatings}', '[]'), 6);
    raise exception 'Version 6 accepted genre collection';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 7, gen_random_uuid(), document, 7);
    raise exception 'Version 7 accepted missing genre collection';
  exception when invalid_parameter_value then null;
  end;
  for invalid_case in select value from jsonb_array_elements('[null, {}, "ratings"]'::jsonb) loop
    begin
      perform public.save_library_snapshot(a, 7, gen_random_uuid(), jsonb_set(document, '{library,albumGenreRatings}', invalid_case), 7);
      raise exception 'Version 7 accepted invalid genre collection';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  document := jsonb_set(document, '{library,albumGenreRatings}', '[]');
  result := public.save_library_snapshot(a, 7, gen_random_uuid(), document, 7);
  if (result->>'revision')::integer <> 8 then raise exception 'Version 7 empty genre collection failed'; end if;
  if (select schema_version from public.library_snapshots where owner_id = a) <> 7 then raise exception 'Stored version 7 missing'; end if;
  -- The general rating reference must remain validated in every version >= 6.
  begin
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), jsonb_set(document, '{library,albumRatings,0,referenceReleaseId}', '"00000000-0000-4000-8000-000000000005"'), 7);
    raise exception 'Version 7 accepted foreign general rating reference';
  exception when invalid_parameter_value then null;
  end;
  valid_genre_rating := '{"userAlbumId":"00000000-0000-4000-8000-000000000003","genreKey":"metal progresivo","scoreUnits":20,"updatedAt":"2026-01-01T00:00:00.000Z","referenceReleaseId":"00000000-0000-4000-8000-000000000004"}';
  for invalid_case in select value from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('name', 'scalar', 'rating', 'null'::jsonb),
      jsonb_build_object('name', 'array', 'rating', '[]'::jsonb),
      jsonb_build_object('name', 'missing owner', 'rating', valid_genre_rating - 'userAlbumId'),
      jsonb_build_object('name', 'invalid owner', 'rating', jsonb_set(valid_genre_rating, '{userAlbumId}', '"missing"')),
      jsonb_build_object('name', 'missing user album', 'rating', jsonb_set(valid_genre_rating, '{userAlbumId}', '"00000000-0000-4000-8000-000000000099"')),
      jsonb_build_object('name', 'missing genre', 'rating', valid_genre_rating - 'genreKey'),
      jsonb_build_object('name', 'null genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', 'null')),
      jsonb_build_object('name', 'empty genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '""')),
      jsonb_build_object('name', 'uppercase genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"Metal progresivo"')),
      jsonb_build_object('name', 'accented genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"métal progresivo"')),
      jsonb_build_object('name', 'space padded genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '" metal progresivo"')),
      jsonb_build_object('name', 'double space genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"metal  progresivo"')),
      jsonb_build_object('name', 'unassigned genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"jazz"')),
      jsonb_build_object('name', 'unaccent sharp s expansion', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"strasse"')),
      jsonb_build_object('name', 'unaccent ligature expansion', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', '"aether"')),
      jsonb_build_object('name', 'overlong genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', to_jsonb(repeat('a', 81)))),
      jsonb_build_object('name', 'overlong UTF16 genre', 'rating', jsonb_set(valid_genre_rating, '{genreKey}', to_jsonb(repeat('😀', 41)))),
      jsonb_build_object('name', 'missing score', 'rating', valid_genre_rating - 'scoreUnits'),
      jsonb_build_object('name', 'null score', 'rating', jsonb_set(valid_genre_rating, '{scoreUnits}', 'null')),
      jsonb_build_object('name', 'string score', 'rating', jsonb_set(valid_genre_rating, '{scoreUnits}', '"20"')),
      jsonb_build_object('name', 'fractional score', 'rating', jsonb_set(valid_genre_rating, '{scoreUnits}', '2.5')),
      jsonb_build_object('name', 'score below range', 'rating', jsonb_set(valid_genre_rating, '{scoreUnits}', '1')),
      jsonb_build_object('name', 'score above range', 'rating', jsonb_set(valid_genre_rating, '{scoreUnits}', '21')),
      jsonb_build_object('name', 'missing timestamp', 'rating', valid_genre_rating - 'updatedAt'),
      jsonb_build_object('name', 'null timestamp', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', 'null')),
      jsonb_build_object('name', 'invalid timestamp', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"tomorrow"')),
      jsonb_build_object('name', 'calendar-invalid timestamp', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"2026-02-30T00:00:00.000Z"')),
      jsonb_build_object('name', 'nota antes del alta', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"2023-12-31T23:59:59.999Z"')),
      jsonb_build_object('name', 'non UTC timestamp', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"2026-01-01T00:00:00.000+01:00"')),
      jsonb_build_object('name', 'timestamp without milliseconds', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"2026-01-01T00:00:00Z"')),
      jsonb_build_object('name', 'timestamp 24 hours', 'rating', jsonb_set(valid_genre_rating, '{updatedAt}', '"2026-01-01T24:00:00.000Z"')),
      jsonb_build_object('name', 'null reference', 'rating', jsonb_set(valid_genre_rating, '{referenceReleaseId}', 'null')),
      jsonb_build_object('name', 'invalid reference', 'rating', jsonb_set(valid_genre_rating, '{referenceReleaseId}', '"missing"')),
      jsonb_build_object('name', 'missing edition', 'rating', jsonb_set(valid_genre_rating, '{referenceReleaseId}', '"00000000-0000-4000-8000-000000000099"')),
      jsonb_build_object('name', 'foreign album edition', 'rating', jsonb_set(valid_genre_rating, '{referenceReleaseId}', '"00000000-0000-4000-8000-000000000005"')),
      jsonb_build_object('name', 'unknown property', 'rating', valid_genre_rating || '{"personalNotes":"nested field is not part of a rating"}'::jsonb)
  )) loop
    invalid_document := jsonb_set(document, '{library,albumGenreRatings}', jsonb_build_array(invalid_case->'rating'));
    begin
      perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
      raise exception 'Invalid genre rating accepted: %', invalid_case->>'name';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  for invalid_case in select value from jsonb_array_elements('[null, {}, "invalid", "2024-02-30T00:00:00.000Z", "2024-01-01T00:00:00Z", "2024-01-01T00:00:00.000+01:00"]'::jsonb) loop
    invalid_document := jsonb_set(document, '{library,userAlbums,0,addedAt}', invalid_case);
    invalid_document := jsonb_set(invalid_document, '{library,albumGenreRatings}', jsonb_build_array(valid_genre_rating));
    begin
      perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
      raise exception 'Invalid linked entry timestamp accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    invalid_document := document #- '{library,userAlbums,0,addedAt}';
    invalid_document := jsonb_set(invalid_document, '{library,albumGenreRatings}', jsonb_build_array(valid_genre_rating));
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
    raise exception 'Missing linked entry timestamp accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), jsonb_set(document, '{library,albumGenreRatings}', jsonb_build_array(valid_genre_rating, valid_genre_rating)), 7);
    raise exception 'Duplicate album genre pair accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    invalid_document := jsonb_set(document, '{library,userAlbums,0,id}', '"00000000-0000-0000-8000-000000000003"');
    invalid_document := jsonb_set(invalid_document, '{library,albumRatings}', '[]');
    invalid_document := jsonb_set(invalid_document, '{library,albumGenreRatings}', jsonb_build_array(jsonb_set(valid_genre_rating, '{userAlbumId}', '"00000000-0000-0000-8000-000000000003"')));
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
    raise exception 'Non RFC genre owner UUID accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    invalid_document := jsonb_set(document, '{catalog,releases,0,id}', '"00000000-0000-4000-0000-000000000004"');
    invalid_document := jsonb_set(invalid_document, '{library,albumRatings}', '[]');
    invalid_document := jsonb_set(invalid_document, '{library,albumGenreRatings}', jsonb_build_array(jsonb_set(valid_genre_rating, '{referenceReleaseId}', '"00000000-0000-4000-0000-000000000004"')));
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
    raise exception 'Non RFC genre reference UUID accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    invalid_document := jsonb_set(document, '{library,userAlbums,0,personalNotes}', to_jsonb(repeat('x', 20971521)));
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), invalid_document, 7);
    raise exception 'Document over 20 MiB accepted';
  exception when invalid_parameter_value then null;
  end;
  if (select revision from public.library_snapshots where owner_id = a) <> 8 then raise exception 'Rejected genre ratings changed revision'; end if;
  document := jsonb_set(document, '{library,albumGenreRatings}', jsonb_build_array(
    valid_genre_rating,
    '{"userAlbumId":"00000000-0000-4000-8000-000000000003","genreKey":"straße","scoreUnits":2,"updatedAt":"2024-02-29T23:59:59.999Z"}'::jsonb,
    jsonb_build_object('userAlbumId', '00000000-0000-4000-8000-000000000003', 'genreKey', repeat('😀', 40), 'scoreUnits', 2.0, 'updatedAt', '2026-01-01T00:00:00.000Z')
  ));
  operation := gen_random_uuid();
  result := public.save_library_snapshot(a, 8, operation, document, 7);
  if (result->>'revision')::integer <> 9 then raise exception 'Genre rating save failed'; end if;
  if result->'snapshot' is distinct from document then raise exception 'Genre rating save changed unrelated snapshot data'; end if;
  if (result #>> '{snapshot,library,albumRatings,0,scoreUnits}')::integer <> 19 then raise exception 'Genre rating changed general score'; end if;
  if result #>> '{snapshot,library,userAlbums,0,personalNotes}' <> notes then raise exception 'Genre rating changed personal notes'; end if;
  result := public.save_library_snapshot(a, 8, operation, document, 7);
  if (result->>'revision')::integer <> 9 then raise exception 'Version 7 idempotency failed'; end if;
  begin
    perform public.save_library_snapshot(a, 8, operation, jsonb_set(document, '{library,albumGenreRatings,0,scoreUnits}', '18'), 7);
    raise exception 'Version 7 reused operation accepted a different payload';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_library_snapshot(a, 8, gen_random_uuid(), document, 7);
    raise exception 'Version 7 stale revision accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_library_snapshot(b, 9, gen_random_uuid(), document, 7);
    raise exception 'Foreign account genre ratings accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_library_snapshot(a, 9, gen_random_uuid(), document #- '{library,albumGenreRatings}', 6);
    raise exception 'Version 7 downgraded';
  exception when invalid_parameter_value then null;
  end;
  -- Removing the context edition changes only that optional field; removing all rows is independent.
  document := document #- '{library,albumGenreRatings,0,referenceReleaseId}';
  result := public.save_library_snapshot(a, 9, gen_random_uuid(), document, 7);
  if result #> '{snapshot,library,albumGenreRatings,0}' ? 'referenceReleaseId' then raise exception 'Genre context edition was not cleared'; end if;
  if (result #>> '{snapshot,library,albumGenreRatings,0,scoreUnits}')::integer <> 20 then raise exception 'Clearing genre reference changed genre score'; end if;
  document := jsonb_set(document, '{library,albumGenreRatings}', '[]');
  result := public.save_library_snapshot(a, 10, gen_random_uuid(), document, 7);
  if (result->>'revision')::integer <> 11 then raise exception 'Genre rating deletion failed'; end if;
  if (result #>> '{snapshot,library,albumRatings,0,scoreUnits}')::integer <> 19 then raise exception 'Genre deletion changed general score'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into visible_rows from public.library_snapshots where owner_id = a;
  if visible_rows <> 0 then raise exception 'RLS exposed version 7 owner'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform auditorium_private.album_genre_key('Metal');
    raise exception 'Private normalizer exposed to authenticated';
  exception when insufficient_privilege then null;
  end;
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
select 'RLS, account isolation, CAS, idempotency, schema 3/4/5/6/7, classification, general/genre rating references, strict genre ratings, Unicode normalization, notes context, downgrade guard and denied anonymous/direct writes: PASS; fictional data rolled back' as validation;
