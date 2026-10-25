begin;

create table public.recurring_expenses (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  series_id uuid not null,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 120),
  amount bigint not null check (amount between 1 and 9007199254740991),
  category_id uuid,
  day_of_month smallint not null check (day_of_month between 1 and 28),
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (end_month is null or extract(day from end_month) = 1),
  created_by uuid not null references public.profiles (id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, category_id)
    references public.categories (workspace_id, id) on delete restrict,
  foreign key (workspace_id, created_by)
    references public.memberships (workspace_id, user_id) on delete restrict
);

create index recurring_expenses_workspace_month_idx
  on public.recurring_expenses (workspace_id, start_month, end_month);
create index recurring_expenses_series_idx
  on public.recurring_expenses (workspace_id, series_id, start_month);

alter table public.transactions
  add column recurring_id uuid,
  add column recurring_month date,
  add constraint transactions_recurring_occurrence_check check (
    (recurring_id is null and recurring_month is null)
    or (
      recurring_id is not null
      and recurring_month is not null
      and kind = 'expense'
      and extract(day from recurring_month) = 1
    )
  ),
  add constraint transactions_recurring_expense_fkey
    foreign key (workspace_id, recurring_id)
    references public.recurring_expenses (workspace_id, id) on delete restrict;

create unique index transactions_recurring_occurrence_uidx
  on public.transactions (recurring_id, recurring_month)
  where recurring_id is not null;

create or replace function private.validate_recurring_expense_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and not exists (
    select 1
    from public.categories c
    where c.workspace_id = new.workspace_id
      and c.id = new.category_id
      and c.kind = 'expense'
  ) then
    raise exception 'recurring expenses require an expense category'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.set_recurring_expense_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.clock_timestamp();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke execute on function private.set_recurring_expense_timestamps()
  from public, anon, authenticated;

create trigger recurring_expenses_validate_category
  before insert or update of workspace_id, category_id on public.recurring_expenses
  for each row execute function private.validate_recurring_expense_category();
create trigger recurring_expenses_set_timestamps
  before insert or update on public.recurring_expenses
  for each row execute function private.set_recurring_expense_timestamps();
create trigger recurring_expenses_lock_workspace_id
  before update on public.recurring_expenses
  for each row execute function private.lock_workspace_id();
create trigger recurring_expenses_lock_author
  before update on public.recurring_expenses
  for each row execute function private.lock_transaction_author();
create trigger recurring_expenses_lock_id
  before update on public.recurring_expenses
  for each row execute function private.lock_id();

create or replace function private.validate_recurring_transaction_author()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  schedule_creator uuid;
begin
  if new.recurring_id is null then
    return new;
  end if;

  select recurring.created_by into schedule_creator
  from public.recurring_expenses recurring
  where recurring.id = new.recurring_id
    and recurring.workspace_id = new.workspace_id;

  if schedule_creator is null then
    raise exception 'recurring transaction schedule does not exist'
      using errcode = '23503';
  end if;
  if new.created_by is distinct from schedule_creator
    or new.paid_by is distinct from schedule_creator
  then
    raise exception 'recurring transaction authorship must match schedule creator'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_validate_recurring_author
  before insert or update of recurring_id, workspace_id, created_by, paid_by
  on public.transactions
  for each row execute function private.validate_recurring_transaction_author();

revoke execute on function private.validate_recurring_expense_category()
  from public, anon, authenticated;
revoke execute on function private.validate_recurring_transaction_author()
  from public, anon, authenticated;
revoke all on public.recurring_expenses from public, anon, authenticated;
grant select on public.recurring_expenses to authenticated;

alter table public.recurring_expenses enable row level security;

create policy recurring_expenses_select_member on public.recurring_expenses
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create or replace function public.create_recurring_expense(
  p_workspace_id uuid,
  p_label text,
  p_amount bigint,
  p_category_id uuid,
  p_day_of_month smallint,
  p_start_month date
)
returns public.recurring_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_row public.recurring_expenses;
begin
  if auth.uid() is null
    or not private.has_workspace_role(
      p_workspace_id,
      array['owner']::public.member_role[]
    )
  then
    raise exception 'owner role required to create a recurring expense'
      using errcode = '42501';
  end if;

  insert into public.recurring_expenses (
    series_id,
    workspace_id,
    label,
    amount,
    category_id,
    day_of_month,
    start_month,
    created_by
  )
  values (
    pg_catalog.gen_random_uuid(),
    p_workspace_id,
    p_label,
    p_amount,
    p_category_id,
    p_day_of_month,
    p_start_month,
    auth.uid()
  )
  returning * into created_row;

  return created_row;
end;
$$;

create or replace function public.replace_recurring_expense_from_month(
  p_id uuid,
  p_expected_version integer,
  p_effective_month date,
  p_label text,
  p_amount bigint,
  p_category_id uuid,
  p_day_of_month smallint
)
returns public.recurring_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.recurring_expenses;
  replacement_row public.recurring_expenses;
