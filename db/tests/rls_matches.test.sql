-- RLS proof for matches and match_participants, plus the TRUNCATE sweep
-- carried from the S1-08 review. One rolled-back transaction.
\set ON_ERROR_STOP on
begin;

-- fixtures: group 1 = captain A + member B; group 2 = C (cross-group form)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-m-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-m-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-m-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.matches'::regclass) then
    raise exception 'TEST FAIL rls_matches_enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.match_participants'::regclass) then
    raise exception 'TEST FAIL rls_match_participants_enabled';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Match Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');
insert into public.matches (id, group_id, config, created_by) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000901',
   '{"kind":"standard","bestOf":1,"game":{"pointsToWin":21,"settingAt":null,"cap":null},"midGameIntervalAt":null}',
   '00000000-0000-4000-8000-000000000aaa');
insert into public.match_participants (match_id, player_id, side) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000aaa', 'a'),
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000bbb', 'b');

-- matches_insert_forged_creator_denied: A cannot stamp B as creator
do $$ begin
  begin
    insert into public.matches (group_id, config, created_by) values
      ('00000000-0000-4000-8000-000000000901', '{}',
       '00000000-0000-4000-8000-000000000bbb');
    raise exception 'TEST FAIL matches_insert_forged_creator_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- C builds group 2 with a match of their own (the stronger stranger form)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000902', 'Other Gang', '00000000-0000-4000-8000-000000000ccc');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000ccc');
insert into public.matches (id, group_id, config, created_by) values
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-000000000902', '{}',
   '00000000-0000-4000-8000-000000000ccc');

-- rls_matches_stranger_zero_rows / rls_match_participants_stranger_zero_rows
do $$ declare n int; begin
  select count(*) into n from public.matches
    where id = '00000000-0000-4000-8000-000000000f01';
  if n <> 0 then raise exception 'TEST FAIL rls_matches_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'TEST FAIL cross_group_isolation_matches: got % rows', n; end if;
  select count(*) into n from public.match_participants;
  if n <> 0 then raise exception 'TEST FAIL rls_match_participants_stranger_zero_rows: got % rows', n; end if;
end $$;

-- matches_insert_by_non_member_denied: C schedules a match in group 1
do $$ begin
  begin
    insert into public.matches (group_id, config, created_by) values
      ('00000000-0000-4000-8000-000000000901', '{}',
       '00000000-0000-4000-8000-000000000ccc');
    raise exception 'TEST FAIL matches_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- match_participants_insert_by_non_member_denied: C seats themselves in
-- group 1's match
do $$ begin
  begin
    insert into public.match_participants (match_id, player_id, side) values
      ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000ccc', 'a');
    raise exception 'TEST FAIL match_participants_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- member B sees the match and both participants; cannot update the snapshot
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.matches;
  if n <> 1 then raise exception 'TEST FAIL member_sees_match: got % rows', n; end if;
  select count(*) into n from public.match_participants;
  if n <> 2 then raise exception 'TEST FAIL member_sees_participants: got % rows', n; end if;
end $$;

-- matches_direct_update_denied: UPDATE is grant-revoked until the S1-13
-- RPC, so even a member's snapshot write errors rather than filters
do $$ begin
  begin
    update public.matches set snapshot = '{"forged":true}'::jsonb
      where id = '00000000-0000-4000-8000-000000000f01';
    raise exception 'TEST FAIL matches_direct_update_denied: update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- matches_direct_delete_denied: DELETE is grant-revoked like UPDATE
do $$ begin
  begin
    delete from public.matches where id = '00000000-0000-4000-8000-000000000f01';
    raise exception 'TEST FAIL matches_direct_delete_denied: delete succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- match_participants_outsider_player_denied: B seats C (not a group member)
do $$ begin
  begin
    insert into public.match_participants (match_id, player_id, side) values
      ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000ccc', 'b');
    raise exception 'TEST FAIL match_participants_outsider_player_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- truncate_sweep_denied: the S1-08 lesson applied to the pre-0003 tables
do $$
declare t text;
begin
  foreach t in array array['profiles', 'groups', 'group_members', 'matches', 'match_participants'] loop
    begin
      execute format('truncate public.%I', t);
      raise exception 'TEST FAIL truncate_sweep_denied: truncate % succeeded', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

rollback;
\echo rls_matches: all tests passed
