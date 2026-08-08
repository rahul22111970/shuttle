-- S1-11: match anchor rows and participants. The snapshot column is a
-- projection the S1-13 RPC will write atomically with each event; until
-- that RPC exists, UPDATE on matches is revoked at the grant level, so a
-- direct snapshot write ERRORS rather than filters. S1-13 re-grants UPDATE
-- column-scoped to snapshot/status behind its own policy.
--
-- Also carried here from the S1-08 review: the TRUNCATE revoke sweep for
-- the three tables that predate that lesson (TRUNCATE is its own privilege,
-- RLS never gates it, Supabase default-grants it).
begin;

revoke truncate on table public.profiles from anon, authenticated;
revoke truncate on table public.groups from anon, authenticated;
revoke truncate on table public.group_members from anon, authenticated;
-- and the migration ledger itself, which migrate.sh creates outside any
-- migration: clients have no business reading or touching it at all
revoke all on table public.schema_migrations from anon, authenticated;

create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  config     jsonb not null,
  status     text not null default 'live' check (status in ('live', 'complete')),
  snapshot   jsonb,
  -- known gap, same as groups.captain_id (0002): no on-delete path until
  -- the account-deletion slice
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index matches_group_id_idx on public.matches (group_id);
create index matches_session_id_idx on public.matches (session_id);

create table public.match_participants (
  match_id  uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  side      text not null check (side in ('a', 'b')),
  primary key (match_id, player_id)
);

create index match_participants_player_id_idx on public.match_participants (player_id);

alter table public.matches enable row level security;
alter table public.match_participants enable row level security;

-- matches: no update policy AND no update grant until S1-13's RPC; config
-- and participants are write-once per Schema truth
revoke update, delete, truncate on table public.matches from anon, authenticated;
revoke update, delete, truncate on table public.match_participants from anon, authenticated;

create policy matches_member_select on public.matches
  for select to authenticated
  using (public.is_group_member(group_id));

create policy matches_member_insert on public.matches
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and created_by = (select auth.uid())
  );

create policy match_participants_member_select on public.match_participants
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_group_member(m.group_id)
  ));

-- whoever can see the match can seat participants, but only players who
-- belong to that match's group: no strangers on court
create policy match_participants_member_insert on public.match_participants
  for insert to authenticated
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_id and public.is_group_member(m.group_id)
    )
    and exists (
      select 1 from public.matches m2
      join public.group_members gm on gm.group_id = m2.group_id
      where m2.id = match_id and gm.player_id = match_participants.player_id
    )
  );

commit;
