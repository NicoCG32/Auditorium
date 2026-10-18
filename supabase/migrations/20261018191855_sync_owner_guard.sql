-- Bind every write to the account that initiated it, including during sign-out.
drop function public.save_library_snapshot(bigint, uuid, jsonb, integer);
drop function auditorium_private.save_library_snapshot(bigint, uuid, jsonb, integer);

-- Definer is confined to a non-exposed schema: clients cannot bypass CAS by
-- writing the table directly. Ownership is derived from the validated JWT.
create function auditorium_private.save_library_snapshot(
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
    or document is null or schema_version is distinct from 3
    or jsonb_typeof(document) is distinct from 'object'
    or not (document ?& array['identity', 'catalog', 'library'])
    or octet_length(document::text) > 20971520 then
    raise exception 'Invalid library document' using errcode = '22023';
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
  if found and current_row.last_operation_id = operation_id and current_row.snapshot = document then
    return jsonb_build_object('revision', current_row.revision, 'snapshot', current_row.snapshot);
  end if;
  if current_row.owner_id is null or current_row.revision <> expected_revision then
    raise exception 'Library revision conflict' using errcode = '40001';
  end if;
  update public.library_snapshots set revision = current_row.revision + 1,
    snapshot = document, last_operation_id = operation_id, updated_at = now()
    where owner_id = caller returning * into current_row;
  return jsonb_build_object('revision', current_row.revision, 'snapshot', current_row.snapshot);
end;
$$;
revoke all on function auditorium_private.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) from public, anon;
grant execute on function auditorium_private.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) to authenticated;

create function public.save_library_snapshot(
  account_id uuid, expected_revision bigint, operation_id uuid, document jsonb, schema_version integer
) returns jsonb language sql security invoker set search_path = '' as $$
  select auditorium_private.save_library_snapshot(account_id, expected_revision, operation_id, document, schema_version);
$$;
revoke all on function public.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) from public, anon;
grant execute on function public.save_library_snapshot(uuid, bigint, uuid, jsonb, integer) to authenticated;
