begin;

alter table public.transactions
  add column updated_by uuid references public.profiles (id) on delete restrict;

-- Preserve existing updated_at cursors while backfilling the best-known actor.
alter table public.transactions disable trigger transactions_set_timestamps;
update public.transactions
set updated_by = created_by
where updated_by is null;
alter table public.transactions enable trigger transactions_set_timestamps;

alter table public.transactions
  alter column updated_by set not null;

create or replace function private.set_transaction_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'transaction change requires an authenticated actor'
      using errcode = '42501';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke execute on function private.set_transaction_audit_fields()
  from public, anon, authenticated;

drop trigger if exists transactions_set_audit_fields on public.transactions;
create trigger transactions_set_audit_fields
  before insert or update on public.transactions
  for each row execute function private.set_transaction_audit_fields();

drop policy if exists recurring_expenses_insert_owner on public.recurring_expenses;
create policy recurring_expenses_insert_owner on public.recurring_expenses
  for insert to authenticated
  with check (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  );

drop policy if exists recurring_expenses_update_owner on public.recurring_expenses;
create policy recurring_expenses_update_owner on public.recurring_expenses
  for update to authenticated
  using (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  )
  with check (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  );

drop policy if exists recurring_expenses_delete_owner on public.recurring_expenses;
create policy recurring_expenses_delete_owner on public.recurring_expenses
  for delete to authenticated
  using (
    private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
  );

revoke insert, update, delete on public.recurring_expenses from authenticated;

commit;
