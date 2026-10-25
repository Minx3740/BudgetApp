begin;

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

drop trigger if exists recurring_expenses_set_timestamps on public.recurring_expenses;
create trigger recurring_expenses_set_timestamps
  before insert or update on public.recurring_expenses
  for each row execute function private.set_recurring_expense_timestamps();

commit;
