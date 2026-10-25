begin;

delete from public.transactions;
delete from public.budgets;

create type public.category_kind as enum ('expense', 'income');
alter table public.categories drop constraint if exists categories_kind_check;
alter table public.transactions
  drop constraint if exists transactions_workspace_id_account_id_fkey,
  drop constraint if exists transactions_workspace_id_to_account_id_fkey,
  drop constraint if exists transactions_workspace_id_category_id_kind_fkey,
  drop constraint if exists transactions_amount_check,
  drop constraint if exists transactions_check;

drop trigger if exists categories_protect_budget_kind on public.categories;
alter table public.categories
  alter column kind type public.category_kind using kind::text::public.category_kind;
create trigger categories_protect_budget_kind
  before update of kind on public.categories
  for each row execute function private.protect_budget_category_kind();
drop trigger if exists accounts_set_timestamps on public.accounts;
drop trigger if exists accounts_lock_workspace_id on public.accounts;
drop trigger if exists accounts_lock_id on public.accounts;
drop trigger if exists transactions_set_timestamps on public.transactions;
drop trigger if exists transactions_lock_workspace_id on public.transactions;
drop trigger if exists transactions_lock_author on public.transactions;
drop trigger if exists transactions_lock_id on public.transactions;
drop index if exists public.transactions_account_id_idx;

create type public.cashflow_transaction_kind as enum (
  'expense', 'refund', 'income', 'adjustment'
);

alter table public.transactions
  alter column kind type public.cashflow_transaction_kind
    using kind::text::public.cashflow_transaction_kind,
  drop column account_id,
  drop column to_account_id,
  add column paid_by uuid not null
    references public.profiles (id) on delete restrict,
  add constraint transactions_paid_by_member_fkey
    foreign key (workspace_id, paid_by)
    references public.memberships (workspace_id, user_id) on delete restrict,
  add constraint transactions_amount_kind_check check (
    amount between -9007199254740991 and 9007199254740991
    and (
      (kind = 'adjustment' and amount <> 0)
      or (kind <> 'adjustment' and amount > 0)
    )
  ),
  add constraint transactions_category_kind_check check (
    (kind = 'adjustment' and category_id is null)
    or (kind = 'income' and category_id is not null)
    or kind in ('expense', 'refund')
  ),
  add constraint transactions_category_workspace_fkey
    foreign key (workspace_id, category_id)
    references public.categories (workspace_id, id) on delete restrict;

drop type public.transaction_kind;
drop table public.accounts;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid := pg_catalog.gen_random_uuid();
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1),
      ''
    )
  );
  insert into public.workspaces (id, name, type, owner_id)
  values (new_workspace_id, 'Perso', 'personal', new.id);
  insert into public.categories (id, workspace_id, name, kind, icon, color)
  values
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Alimentation', 'expense', 'shopping-basket', '#e07a5f'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Transport', 'expense', 'bus', '#3d8b8b'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Logement', 'expense', 'house', '#6c63a8'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Santé', 'expense', 'heart-pulse', '#d45d79'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Loisirs', 'expense', 'sparkles', '#d29b35'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Autres dépenses', 'expense', 'ellipsis', '#718096'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Salaire', 'income', 'briefcase', '#3f8f67'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Autres revenus', 'income', 'circle-plus', '#4b83b5');
  return new;
end;
$$;

create table public.monthly_budgets (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  budget_amount bigint not null
    check (budget_amount between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, month)
);

create table public.month_carry_decisions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  accepted boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workspace_id, month)
);

alter table public.budgets
  drop constraint if exists budgets_limit_amount_check,
  add constraint budgets_limit_amount_check
    check (limit_amount between 0 and 9007199254740991);

create or replace function private.validate_cashflow_category()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  category_kind text;
begin
  if new.category_id is null then
    return new;
  end if;

  select c.kind::text into category_kind
  from public.categories c
  where c.workspace_id = new.workspace_id and c.id = new.category_id;

  if category_kind is null
    or (new.kind in ('expense', 'refund') and category_kind <> 'expense')
    or (new.kind = 'income' and category_kind <> 'income')
  then
    raise exception 'transaction category does not match its kind';
  end if;
  return new;
end;
$$;

create trigger transactions_validate_cashflow_category
  before insert or update of workspace_id, category_id, kind on public.transactions
  for each row execute function private.validate_cashflow_category();
create trigger transactions_set_timestamps
  before insert or update on public.transactions
  for each row execute function private.set_timestamps();
create trigger transactions_lock_workspace_id
  before update on public.transactions
  for each row execute function private.lock_workspace_id();
create trigger transactions_lock_author
  before update on public.transactions
  for each row execute function private.lock_transaction_author();
create trigger transactions_lock_id
  before update on public.transactions
  for each row execute function private.lock_id();
create trigger monthly_budgets_set_timestamps
  before insert or update on public.monthly_budgets
  for each row execute function private.set_timestamps();
create trigger month_carry_decisions_set_timestamps
  before insert or update on public.month_carry_decisions
  for each row execute function private.set_timestamps();
create trigger monthly_budgets_lock_workspace_id
  before update on public.monthly_budgets
  for each row execute function private.lock_workspace_id();
create trigger monthly_budgets_lock_id
  before update on public.monthly_budgets
  for each row execute function private.lock_id();
create trigger month_carry_decisions_lock_workspace_id
  before update on public.month_carry_decisions
  for each row execute function private.lock_workspace_id();
create trigger month_carry_decisions_lock_id
  before update on public.month_carry_decisions
  for each row execute function private.lock_id();

revoke execute on function private.validate_cashflow_category()
  from public, anon, authenticated;

revoke all on public.monthly_budgets, public.month_carry_decisions from anon, authenticated;
grant select, insert, update on public.monthly_budgets,
  public.month_carry_decisions to authenticated;
grant usage on type public.cashflow_transaction_kind to authenticated;

alter table public.monthly_budgets enable row level security;
alter table public.month_carry_decisions enable row level security;

create policy monthly_budgets_select_member on public.monthly_budgets
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy monthly_budgets_write_owner on public.monthly_budgets
  for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]))
  with check (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]));
create policy month_carry_decisions_select_member on public.month_carry_decisions
  for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy month_carry_decisions_write_owner on public.month_carry_decisions
  for all to authenticated
  using (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]))
  with check (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]));

drop policy if exists budgets_insert_writer on public.budgets;
drop policy if exists budgets_update_writer on public.budgets;
create policy budgets_insert_owner on public.budgets
  for insert to authenticated
  with check (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]));
create policy budgets_update_owner on public.budgets
  for update to authenticated
  using (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]))
  with check (private.has_workspace_role(workspace_id, array['owner']::public.member_role[]));

drop policy if exists memberships_update_role_owner on public.memberships;
create policy memberships_update_role_owner on public.memberships
  for update to authenticated
  using (
    role <> 'owner'
    and private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  )
  with check (
    role <> 'owner'
    and private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  );

drop policy if exists transactions_update_writer on public.transactions;
create policy transactions_update_author_or_owner on public.transactions
  for update to authenticated
  using (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    or (created_by = (select auth.uid())
        and private.has_workspace_role(workspace_id, array['member']::public.member_role[]))
  )
  with check (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    or (created_by = (select auth.uid())
        and private.has_workspace_role(workspace_id, array['member']::public.member_role[]))
  );

commit;
