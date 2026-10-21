-- Accept independent album classification while preserving historical readers, account ownership and CAS.
alter table public.library_snapshots drop constraint library_snapshots_schema_version_check;
alter table public.library_snapshots add constraint library_snapshots_schema_version_check check (schema_version in (3, 4, 5));

create or replace function auditorium_private.save_library_snapshot(
  account_id uuid, expected_revision bigint, operation_id uuid, document jsonb, schema_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_row public.library_snapshots;
begin
  if caller is null or account_id is distinct from caller or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 or operation_id is null
    or document is null or schema_version is null or schema_version not in (3, 4, 5)
    or jsonb_typeof(document) is distinct from 'object'
    or not (document ?& array['identity', 'catalog', 'library'])
    or octet_length(document::text) > 20971520 then
    raise exception 'Invalid library document' using errcode = '22023';
  end if;
  if schema_version = 3 and exists (
    select 1 from jsonb_array_elements(document #> '{library,userAlbums}') as entry
    where entry ?| array['links', 'preferredPlaybackLinkId']
  ) then
    raise exception 'Personal links require schema version 4' using errcode = '22023';
  end if;
  if schema_version < 5 and exists (
    select 1 from jsonb_array_elements(document #> '{catalog,albums}') as album
    where album ?| array['primaryType', 'categories', 'publicationStatus']
  ) then
    raise exception 'Album classification requires schema version 5' using errcode = '22023';
  end if;
  if schema_version = 5 and exists (
    select 1 from jsonb_array_elements(document #> '{catalog,albums}') as album
    where album ? 'releaseType'
      or not (album ?& array['primaryType', 'categories', 'publicationStatus'])
      or album->>'primaryType' not in ('unspecified', 'full_length', 'ep', 'single', 'other')
      or album->>'publicationStatus' not in ('unknown', 'published', 'unreleased')
      or jsonb_typeof(album->'primaryType') is distinct from 'string'
      or jsonb_typeof(album->'publicationStatus') is distinct from 'string'
      or jsonb_typeof(album->'categories') is distinct from 'array'
      or case when jsonb_typeof(album->'categories') = 'array' then
        jsonb_array_length(album->'categories') > 5 or exists (
          select 1 from jsonb_array_elements(album->'categories') as category
          where jsonb_typeof(category) is distinct from 'string'
            or category #>> '{}' not in ('demo', 'split', 'compilation', 'live', 'soundtrack')
        ) or (select count(*) <> count(distinct category) from jsonb_array_elements(album->'categories') as category)
        else true end
  ) then
    raise exception 'Invalid album classification' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.library_snapshots(owner_id, revision, schema_version, snapshot, last_operation_id)
      values (caller, 1, schema_version, document, operation_id)
      on conflict (owner_id) do nothing returning * into current_row;
    if found then
      return jsonb_build_object('revision', current_row.revision, 'snapshot', current_row.snapshot);
    end if;
  end if;
  select * into current_row from public.library_snapshots where owner_id = caller for update;
  if current_row.schema_version > schema_version then
    raise exception 'Update Auditorium before syncing this library' using errcode = '22023';
  end if;
  if found and current_row.last_operation_id = operation_id and current_row.snapshot = document then
    return jsonb_build_object('revision', current_row.revision, 'snapshot', current_row.snapshot);
  end if;
  if current_row.owner_id is null or current_row.revision <> expected_revision then
    raise exception 'Library revision conflict' using errcode = '40001';
  end if;
  update public.library_snapshots set revision = current_row.revision + 1,
    schema_version = $5, snapshot = document, last_operation_id = operation_id, updated_at = now()
    where owner_id = caller returning * into current_row;
  return jsonb_build_object('revision', current_row.revision, 'snapshot', current_row.snapshot);
end;
$$;
revoke all on function auditorium_private.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) from public, anon;
grant execute on function auditorium_private.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) to authenticated;
