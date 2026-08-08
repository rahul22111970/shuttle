-- S1-08: sessions and the first append-only op log. The session base row is
-- a plain row per Schema truth (last-writer-wins is fine for status); every
-- state CHANGE of the night lives in session_events, which nobody can
-- update or delete — the revoke is at the grant level, so there is no
-- policy to get wrong later.
begin;

create table public.sessions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  starts_at  timestamptz not null,
  status     text not null default 'planned'
             check (status in ('planned', 'live', 'closed')),
  created_at timestamptz not null default now()
);

create index sessions_group_id_idx on public.sessions (group_id);

create table public.session_events (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  -- seq is deliberately NOT unique here (unlike match_events, whose spec
  -- demands it): concurrent RSVPs may race to the same seq, and replay
  -- order is (seq, created_at, id)
  seq        integer not null,
  type       text not null
             check (type in ('rsvp_in', 'rsvp_out', 'check_in', 'round_generated', 'session_closed')),
  -- known gap, same as groups.captain_id (0002): no on-delete path; deleting
  -- a user who ever wrote an event fails on this FK until account-deletion
  -- adds its flow
  actor_id   uuid not null references public.profiles (id),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index session_events_session_id_seq_idx on public.session_events (session_id, seq);

alter table public.sessions enable row level security;
alter table public.session_events enable row level security;

-- append-only, enforced below RLS: even a perfectly-written policy cannot
-- grant what the role does not have. TRUNCATE is its own privilege that RLS
-- never gates (S1-08 review finding) — revoke it on the log AND on sessions,
-- or TRUNCATE sessions CASCADE takes both tables out.
revoke update, delete, truncate on table public.session_events from anon, authenticated;
revoke truncate on table public.sessions from anon, authenticated;

create policy sessions_member_select on public.sessions
  for select to authenticated
  using (public.is_group_member(group_id));

create policy sessions_member_insert on public.sessions
  for insert to authenticated
  with check (public.is_group_member(group_id));

-- plain-row status flips (start night, close) are member territory
create policy sessions_member_update on public.sessions
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

create policy session_events_member_select on public.session_events
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and public.is_group_member(s.group_id)
  ));

-- members write events, and only as themselves: actor_id is not a claim,
-- it is the writer
create policy session_events_member_insert on public.session_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and public.is_group_member(s.group_id)
    )
  );

commit;
