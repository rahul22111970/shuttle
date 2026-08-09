-- Group-wise ratings: a rating is a claim about one group's ladder, not a
-- global number (Rahul's call after the first pilot weekend: a second
-- group must start everyone fresh to stay a fair metric). group_id is
-- derivable via match_id, but every chain fold filters by player+group,
-- so the column earns its place.
begin;

alter table public.rating_history add column group_id uuid references public.groups (id);

update public.rating_history rh
set group_id = m.group_id
from public.matches m
where m.id = rh.match_id;

alter table public.rating_history alter column group_id set not null;

-- the ladder query: one player's line in one group, in time order
create index rating_history_group_player_created_idx
  on public.rating_history (group_id, player_id, created_at);

-- the insert policy grows one conjunct: the claimed group must BE the
-- match's group, so no row can file itself onto another ladder
drop policy rating_history_match_member_insert on public.rating_history;
create policy rating_history_match_member_insert on public.rating_history
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1
      from public.matches m
      where m.id = rating_history.match_id
        and m.group_id = rating_history.group_id
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
