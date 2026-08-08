-- S1-25: the rating log. One row per player per completed match, written
-- by the api layer (S1-26) from @shuttle/rating's pure deltas. Insert-only
-- like every log here; ratings are public in-app, so any signed-in user
-- may read (the Me tab shows opponents' lines, cross-group).
begin;

create table public.rating_history (
  id            uuid primary key default gen_random_uuid(),
  -- known gap, same as groups.captain_id (0002): no on-delete path until
  -- the account-deletion slice
  player_id     uuid not null references public.profiles (id),
  -- restrict, not cascade: later rows' rating_before chains through this
  -- match's effect; erasing it would fork stored history from replay
  match_id      uuid not null references public.matches (id) on delete restrict,
  rating_before integer not null,
  rating_after  integer not null,
  k             integer not null check (k > 0),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  -- one verdict per player per match; a doubles match writes 4 rows.
  -- match_id leads so the S1-26 "already recorded?" probe and the FK have
  -- an index; the sparkline reads the (player_id, created_at) index below
  unique (match_id, player_id)
);

-- the sparkline query: a player's line in time order
create index rating_history_player_created_idx
  on public.rating_history (player_id, created_at);

alter table public.rating_history enable row level security;

-- append-only at the grant level: the S1-08 lesson, every privilege by name
revoke update, delete, truncate on table public.rating_history from anon, authenticated;

-- public in-app: any authenticated user reads any line, anon reads nothing
create policy rating_history_authed_select on public.rating_history
  for select to authenticated
  using (true);

-- only members of the match's group write its rating rows, as themselves;
-- the subject player must have been ON the match, which also pins the row
-- to the group the writer belongs to.
-- ACCEPTED RISK (S1-25 review): a member can front-run the api with a
-- fabricated row, and immutability + uniqueness make it permanent; the
-- S1-26 writer must treat a conflict with DIFFERENT values as a loud
-- error, never "already done". Escalation path if it ever bites: route
-- inserts through a SECURITY DEFINER RPC like 0007.
create policy rating_history_match_member_insert on public.rating_history
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.matches m
      where m.id = rating_history.match_id
        and public.is_group_member(m.group_id)
    )
    and exists (
      select 1
      from public.match_participants mp
      where mp.match_id = rating_history.match_id
        and mp.player_id = rating_history.player_id
    )
  );

commit;
