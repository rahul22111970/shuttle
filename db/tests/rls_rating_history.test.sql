-- RLS + append-only proof for rating_history. One rolled-back transaction;
-- the stranger owns their own live group (stronger fixture, house pattern).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000e0aa', 'authenticated', 'authenticated', 'rls-r-a@test.local'),
  ('00000000-0000-4000-8000-00000000e0bb', 'authenticated', 'authenticated', 'rls-r-b@test.local'),
  ('00000000-0000-4000-8000-00000000e0cc', 'authenticated', 'authenticated', 'rls-r-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-00000000e0aa', 'Rating A', 'player'),
  ('00000000-0000-4000-8000-00000000e0bb', 'Rating B', 'player'),
  ('00000000-0000-4000-8000-00000000e0cc', 'Rating C', 'player');

-- rls catalog check
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.rating_history'::regclass) then
    raise exception 'TEST FAIL rls_rating_history_enabled';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000e0aa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-00000000e001', 'Rating Gang', '00000000-0000-4000-8000-00000000e0aa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e0aa'),
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e0bb');
insert into public.matches (id, group_id, config, status, created_by) values
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001',
   '{"kind":"standard","bestOf":1,"pointsTo":21,"cap":null,"goldenPoint":true}',
   'complete', '00000000-0000-4000-8000-00000000e0aa');
insert into public.match_participants (match_id, player_id, side) values
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e0aa', 'a'),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e0bb', 'b');

-- a second match, kept row-free: denial tests below need (player, match)
-- pairs with no existing row, or a policy regression would die on the
-- unique constraint and mislabel the failure
insert into public.matches (id, group_id, config, status, created_by) values
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e001',
   '{"kind":"standard","bestOf":1,"pointsTo":21,"cap":null,"goldenPoint":true}',
   'complete', '00000000-0000-4000-8000-00000000e0aa');
insert into public.match_participants (match_id, player_id, side) values
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e0aa', 'a'),
  ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e0bb', 'b');

-- a member records both players' lines for the match
insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
  ('00000000-0000-4000-8000-00000000e0aa', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001', 1200, 1232, 64,
   '00000000-0000-4000-8000-00000000e0aa'),
  ('00000000-0000-4000-8000-00000000e0bb', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001', 1200, 1168, 64,
   '00000000-0000-4000-8000-00000000e0aa');

-- rating_history_duplicate_player_match_denied
do $$ begin
  begin
    insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
      ('00000000-0000-4000-8000-00000000e0aa', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001', 1232, 1260, 64,
       '00000000-0000-4000-8000-00000000e0aa');
    raise exception 'TEST FAIL rating_history_duplicate_player_match_denied: insert succeeded';
  exception when unique_violation then null;
  end;
end $$;

-- rating_history_subject_not_on_match_denied: C never played this match
do $$ begin
  begin
    insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
      ('00000000-0000-4000-8000-00000000e0cc', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e001', 1200, 1232, 64,
       '00000000-0000-4000-8000-00000000e0aa');
    raise exception 'TEST FAIL rating_history_subject_not_on_match_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- rating_history_created_by_forgery_denied
do $$ begin
  begin
    insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
      ('00000000-0000-4000-8000-00000000e0bb', '00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e001', 1200, 1100, 32,
       '00000000-0000-4000-8000-00000000e0bb');
    raise exception 'TEST FAIL rating_history_created_by_forgery_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- rating_history_update_denied (grant-level, errors not filters)
do $$ begin
  begin
    update public.rating_history set rating_after = 9999
      where player_id = '00000000-0000-4000-8000-00000000e0aa';
    raise exception 'TEST FAIL rating_history_update_denied: update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- delete moved below: 0015 re-granted DELETE for the voice undo, gated to
-- the match's logger or a captain within 48h; the stranger case proves the
-- policy filters

-- rating_history_truncate_denied (its own privilege, RLS never gates it)
do $$ begin
  begin
    truncate public.rating_history;
    raise exception 'TEST FAIL rating_history_truncate_denied: truncate succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- the stranger, with a live group of their own, still cannot write into
-- a match they are not grouped with
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000e0cc","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-00000000e003', 'Stranger Gang', '00000000-0000-4000-8000-00000000e0cc');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000e0cc');

-- rating_history_insert_by_non_member_denied
do $$ begin
  begin
    insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
      ('00000000-0000-4000-8000-00000000e0aa', '00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e001', 1200, 1000, 32,
       '00000000-0000-4000-8000-00000000e0cc');
    raise exception 'TEST FAIL rating_history_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- rating_history_delete_by_stranger_filtered (0015): the stranger's delete
-- reaches zero rows; the two lines on the match survive
delete from public.rating_history where match_id = '00000000-0000-4000-8000-00000000e002';
do $$
declare n integer;
begin
  select count(*) into n from public.rating_history
    where match_id = '00000000-0000-4000-8000-00000000e002';
  if n <> 2 then
    raise exception 'TEST FAIL rating_history_delete_by_stranger_filtered: % rows left', n;
  end if;
end $$;

-- rating_history_wrong_group_label_denied: the row must claim the match's
-- own group, not someone else's ladder
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000e0aa","role":"authenticated"}';
do $$ begin
  begin
    insert into public.rating_history (player_id, match_id, group_id, rating_before, rating_after, k, created_by) values
      ('00000000-0000-4000-8000-00000000e0bb', '00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-00000000e003', 1200, 1100, 32,
       '00000000-0000-4000-8000-00000000e0aa');
    raise exception 'TEST FAIL rating_history_wrong_group_label_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ratings are public in-app: the stranger READS both lines
do $$
declare n integer;
begin
  select count(*) into n from public.rating_history
    where match_id = '00000000-0000-4000-8000-00000000e002';
  if n <> 2 then
    raise exception 'TEST FAIL rating_history_any_authed_reads: got % rows, expected 2', n;
  end if;
end $$;

-- rls_rating_history_anon_zero_rows
set local role anon;
set local request.jwt.claims to '{}';
do $$
declare n integer;
begin
  select count(*) into n from public.rating_history;
  if n <> 0 then
    raise exception 'TEST FAIL rls_rating_history_anon_zero_rows: got % rows', n;
  end if;
end $$;

rollback;
select 'rls_rating_history: all tests passed' as result;
