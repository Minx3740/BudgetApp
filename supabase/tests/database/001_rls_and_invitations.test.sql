begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'viewer@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'outsider@example.test'),
  ('10000000-0000-0000-0000-000000000004', 'invitee@example.test');

select is(
  (select count(*)::integer
   from public.workspaces w
   join public.accounts a on a.workspace_id = w.id
   where w.owner_id = '10000000-0000-0000-0000-000000000001'
     and w.type = 'personal'
     and w.name = 'Perso'
     and a.type = 'cash'),
  1,
  'new users receive a personal workspace and a default account'
);
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

insert into public.accounts (id, workspace_id, name, type)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Espèces',
    'cash'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Espèces',
    'cash'
  );

insert into public.categories (id, workspace_id, name, kind)
values (
  '35000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'Alimentation',
  'expense'
);

select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, account_id, category_id, kind, amount, occurred_on, created_by
    ) values (
      '36000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '35000000-0000-0000-0000-000000000001',
      'expense',
      0,
      current_date,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  null,
  'transaction amount must be positive'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, account_id, category_id, kind, amount, occurred_on, created_by
    ) values (
      '36000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '35000000-0000-0000-0000-000000000001',
      'expense',
      100,
      current_date,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23503',
  null,
  'a transaction cannot reference an account from another workspace'
);
select throws_ok(
  $$insert into public.transactions (
      id, workspace_id, account_id, to_account_id, kind, amount, occurred_on, created_by
    ) values (
      '36000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'transfer',
      100,
      current_date,
      '10000000-0000-0000-0000-000000000001'
    )$$,
  '23514',
  null,
  'a transfer cannot target its source account'
);

insert into public.invitations (
  id, workspace_id, token_hash, role, expires_at, max_uses, created_by
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('valid-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() + interval '1 day',
    1,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('expired-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() - interval '1 day',
    1,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    encode(extensions.digest(convert_to('revoked-invitation-token-32-bytes!', 'UTF8'), 'sha256'), 'hex'),
    'member',
    now() + interval '1 day',
    1,
    '10000000-0000-0000-0000-000000000001'
  );

update public.invitations
set revoked_at = now()
where id = '40000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.accounts
   where id = '30000000-0000-0000-0000-000000000001'),
  1,
  'owner can read workspace accounts'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.accounts
   where id = '30000000-0000-0000-0000-000000000001'),
  1,
  'viewer can read workspace accounts'
);
select throws_ok(
  $$insert into public.accounts (id, workspace_id, name, type)
    values (
      '30000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001',
      'Interdit',
      'cash'
    )$$,
  '42501',
  null,
  'viewer cannot create workspace accounts'
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
  'owner can change a non-owner member role'
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
delete from public.memberships
where workspace_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*)::integer from public.accounts
   where id = '30000000-0000-0000-0000-000000000001'),
  0,
  'a removed member loses access to workspace data'
);

reset role;
select * from finish();
rollback;
