-- SQL Editor test for a Supabase TEST project only.
-- Replace the five UUIDs below with a workspace, its owner/member, and one transaction
-- authored by each user. The whole script rolls back its test updates.

begin;

select set_config('app.v2_workspace_id', '00000000-0000-4000-8000-000000000001', true);
select set_config('app.v2_owner_id', '00000000-0000-4000-8000-000000000002', true);
select set_config('app.v2_member_id', '00000000-0000-4000-8000-000000000003', true);
select set_config('app.v2_owner_transaction_id', '00000000-0000-4000-8000-000000000004', true);
select set_config('app.v2_member_transaction_id', '00000000-0000-4000-8000-000000000005', true);

do $$
declare
  v_workspace uuid := current_setting('app.v2_workspace_id')::uuid;
  v_owner uuid := current_setting('app.v2_owner_id')::uuid;
  v_member uuid := current_setting('app.v2_member_id')::uuid;
  v_owner_transaction uuid := current_setting('app.v2_owner_transaction_id')::uuid;
  v_member_transaction uuid := current_setting('app.v2_member_transaction_id')::uuid;
begin
  if not exists (
    select 1 from public.memberships
    where workspace_id = v_workspace and user_id = v_owner and role = 'owner'
  ) then
    raise exception 'Fixture error: owner membership not found';
  end if;
  if not exists (
    select 1 from public.memberships
    where workspace_id = v_workspace and user_id = v_member and role = 'member'
  ) then
    raise exception 'Fixture error: member membership not found';
  end if;
  if not exists (
    select 1 from public.transactions
    where id = v_owner_transaction and workspace_id = v_workspace and created_by = v_owner
  ) then
    raise exception 'Fixture error: owner-authored transaction not found';
  end if;
  if not exists (
    select 1 from public.transactions
    where id = v_member_transaction and workspace_id = v_workspace and created_by = v_member
  ) then
    raise exception 'Fixture error: member-authored transaction not found';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('app.v2_member_id'),
  true
);

do $$
declare
  v_workspace uuid := current_setting('app.v2_workspace_id')::uuid;
  v_owner_transaction uuid := current_setting('app.v2_owner_transaction_id')::uuid;
  v_member_transaction uuid := current_setting('app.v2_member_transaction_id')::uuid;
  v_rows integer;
  v_updated_by uuid;
  v_updated_at timestamptz;
  v_rejected boolean := false;
begin
  update public.transactions
  set note = coalesce(note, '') || ' [denied]'
  where id = v_owner_transaction and workspace_id = v_workspace;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL: member updated the owner transaction';
  end if;
  raise notice 'PASS: member cannot update owner transaction';

  update public.transactions
  set updated_by = current_setting('app.v2_owner_id')::uuid,
      updated_at = '2000-01-01T00:00:00Z'
  where id = v_member_transaction and workspace_id = v_workspace;
  select updated_by, updated_at into v_updated_by, v_updated_at
  from public.transactions where id = v_member_transaction;
  if v_updated_by <> current_setting('app.v2_member_id')::uuid
    or v_updated_at = '2000-01-01T00:00:00Z'::timestamptz
  then
    raise exception 'FAIL: server did not replace updated_by/updated_at';
  end if;
  raise notice 'PASS: server supplies updated_by and updated_at for member update';

  begin
    update public.transactions
    set created_by = current_setting('app.v2_owner_id')::uuid
    where id = v_member_transaction and workspace_id = v_workspace;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'created_by cannot be changed' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: member changed created_by';
  end if;
  raise notice 'PASS: member cannot change created_by';
end;
$$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('app.v2_owner_id'),
  true
);

do $$
declare
  v_workspace uuid := current_setting('app.v2_workspace_id')::uuid;
  v_member_transaction uuid := current_setting('app.v2_member_transaction_id')::uuid;
  v_rejected boolean := false;
begin
  update public.transactions
  set amount = case when amount > 0 then amount + 1 else amount - 1 end
  where id = v_member_transaction and workspace_id = v_workspace;
  if not found then
    raise exception 'FAIL: owner could not update member transaction';
  end if;
  if (select updated_by from public.transactions where id = v_member_transaction)
    <> current_setting('app.v2_owner_id')::uuid
  then
    raise exception 'FAIL: owner update was not attributed to the owner';
  end if;
  raise notice 'PASS: owner can update a member transaction and is recorded as updater';

  begin
    update public.transactions
    set created_by = current_setting('app.v2_owner_id')::uuid
    where id = v_member_transaction and workspace_id = v_workspace;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'created_by cannot be changed' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: owner changed created_by';
  end if;
  raise notice 'PASS: owner cannot change created_by';

  v_rejected := false;
  begin
    update public.transactions
    set workspace_id = '00000000-0000-4000-8000-000000000099'::uuid
    where id = v_member_transaction;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'workspace_id cannot be changed' then
      raise;
    end if;
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: owner changed workspace_id';
  end if;
  raise notice 'PASS: owner cannot change workspace_id';
end;
$$;

reset role;
rollback;
