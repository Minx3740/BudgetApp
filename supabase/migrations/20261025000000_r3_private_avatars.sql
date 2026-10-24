begin;

alter table public.profiles
  add column avatar_path text,
  add constraint profiles_avatar_path_format
    check (
      avatar_path is null
      or avatar_path = id::text || '/avatar.webp'
    );

grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'avatars',
  'avatars',
  false,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_read_same_workspace
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar\.webp$'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or exists (
        select 1
        from public.profiles p
        where p.id::text = split_part(name, '/', 1)
          and private.shares_workspace_with(p.id)
      )
    )
  );

create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
  );

create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
  );

create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
  );

commit;
