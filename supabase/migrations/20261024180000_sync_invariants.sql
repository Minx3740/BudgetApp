begin;

create or replace function private.set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.clock_timestamp();
  else
    new.created_at := old.created_at;
    if old.deleted_at is not null then
      new.deleted_at := old.deleted_at;
    end if;
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create or replace function public.sync_server_time()
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  select pg_catalog.clock_timestamp();
$$;

revoke all on function public.sync_server_time() from public, anon;
grant execute on function public.sync_server_time() to authenticated;

commit;
