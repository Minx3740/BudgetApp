begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select has_column(
  'public',
  'profiles',
  'avatar_path',
  'profiles store an avatar object path'
);

select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'avatars bucket is private'
);

select is(
  (
    select file_size_limit::integer
    from storage.buckets
    where id = 'avatars'
  ),
  1048576,
  'avatars bucket limits uploads to one mebibyte'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'avatars_read_same_workspace',
        'avatars_insert_own',
        'avatars_update_own',
        'avatars_delete_own'
      )
  ),
  4,
  'avatar object policies restrict reads and writes'
);

select * from finish();
rollback;
