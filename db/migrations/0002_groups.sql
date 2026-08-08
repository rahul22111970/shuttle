-- S1-07: groups and membership. Sessions always belong to a group; the
-- creator is the captain. RLS in the same migration, as always.
begin;

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- known gap, deliberate: no on-delete behavior, no captain-transfer path
  -- yet. Deleting a captain's auth user will fail on this FK until the
  -- account-deletion slice adds reassign-or-disband. Recorded at S1-07.
  captain_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

-- the PK already serves group_id-leading lookups; player_id gets its own
create index group_members_player_id_idx on public.group_members (player_id);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Membership test used inside policies. SECURITY DEFINER on purpose: a
-- group_members policy that queried group_members under RLS would recurse.
-- The definer (table owner) bypasses RLS inside the function only.
create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and player_id = auth.uid()
  );
$$;

-- Supabase's default privileges grant EXECUTE to anon and authenticated at
-- CREATE FUNCTION time; revoking only "from public" leaves anon's direct
-- grant intact (S1-07 review finding). Revoke both, grant back the one.
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

create policy groups_member_or_captain_select on public.groups
  for select to authenticated
  using (captain_id = (select auth.uid()) or public.is_group_member(id));

create policy groups_any_authed_creates_as_captain on public.groups
  for insert to authenticated
  with check (captain_id = (select auth.uid()));

create policy group_members_member_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_captain_insert on public.group_members
  for insert to authenticated
  with check (exists (
    select 1 from public.groups g
    where g.id = group_id and g.captain_id = (select auth.uid())
  ));

create policy group_members_captain_delete on public.group_members
  for delete to authenticated
  using (exists (
    select 1 from public.groups g
    where g.id = group_id and g.captain_id = (select auth.uid())
  ));

commit;
