begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.transaction_kind as enum ('expense', 'income', 'transfer');

-- IDs on client-written rows are supplied by clients so writes work offline.
alter table public.profiles add column deleted_at timestamptz;

create or replace function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.lock_workspace_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.lock_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'id cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.lock_transaction_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed';
  end if;
  return new;
end;
$$;

create table public.invitations (
  id          uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role        public.member_role not null check (role <> 'owner'),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  max_uses    integer default 1 check (max_uses is null or max_uses > 0),
  used_count  integer not null default 0 check (used_count >= 0),
  revoked_at  timestamptz,
  created_by  uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  check (max_uses is null or used_count <= max_uses)
);

create index invitations_workspace_id_idx on public.invitations (workspace_id);

create table public.accounts (
  id              uuid primary key,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  type            text not null check (length(btrim(type)) between 1 and 40),
  initial_balance bigint not null default 0,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (workspace_id, id)
);

create table public.categories (
  id           uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  kind         public.transaction_kind not null check (kind in ('expense', 'income')),
  icon         text,
  color        text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (workspace_id, id),
  unique (workspace_id, id, kind)
);

create table public.transactions (
  id             uuid primary key,
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  account_id     uuid not null,
  to_account_id  uuid,
  category_id    uuid,
  kind           public.transaction_kind not null,
  amount         bigint not null check (amount > 0),
  occurred_on    date not null,
  note           text,
  created_by     uuid not null references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id) on delete restrict,
  foreign key (workspace_id, to_account_id)
    references public.accounts (workspace_id, id) on delete restrict,
  foreign key (workspace_id, category_id, kind)
    references public.categories (workspace_id, id, kind) on delete restrict,
  check (
    (kind = 'transfer'
      and to_account_id is not null
      and to_account_id <> account_id
      and category_id is null)
    or
    (kind in ('expense', 'income')
      and to_account_id is null
      and category_id is not null)
  )
);

create index transactions_workspace_occurred_idx
  on public.transactions (workspace_id, occurred_on desc);
create index transactions_account_id_idx on public.transactions (workspace_id, account_id);
create index transactions_category_id_idx on public.transactions (workspace_id, category_id);

create table public.budgets (
  id           uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  category_id  uuid not null,
  month        date not null check (extract(day from month) = 1),
  limit_amount bigint not null check (limit_amount > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (workspace_id, category_id, month),
  foreign key (workspace_id, category_id)
    references public.categories (workspace_id, id) on delete restrict
);

create or replace function private.ensure_expense_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.categories c
    where c.workspace_id = new.workspace_id
      and c.id = new.category_id
      and c.kind = 'expense'
  ) then
    raise exception 'budgets require an expense category';
  end if;
  return new;
end;
$$;

create or replace function private.protect_budget_category_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind and exists (
    select 1
    from public.budgets b
    where b.workspace_id = old.workspace_id
      and b.category_id = old.id
  ) then
    raise exception 'category kind cannot change while budgets exist';
  end if;
  return new;
end;
$$;

create trigger budgets_require_expense_category
  before insert or update of workspace_id, category_id on public.budgets
  for each row execute function private.ensure_expense_budget_category();
create trigger categories_protect_budget_kind
  before update of kind on public.categories
  for each row execute function private.protect_budget_category_kind();

create trigger invitations_set_timestamps
  before insert or update on public.invitations
  for each row execute function private.set_timestamps();
create trigger accounts_set_timestamps
  before insert or update on public.accounts
  for each row execute function private.set_timestamps();
create trigger categories_set_timestamps
  before insert or update on public.categories
  for each row execute function private.set_timestamps();
create trigger transactions_set_timestamps
  before insert or update on public.transactions
  for each row execute function private.set_timestamps();
create trigger budgets_set_timestamps
  before insert or update on public.budgets
  for each row execute function private.set_timestamps();

create trigger invitations_lock_workspace_id
  before update on public.invitations
  for each row execute function private.lock_workspace_id();
create trigger accounts_lock_workspace_id
  before update on public.accounts
  for each row execute function private.lock_workspace_id();
create trigger categories_lock_workspace_id
  before update on public.categories
  for each row execute function private.lock_workspace_id();
create trigger transactions_lock_workspace_id
  before update on public.transactions
  for each row execute function private.lock_workspace_id();
create trigger budgets_lock_workspace_id
  before update on public.budgets
  for each row execute function private.lock_workspace_id();
create trigger transactions_lock_author
  before update on public.transactions
  for each row execute function private.lock_transaction_author();

