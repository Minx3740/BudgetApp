begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'member@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'outsider@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'invitee@example.test');

select is(
  (select count(*)::integer
   from public.workspaces
   where owner_id = '10000000-0000-0000-0000-000000000001'
     and type = 'personal'
     and name = 'Perso'),
  1,
  'new users receive a personal workspace'
);
select ok(to_regclass('public.accounts') is null, 'accounts table was removed');
select ok(to_regclass('public.legacy_transfers') is null, 'no transfer archive is created');
select is(
  (select count(*)::integer
   from public.workspaces w
   join public.categories c on c.workspace_id = w.id
   where w.owner_id = '10000000-0000-0000-0000-000000000001'
     and w.type = 'personal'
     and c.kind = 'expense'),
  6,
  'new users receive default expense categories'
);

insert into public.workspaces (id, name, type, owner_id)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'Test partagé',
    'shared',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Autre espace',
    'shared',
    '10000000-0000-0000-0000-000000000003'
  );

insert into public.memberships (workspace_id, user_id, role)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  'viewer'
);

insert into public.categories (id, workspace_id, name, kind)
values
  (
    '35000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Alimentation',
    'expense'
  ),
  (
    '35000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Alimentation',
    'expense'
  );

insert into public.transactions (
  id, workspace_id, category_id, kind, amount, occurred_on, note, created_by, paid_by
)
values (
  '36000000-0000-0000-0000-000000000010',
  '20000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000001',
  'expense',
  100,
  current_date,
  'owner transaction',
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

insert into public.monthly_budgets (
  id, workspace_id, month, budget_amount
)
values (
  '37000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  date_trunc('month', current_date)::date,
  0
);

insert into public.month_carry_decisions (
  id, workspace_id, month, accepted
)
values (
  '38000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  date_trunc('month', current_date)::date,
  false
);

insert into public.invitations (
  id, workspace_id, token_hash, role, expires_at, revoked_at, created_by
)
values
  (
    '39000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('valid-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() + interval '7 days',
    null,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '39000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('expired-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() - interval '1 minute',
    null,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '39000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('revoked-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() + interval '7 days',
    now(),
    '10000000-0000-0000-0000-000000000001'
  );

update public.invitations
set revoked_at = now()
where id = '39000000-0000-0000-0000-000000000003';

select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, category_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '35000000-0000-0000-0000-000000000001',
      'expense',
      0,
      current_date,
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  null,
  'transaction amount must be positive'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, category_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '35000000-0000-0000-0000-000000000002',
      'expense',
      100,
      current_date,
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )$$,
  'P0001',
  null,
  'a transaction cannot reference a category from another workspace'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      'transfer',
      100,
      current_date,
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '22P02',
  null,
  'transfers are no longer a transaction kind'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001',
      'adjustment',
      0,
      current_date,
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  null,
  'adjustments must be nonzero'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.transactions
   where id = '36000000-0000-0000-0000-000000000010'),
  1,
  'owner can read workspace transactions'
);
select lives_ok(
  $$update public.monthly_budgets set budget_amount = 1000
    where id = '37000000-0000-0000-0000-000000000001'$$,
  'owner can update the global monthly budget'
);
select lives_ok(
  $$update public.month_carry_decisions set accepted = true
    where id = '38000000-0000-0000-0000-000000000001'$$,
  'owner can decide the monthly carry'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.transactions
   where id = '36000000-0000-0000-0000-000000000010'),
  1,
  'member can read workspace transactions'
);
select is(
  (select budget_amount::integer from public.monthly_budgets
   where id = '37000000-0000-0000-0000-000000000001'),
  1000,
  'member can read the global monthly budget'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000011',
      '20000000-0000-0000-0000-000000000001',
      'expense',
      100,
      current_date,
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002'
    )$$,
  '42501',
  null,
  'viewer cannot add transactions'
);
update public.transactions
set note = 'tampered'
where id = '36000000-0000-0000-0000-000000000010';
select is(
  (select note from public.transactions
   where id = '36000000-0000-0000-0000-000000000010'),
  'owner transaction',
  'viewer cannot edit another user’s transaction'
);
select throws_ok(
  $$insert into public.monthly_budgets (
      id, workspace_id, month, budget_amount
    ) values (
      '37000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      date_trunc('month', current_date)::date + interval '1 month',
      500
    )$$,
  '42501',
  null,
  'viewer cannot change the global monthly budget'
);
select throws_ok(
  $$insert into public.month_carry_decisions (
      id, workspace_id, month, accepted
    ) values (
      '38000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      date_trunc('month', current_date)::date + interval '1 month',
      true
    )$$,
  '42501',
  null,
  'viewer cannot decide the monthly carry'
);
update public.memberships
set role = 'member'
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
select is(
  (select role::text from public.memberships
   where workspace_id = '20000000-0000-0000-0000-000000000001'
     and user_id = '10000000-0000-0000-0000-000000000002'),
  'viewer',
  'viewer cannot change their own role'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
update public.memberships
set role = 'member'
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
select is(
  (select role::text from public.memberships
   where workspace_id = '20000000-0000-0000-0000-000000000001'
     and user_id = '10000000-0000-0000-0000-000000000002'),
  'member',
  'owner can change a member role'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$insert into public.transactions (
      id, workspace_id, kind, amount, occurred_on, created_by, paid_by
    ) values (
      '36000000-0000-0000-0000-000000000012',
      '20000000-0000-0000-0000-000000000001',
      'expense',
      200,
      current_date,
      '10000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002'
    )$$,
  'member can add an uncategorized expense'
);
select lives_ok(
  $$update public.transactions set note = 'member updated own'
    where id = '36000000-0000-0000-0000-000000000012'$$,
  'member can edit their own transaction'
);
update public.transactions
set note = 'member tampered'
where id = '36000000-0000-0000-0000-000000000010';
select is(
  (select note from public.transactions
   where id = '36000000-0000-0000-0000-000000000010'),
  'owner transaction',
  'member cannot edit another user’s transaction'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.workspaces
   where id = '20000000-0000-0000-0000-000000000001'),
  0,
  'a user outside the workspace cannot read it'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(
  public.accept_invitation('valid-invitation-token-32-bytes!'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'a valid invitation adds the user to the workspace'
);
select is(
  public.accept_invitation('valid-invitation-token-32-bytes!'),
  '20000000-0000-0000-0000-000000000001'::uuid,
  'retrying acceptance for a joined user is idempotent'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.accept_invitation('valid-invitation-token-32-bytes!')$$,
  'P0001',
  'invitation_unavailable',
  'a single-use invitation cannot add a second user'
);
select throws_ok(
  $$select public.accept_invitation('expired-invitation-token-32-bytes!')$$,
  'P0001',
  'invitation_unavailable',
  'an expired invitation is rejected'
);
select throws_ok(
  $$select public.accept_invitation('revoked-invitation-token-32-bytes!')$$,
  'P0001',
  'invitation_unavailable',
  'a revoked invitation is rejected'
);

reset role;
delete from public.transactions
where id = '36000000-0000-0000-0000-000000000012';
delete from public.memberships
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.transactions
   where id = '36000000-0000-0000-0000-000000000010'),
  0,
  'a removed member loses access to workspace transactions'
);

reset role;
select * from finish();
rollback;
