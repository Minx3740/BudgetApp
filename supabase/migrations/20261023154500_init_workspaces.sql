-- M1 / migration 001 : profils, espaces de travail, membres, RLS
-- À appliquer une seule fois. Non idempotent.

begin;

-- ---------------------------------------------------------------
-- Schéma privé : fonctions d'aide, non exposées par l'API REST
-- ---------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------
create type public.workspace_type as enum ('personal', 'shared');
create type public.member_role as enum ('owner', 'member', 'viewer');

-- ---------------------------------------------------------------
-- Trigger générique : updated_at posé par le serveur
-- ---------------------------------------------------------------
create or replace function private.set_updated_at()
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

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 80),
  type       public.workspace_type not null,
  currency   text not null default 'MGA' check (currency ~ '^[A-Z]{3}$'),
  owner_id   uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Un seul espace personnel actif par utilisateur
create unique index workspaces_one_personal_per_owner
  on public.workspaces (owner_id)
  where type = 'personal' and deleted_at is null;

create index workspaces_owner_id_idx on public.workspaces (owner_id);

-- Pas de deleted_at ici : quitter un espace supprime la ligne.
create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.member_role not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);

-- ---------------------------------------------------------------
-- Fonctions d'aide pour la RLS (security definer : évite la
-- récursion des politiques sur memberships)
-- ---------------------------------------------------------------
create or replace function private.is_workspace_member(ws_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = ws_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_workspace_role(ws_id uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.workspace_id = ws_id
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

create or replace function private.shares_workspace_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid())
      and b.user_id = other_user
  );
$$;

revoke execute on function private.is_workspace_member(uuid) from public, anon;
revoke execute on function private.has_workspace_role(uuid, public.member_role[]) from public, anon;
revoke execute on function private.shares_workspace_with(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.has_workspace_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.shares_workspace_with(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Triggers métier
-- ---------------------------------------------------------------

-- L'identité d'un espace (type, propriétaire) ne change jamais
create or replace function private.workspaces_lock_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type is distinct from old.type or new.owner_id is distinct from old.owner_id then
    raise exception 'type et owner_id d''un espace ne sont pas modifiables';
  end if;
  return new;
end;
$$;

-- Le propriétaire devient automatiquement membre 'owner'
create or replace function private.workspaces_add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

-- A l'inscription : profil + espace personnel
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), '')
  );

  insert into public.workspaces (name, type, owner_id)
  values ('Perso', 'personal', new.id);

  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;
revoke execute on function private.workspaces_lock_identity() from public, anon, authenticated;
revoke execute on function private.workspaces_add_owner_membership() from public, anon, authenticated;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before insert or update on public.profiles
  for each row execute function private.set_updated_at();

create trigger workspaces_set_updated_at
  before insert or update on public.workspaces
  for each row execute function private.set_updated_at();

create trigger workspaces_lock_identity
  before update on public.workspaces
  for each row execute function private.workspaces_lock_identity();

create trigger workspaces_add_owner_membership
  after insert on public.workspaces
  for each row execute function private.workspaces_add_owner_membership();

create trigger memberships_set_updated_at
  before insert or update on public.memberships
  for each row execute function private.set_updated_at();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------
-- RLS : tout est refusé par défaut, on ouvre au cas par cas
-- ---------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.workspaces  enable row level security;
alter table public.memberships enable row level security;

revoke all on public.profiles, public.workspaces, public.memberships from anon, authenticated;

-- profiles : lecture de soi et des co-membres, modification de soi
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_workspace_with(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces : lecture par les membres (ou le propriétaire, nécessaire
-- pour INSERT ... RETURNING avant que le trigger ait créé le membre)
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_workspace_member(id));

-- Création client : uniquement des espaces partagés dont on est propriétaire
create policy workspaces_insert_shared on public.workspaces
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and type = 'shared');

-- Modification (renommage, suppression logique) : propriétaire seulement
create policy workspaces_update_owner on public.workspaces
  for update to authenticated
  using (private.has_workspace_role(id, array['owner']::public.member_role[]))
  with check (private.has_workspace_role(id, array['owner']::public.member_role[]));

-- memberships : lecture par les membres du même espace.
-- Aucune politique d'écriture : les ajouts passeront par l'invitation (migration 002).
create policy memberships_select on public.memberships
  for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy memberships_delete_non_owner on public.memberships
  for delete to authenticated
  using (
    role <> 'owner'
    and (
      user_id = (select auth.uid())
      or private.has_workspace_role(workspace_id, array['owner']::public.member_role[])
    )
  );

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

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update on public.workspaces to authenticated;
grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant usage on type public.workspace_type, public.member_role to authenticated;

commit;
