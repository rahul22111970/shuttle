-- S1-12: the match op log. Points, undos and results as rows nobody can
-- rewrite; every row says who held the phone. Unlike session_events, seq
-- IS unique here per the spec: the S1-13 RPC's compare-and-set needs a
-- collision to be a database error, not a replay-order question.
begin;

create table public.match_events (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  seq        integer not null,
  type       text not null check (type in ('point', 'undo', 'result')),
  -- a point belongs to a side; undo and result do not
  side       text check (side in ('a', 'b')),
  -- decision 10: the resting player scores, so the scorer IS the writer.
  -- known gap, same as groups.captain_id (0002): no on-delete path until
  -- the account-deletion slice.
  scorer_id  uuid not null references public.profiles (id),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (match_id, seq),
  check ((type = 'point') = (side is not null))
);

alter table public.match_events enable row level security;

-- append-only at the grant level, the S1-08 lesson applied by name
revoke update, delete, truncate on table public.match_events from anon, authenticated;

create policy match_events_member_select on public.match_events
  for select to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id and public.is_group_member(m.group_id)
  ));

-- members write events, and only as themselves: scorer attribution is a
-- fact about who held the phone, not a claim
create policy match_events_member_insert on public.match_events
  for insert to authenticated
  with check (
    scorer_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id and public.is_group_member(m.group_id)
    )
  );

commit;