-- An invitation can only be revoked; its token, role and usage stay immutable.
create or replace function private.lock_invitation_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.token_hash is distinct from old.token_hash
    or new.role is distinct from old.role
    or new.expires_at is distinct from old.expires_at
    or new.max_uses is distinct from old.max_uses
    or new.created_by is distinct from old.created_by
    or new.deleted_at is distinct from old.deleted_at
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
  then
    raise exception 'invitation fields cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.prepare_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.used_count := 0;
  new.revoked_at := null;
  new.deleted_at := null;
  return new;
end;
$$;

create trigger invitations_prepare
  before insert on public.invitations
  for each row execute function private.prepare_invitation();
create trigger invitations_lock_fields
  before update on public.invitations
  for each row execute function private.lock_invitation_fields();

create trigger invitations_lock_id
  before update on public.invitations
  for each row execute function private.lock_id();
create trigger accounts_lock_id
  before update on public.accounts
  for each row execute function private.lock_id();
create trigger categories_lock_id
  before update on public.categories
  for each row execute function private.lock_id();
create trigger transactions_lock_id
  before update on public.transactions
  for each row execute function private.lock_id();
create trigger budgets_lock_id
  before update on public.budgets
  for each row execute function private.lock_id();

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null
    or p_token is null
    or octet_length(convert_to(p_token, 'UTF8')) < 32
  then
    raise exception using errcode = 'P0001', message = 'invalid_invitation';
  end if;

  select i.*
    into invitation
    from public.invitations i
    where i.token_hash = encode(
      extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'),
      'hex'
    )
    for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'invalid_invitation';
  end if;

  if exists (
    select 1
      from public.memberships m
      where m.workspace_id = invitation.workspace_id
        and m.user_id = current_user_id
  ) then
    return invitation.workspace_id;
  end if;

  if invitation.revoked_at is not null
    or invitation.deleted_at is not null
    or invitation.expires_at <= now()
    or (invitation.max_uses is not null and invitation.used_count >= invitation.max_uses)
  then
    raise exception using errcode = 'P0001', message = 'invitation_unavailable';
  end if;

  insert into public.memberships (workspace_id, user_id, role)
  values (invitation.workspace_id, current_user_id, invitation.role);

  update public.invitations
    set used_count = used_count + 1
    where id = invitation.id;

  return invitation.workspace_id;
end;
$$;

revoke execute on function private.set_timestamps() from public, anon, authenticated;
revoke execute on function private.lock_workspace_id() from public, anon, authenticated;
revoke execute on function private.lock_id() from public, anon, authenticated;
revoke execute on function private.lock_transaction_author() from public, anon, authenticated;
revoke execute on function private.ensure_expense_budget_category() from public, anon, authenticated;
revoke execute on function private.protect_budget_category_kind() from public, anon, authenticated;
revoke execute on function private.lock_invitation_fields() from public, anon, authenticated;
revoke execute on function private.prepare_invitation() from public, anon, authenticated;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

revoke all on public.invitations, public.accounts, public.categories,
  public.transactions, public.budgets from anon, authenticated;
grant select, insert, update on public.accounts, public.categories,
  public.transactions, public.budgets to authenticated;
grant select, insert on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;
grant usage on type public.transaction_kind to authenticated;

alter table public.invitations enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

create policy invitations_select_owner on public.invitations
  for select to authenticated
  using (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]));
create policy invitations_insert_owner on public.invitations
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and role <> 'owner'
    and private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  );
create policy invitations_revoke_owner on public.invitations
  for update to authenticated
  using (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    and revoked_at is null
  )
  with check (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    and revoked_at is not null
  );

create policy accounts_select_member on public.accounts
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy accounts_insert_writer on public.accounts
  for insert to authenticated
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));
create policy accounts_update_writer on public.accounts
  for update to authenticated
  using (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ))
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));

create policy categories_select_member on public.categories
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy categories_insert_writer on public.categories
  for insert to authenticated
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));
create policy categories_update_writer on public.categories
  for update to authenticated
  using (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ))
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));

create policy transactions_select_member on public.transactions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy transactions_insert_writer on public.transactions
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_workspace_role(
      workspace_id, array['owner', 'member']::public.member_role[]
    )
  );
create policy transactions_update_writer on public.transactions
  for update to authenticated
  using (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ))
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));

create policy budgets_select_member on public.budgets
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy budgets_insert_writer on public.budgets
  for insert to authenticated
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));
create policy budgets_update_writer on public.budgets
  for update to authenticated
  using (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ))
  with check (private.has_workspace_role(
    workspace_id, array['owner', 'member']::public.member_role[]
  ));

commit;
