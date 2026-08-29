-- Weekly inactivity decay: a member who sat out a week their group played
-- loses WEEKLY_DECAY_POINTS, appended to the same rating chain the ladder
-- already folds. Decay rows are rating_history rows with kind='decay',
-- no match, and the IST Monday of the decayed week. They are written only
-- by the weekly job (service role, api/rating-decay.ts); no client policy
-- grows, so clients still cannot insert or delete them:
--   insert policy requires an existing match the writer's group owns, and
--   a null match_id can never satisfy it;
--   the 0015 undo delete policy requires the row's match to exist, and a
--   null match_id can never satisfy that either.
begin;

alter table public.rating_history alter column match_id drop not null;
alter table public.rating_history alter column k drop not null;
alter table public.rating_history alter column created_by drop not null;

alter table public.rating_history
  add column kind text not null default 'match'
  constraint rating_history_kind_check check (kind in ('match', 'decay'));

-- the IST Monday of the week the player sat out
alter table public.rating_history add column week date;

-- one shape per kind: a match row keeps every old invariant, a decay row
-- has no match, no k, no author, and names its week
alter table public.rating_history add constraint rating_history_shape check (
  (kind = 'match' and match_id is not null and k is not null
    and created_by is not null and week is null)
  or
  (kind = 'decay' and match_id is null and k is null
    and created_by is null and week is not null)
);

-- one decay per player per group per week, and the job's ON CONFLICT
-- target. Match rows have week null, and null weeks never collide, so
-- this index costs them nothing.
create unique index rating_history_decay_once
  on public.rating_history (group_id, player_id, week);

commit;
