begin;

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

  insert into public.accounts (id, workspace_id, name, type)
  values
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Espèces', 'cash'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Mobile money', 'mobile_money'),
    (pg_catalog.gen_random_uuid(), new_workspace_id, 'Banque', 'bank');

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

commit;
