begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

select has_table(
  'public',
  'recurring_expenses',
  'recurring expense schedules are stored'
);
select has_column(
  'public',
  'recurring_expenses',
  'version',
  'recurring expenses have optimistic versions'
);
select has_column(
  'public',
  'transactions',
  'recurring_id',
  'transactions identify their recurring schedule'
);
select has_column(
  'public',
  'transactions',
  'recurring_month',
  'transactions identify their recurring month'
);
select has_index(
  'public',
  'transactions',
  'transactions_recurring_occurrence_uidx',
  'a recurring occurrence can only be stored once'
);
select has_function(
  'public',
  'generate_recurring_for_month',
  array['uuid', 'date'],
  'members can invoke recurring generation'
);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'r5-owner@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'r5-viewer@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'r5-outsider@example.test');

insert into public.workspaces (id, name, type, owner_id)
values (
  '51000000-0000-0000-0000-000000000001',
  'R5 partagé',
  'shared',
  '50000000-0000-0000-0000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values (
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  'viewer'
);

insert into public.categories (id, workspace_id, name, kind)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'Logement',
  'expense'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.create_recurring_expense(
      '51000000-0000-0000-0000-000000000001',
      'Loyer',
      120000,
      '52000000-0000-0000-0000-000000000001',
      5,
      (date_trunc('month', current_date)::date - interval '2 months')::date
    )$$,
  'the owner can create a recurring expense'
);
select is(
  (
    select count(*)::integer
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
      and label = 'Loyer'
  ),
  1,
  'the created recurring expense is readable'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.create_recurring_expense(
      '51000000-0000-0000-0000-000000000001',
      'Transport',
      5000,
      null,
      1,
      date_trunc('month', current_date)::date
    )$$,
  '42501',
  null,
  'a viewer cannot create recurring expenses'
);
select is(
  (
    select count(*)::integer
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
  ),
  1,
  'a workspace member can read recurring expenses'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000003', true);
select is(
  (
    select count(*)::integer
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
  ),
  0,
  'a non-member cannot read recurring expenses'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    date_trunc('month', current_date)::date
  ),
  3,
  'a viewer can generate all missing months through the current month'
);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    date_trunc('month', current_date)::date
  ),
  0,
  'generation is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.transactions t
    join public.recurring_expenses r on r.id = t.recurring_id
    where r.label = 'Loyer'
  ),
  3,
  'the schedule creates one transaction for each covered month'
);
select is(
  (
    select count(*)::integer
    from public.transactions
    where recurring_month > date_trunc('month', current_date)::date
  ),
  0,
  'generation never creates a future month'
);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    (date_trunc('month', current_date)::date + interval '1 month')::date
  ),
  0,
  'a request for a future month is capped at the current month'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
update public.transactions
set deleted_at = now()
where recurring_id = (
    select id
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
      and label = 'Loyer'
  )
  and recurring_month = (
    date_trunc('month', current_date)::date - interval '1 month'
  )::date;

select is(
  (
    select count(*)::integer
    from public.transactions
    where recurring_id = (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer'
      )
      and recurring_month = (
        date_trunc('month', current_date)::date - interval '1 month'
      )::date
      and deleted_at is not null
  ),
  1,
  'a generated occurrence can be soft-deleted'
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    date_trunc('month', current_date)::date
  ),
  0,
  'a deleted occurrence is not regenerated'
);
select is(
  (
    select count(*)::integer
    from public.transactions
    where recurring_id = (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer'
      )
      and recurring_month = (
        date_trunc('month', current_date)::date - interval '1 month'
      )::date
      and deleted_at is not null
  ),
  1,
  'the deleted occurrence remains as a tombstone'
);

select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$insert into public.recurring_expenses (
      series_id, workspace_id, label, amount, day_of_month, start_month, created_by
    ) values (
      '53000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      'Direct write',
      1000,
      1,
      date_trunc('month', current_date)::date,
      '50000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  null,
  'recurring schedules can only be written through controlled functions'
);
select throws_ok(
  $$select public.replace_recurring_expense_from_month(
      (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer'
      ),
      99,
      date_trunc('month', current_date)::date,
      'Loyer modifié',
      130000,
      '52000000-0000-0000-0000-000000000001',
      6
    )$$,
  '40001',
  'Ce forfait a été modifié, recharge la page',
  'stale recurring expense versions are rejected'
);
select lives_ok(
  $$select public.replace_recurring_expense_from_month(
      (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer'
      ),
      1,
      date_trunc('month', current_date)::date,
      'Loyer révisé',
      130000,
      '52000000-0000-0000-0000-000000000001',
      6
    )$$,
  'the owner can split a recurring expense from a month'
);
select is(
  (
    select end_month
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
      and label = 'Loyer'
  ),
  (date_trunc('month', current_date)::date - interval '1 month')::date,
  'the previous schedule ends before the effective month'
);
select is(
  (
    select count(*)::integer
    from public.recurring_expenses previous
    join public.recurring_expenses replacement
      on replacement.series_id = previous.series_id
    where previous.workspace_id = '51000000-0000-0000-0000-000000000001'
      and previous.label = 'Loyer'
      and replacement.label = 'Loyer révisé'
      and replacement.start_month = date_trunc('month', current_date)::date
      and replacement.amount = 130000
      and replacement.version = 1
  ),
  1,
  'the replacement keeps its series and begins with version one'
);
select is(
  (
    select count(*)::integer
    from public.transactions t
    join public.recurring_expenses r on r.id = t.recurring_id
    where r.label = 'Loyer révisé'
      and t.recurring_month = date_trunc('month', current_date)::date
      and t.amount = 130000
      and t.deleted_at is null
  ),
  1,
  'the effective month occurrence is updated instead of duplicated'
);
select is(
  (
    select count(*)::integer
    from public.transactions t
    join public.recurring_expenses r on r.id = t.recurring_id
    where r.label = 'Loyer'
      and t.recurring_month = (
        date_trunc('month', current_date)::date - interval '1 month'
      )::date
      and t.deleted_at is not null
  ),
  1,
  'the deleted past occurrence stays attached to its original schedule'
);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    date_trunc('month', current_date)::date
  ),
  0,
  'generation after a split does not duplicate the effective month'
);
select throws_ok(
  $$select public.stop_recurring_expense(
      (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer révisé'
      ),
      1
    )$$,
  '42501',
  null,
  'a viewer cannot stop a recurring expense'
);
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.stop_recurring_expense(
      (
        select id
        from public.recurring_expenses
        where workspace_id = '51000000-0000-0000-0000-000000000001'
          and label = 'Loyer révisé'
      ),
      1
    )$$,
  'the owner can stop a recurring expense'
);
select is(
  (
    select end_month
    from public.recurring_expenses
    where workspace_id = '51000000-0000-0000-0000-000000000001'
      and label = 'Loyer révisé'
  ),
  (date_trunc('month', current_date)::date - interval '1 month')::date,
  'stopping prevents generation in the current and following months'
);
select is(
  public.generate_recurring_for_month(
    '51000000-0000-0000-0000-000000000001',
    date_trunc('month', current_date)::date
  ),
  0,
  'stopped schedules do not generate more occurrences'
);
select throws_ok(
  $$select public.generate_recurring_for_month(
      '51000000-0000-0000-0000-000000000003',
      date_trunc('month', current_date)::date
    )$$,
  '42501',
  null,
  'a non-member cannot generate recurring expenses'
);

select * from finish();
rollback;
