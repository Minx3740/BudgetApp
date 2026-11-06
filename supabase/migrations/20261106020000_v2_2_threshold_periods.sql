begin;

alter table public.budgets
  add column period text not null default 'month',
  add column enabled boolean not null default true,
  alter column category_id drop not null,
  alter column month drop not null,
  drop constraint if exists budgets_month_check,
  add constraint budgets_month_check
    check (month is null or extract(day from month) = 1),
  add constraint budgets_period_check
    check (period in ('day', 'week', 'month')),
  add constraint budgets_period_scope_check
    check (
      (period = 'month' and month is not null)
      or (period in ('day', 'week') and category_id is null and month is null)
    );

alter table public.budgets
  drop constraint if exists budgets_workspace_id_category_id_month_key;

create unique index budgets_monthly_category_unique
  on public.budgets (workspace_id, category_id, month)
  where period = 'month' and category_id is not null;
create unique index budgets_monthly_global_unique
  on public.budgets (workspace_id, month)
  where period = 'month' and category_id is null;
create unique index budgets_global_period_unique
  on public.budgets (workspace_id, period)
  where period in ('day', 'week');

create or replace function private.ensure_expense_budget_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is null then
    return new;
  end if;

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

revoke execute on function private.ensure_expense_budget_category()
  from public, anon, authenticated;

commit;