begin
  select * into current_row
  from public.recurring_expenses
  where id = p_id
  for update;

  if not found then
    raise exception 'recurring expense not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null
    or not private.has_workspace_role(
      current_row.workspace_id,
      array['owner']::public.member_role[]
    )
  then
    raise exception 'owner role required to update a recurring expense'
      using errcode = '42501';
  end if;
  if current_row.version <> p_expected_version then
    raise exception 'Ce forfait a été modifié, recharge la page'
      using errcode = '40001';
  end if;
  if p_effective_month is null
    or extract(day from p_effective_month) <> 1
    or p_effective_month < current_row.start_month
    or (
      current_row.end_month is not null
      and p_effective_month > current_row.end_month
    )
  then
    raise exception 'effective month is outside the recurring expense period'
      using errcode = '22023';
  end if;

  if p_effective_month = current_row.start_month then
    update public.recurring_expenses
    set label = p_label,
        amount = p_amount,
        category_id = p_category_id,
        day_of_month = p_day_of_month,
        version = version + 1
    where id = current_row.id
    returning * into replacement_row;
  else
    update public.recurring_expenses
    set end_month = (p_effective_month - interval '1 month')::date,
        version = version + 1
    where id = current_row.id;

    insert into public.recurring_expenses (
      series_id,
      workspace_id,
      label,
      amount,
      category_id,
      day_of_month,
      start_month,
      created_by
    )
    values (
      current_row.series_id,
      current_row.workspace_id,
      p_label,
      p_amount,
      p_category_id,
      p_day_of_month,
      p_effective_month,
      current_row.created_by
    )
    returning * into replacement_row;

    update public.transactions
    set recurring_id = replacement_row.id,
        category_id = case
          when deleted_at is null then replacement_row.category_id
          else category_id
        end,
        amount = case
          when deleted_at is null then replacement_row.amount
          else amount
        end,
        note = case
          when deleted_at is null then replacement_row.label
          else note
        end
    where recurring_id = current_row.id
      and recurring_month >= p_effective_month;
  end if;

  return replacement_row;
end;
$$;

create or replace function public.stop_recurring_expense(
  p_id uuid,
  p_expected_version integer
)
returns public.recurring_expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.recurring_expenses;
  stopped_row public.recurring_expenses;
  last_month date := (
    pg_catalog.date_trunc('month', current_date)::date - interval '1 month'
  )::date;
begin
  select * into current_row
  from public.recurring_expenses
  where id = p_id
  for update;

  if not found then
    raise exception 'recurring expense not found' using errcode = 'P0002';
  end if;
  if auth.uid() is null
    or not private.has_workspace_role(
      current_row.workspace_id,
      array['owner']::public.member_role[]
    )
  then
    raise exception 'owner role required to stop a recurring expense'
      using errcode = '42501';
  end if;
  if current_row.version <> p_expected_version then
    raise exception 'Ce forfait a été modifié, recharge la page'
      using errcode = '40001';
  end if;

  update public.recurring_expenses
  set end_month = case
        when end_month is null then last_month
        else least(end_month, last_month)
      end,
      version = version + 1
  where id = current_row.id
  returning * into stopped_row;

  return stopped_row;
end;
$$;

create or replace function public.generate_recurring_for_month(
  p_workspace_id uuid,
  p_month date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  through_month date;
  inserted_count integer;
  rows_inserted integer;
  recurring_row public.recurring_expenses;
begin
  if auth.uid() is null
    or not private.is_workspace_member(p_workspace_id)
  then
    raise exception 'workspace membership required to generate recurring expenses'
      using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'month must be the first day of a month'
      using errcode = '22023';
  end if;

  through_month := least(
    p_month,
    pg_catalog.date_trunc('month', current_date)::date
  );

  inserted_count := 0;
  for recurring_row in
    select *
    from public.recurring_expenses
    where workspace_id = p_workspace_id
      and start_month <= through_month
      and (end_month is null or end_month >= start_month)
    order by id
    for update
  loop
    insert into public.transactions (
      id,
      workspace_id,
      category_id,
      kind,
      amount,
      occurred_on,
      note,
      created_by,
      paid_by,
      recurring_id,
      recurring_month
    )
    select
      pg_catalog.gen_random_uuid(),
      recurring_row.workspace_id,
      recurring_row.category_id,
      'expense',
      recurring_row.amount,
      pg_catalog.make_date(
        extract(year from occurrence.month)::integer,
        extract(month from occurrence.month)::integer,
        recurring_row.day_of_month
      ),
      recurring_row.label,
      recurring_row.created_by,
      recurring_row.created_by,
      recurring_row.id,
      occurrence.month::date
    from pg_catalog.generate_series(
      recurring_row.start_month::timestamp,
      least(coalesce(recurring_row.end_month, through_month), through_month)::timestamp,
      interval '1 month'
    ) as occurrence(month)
    on conflict (recurring_id, recurring_month)
      where recurring_id is not null
      do nothing;

    get diagnostics rows_inserted = row_count;
    inserted_count := inserted_count + rows_inserted;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function public.create_recurring_expense(uuid, text, bigint, uuid, smallint, date)
  from public, anon;
revoke all on function public.replace_recurring_expense_from_month(
  uuid, integer, date, text, bigint, uuid, smallint
) from public, anon;
revoke all on function public.stop_recurring_expense(uuid, integer)
  from public, anon;
revoke all on function public.generate_recurring_for_month(uuid, date)
  from public, anon;

grant execute on function public.create_recurring_expense(uuid, text, bigint, uuid, smallint, date)
  to authenticated;
grant execute on function public.replace_recurring_expense_from_month(
  uuid, integer, date, text, bigint, uuid, smallint
) to authenticated;
grant execute on function public.stop_recurring_expense(uuid, integer)
  to authenticated;
grant execute on function public.generate_recurring_for_month(uuid, date)
  to authenticated;

commit;
