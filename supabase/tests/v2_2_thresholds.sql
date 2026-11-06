-- SQL Editor test for a Supabase TEST project only.
-- Replace the workspace, owner, and member UUIDs with existing test fixtures.
-- All inserted threshold rows are rolled back at the end.

select
  count(*) as total_thresholds,
  count(*) filter (
    where period = 'month' and category_id is not null and month is not null and enabled
  ) as active_monthly_category_thresholds,
  count(*) filter (
    where (period = 'month' and month is null)
       or (period in ('day', 'week') and (category_id is not null or month is not null))
  ) as invalid_period_scopes
from public.budgets;

begin;

select set_config('app.v2_2_workspace_id', '00000000-0000-4000-8000-000000000001', true);
select set_config('app.v2_2_owner_id', '00000000-0000-4000-8000-000000000002', true);
select set_config('app.v2_2_member_id', '00000000-0000-4000-8000-000000000003', true);

do $$
declare
  v_workspace uuid := current_setting('app.v2_2_workspace_id')::uuid;
  v_owner uuid := current_setting('app.v2_2_owner_id')::uuid;
  v_member uuid := current_setting('app.v2_2_member_id')::uuid;
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
  if exists (
    select 1
    from public.budgets
    where workspace_id = v_workspace
      and (
        period in ('day', 'week')
        or (period = 'month' and category_id is null and month = '2099-12-01')
      )
  ) then
    raise exception 'Fixture error: use a workspace without these global threshold rows';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.v2_2_owner_id'), true);

insert into public.budgets (
  id, workspace_id, category_id, month, period, enabled, limit_amount
) values
  (
    '00000000-0000-4000-8000-000000000021',
    current_setting('app.v2_2_workspace_id')::uuid,
    null, null, 'day', false, 5000
  ),
  (
    '00000000-0000-4000-8000-000000000022',
    current_setting('app.v2_2_workspace_id')::uuid,
    null, null, 'week', false, 20000
  ),
  (
    '00000000-0000-4000-8000-000000000023',
    current_setting('app.v2_2_workspace_id')::uuid,
    null, '2099-12-01', 'month', true, 50000
  );

do $$
declare
  v_workspace uuid := current_setting('app.v2_2_workspace_id')::uuid;
  v_daily_enabled boolean;
  v_weekly_amount bigint;
  v_monthly_period text;
  v_duplicate_rejected boolean := false;
begin
  select enabled into v_daily_enabled from public.budgets
  where workspace_id = v_workspace and period = 'day';
  select limit_amount into v_weekly_amount from public.budgets
  where workspace_id = v_workspace and period = 'week';
  select period into v_monthly_period from public.budgets
  where workspace_id = v_workspace
    and period = 'month'
    and category_id is null
    and month = '2099-12-01';

  if v_daily_enabled is distinct from false
    or v_weekly_amount is distinct from 20000
    or v_monthly_period is distinct from 'month'
  then
    raise exception 'FAIL: global threshold rows were not saved as expected';
  end if;
  raise notice 'PASS: owner can create disabled daily/weekly and monthly global thresholds';

  begin
    insert into public.budgets (
      id, workspace_id, category_id, month, period, enabled, limit_amount
    ) values (
      '00000000-0000-4000-8000-000000000024',
      v_workspace, null, null, 'day', true, 6000
    );
  exception when unique_violation then
    v_duplicate_rejected := true;
  end;
  if not v_duplicate_rejected then
    raise exception 'FAIL: duplicate daily threshold was accepted';
  end if;
  raise notice 'PASS: one global threshold per period is enforced';
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.v2_2_member_id'), true);

do $$
declare
  v_workspace uuid := current_setting('app.v2_2_workspace_id')::uuid;
  v_rejected boolean := false;
begin
  begin
    insert into public.budgets (
      id, workspace_id, category_id, month, period, enabled, limit_amount
    ) values (
      '00000000-0000-4000-8000-000000000025',
      v_workspace, null, null, 'day', true, 7000
    );
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FAIL: member created a global threshold';
  end if;
  raise notice 'PASS: member cannot create global thresholds';
end;
$$;

reset role;
rollback;
