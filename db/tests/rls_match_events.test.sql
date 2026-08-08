-- RLS + append-only + uniqueness proof for match_events. One rolled-back
-- transaction; the stranger owns a live group, match and event (the
-- stronger cross-group form).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-e-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-e-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-e-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.match_events'::regclass) then
    raise exception 'TEST FAIL rls_match_events_enabled';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Event Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');
insert into public.matches (id, group_id, config, created_by) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000901', '{}',
   '00000000-0000-4000-8000-000000000aaa');
insert into public.match_events (match_id, seq, type, side, scorer_id) values
  ('00000000-0000-4000-8000-000000000f01', 1, 'point', 'a',
   '00000000-0000-4000-8000-000000000aaa');

-- match_events_seq_conflict: duplicate (match_id, seq) errors
do $$ begin
  begin
    insert into public.match_events (match_id, seq, type, side, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 1, 'point', 'b',
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL match_events_seq_conflict: duplicate seq accepted';
  exception when unique_violation then null;
  end;
end $$;

-- match_events_point_needs_side / match_events_result_refuses_side
do $$ begin
  begin
    insert into public.match_events (match_id, seq, type, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 2, 'point',
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL match_events_point_needs_side: sideless point accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.match_events (match_id, seq, type, side, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 2, 'result', 'a',
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL match_events_result_refuses_side: sided result accepted';
  exception when check_violation then null;
  end;
end $$;

-- C builds their own world (stronger stranger form)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000902', 'Other Gang', '00000000-0000-4000-8000-000000000ccc');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000ccc');
insert into public.matches (id, group_id, config, created_by) values
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-000000000902', '{}',
   '00000000-0000-4000-8000-000000000ccc');
insert into public.match_events (match_id, seq, type, side, scorer_id) values
  ('00000000-0000-4000-8000-000000000f02', 1, 'point', 'a',
   '00000000-0000-4000-8000-000000000ccc');

-- rls_match_events_stranger_zero_rows
do $$ declare n int; begin
  select count(*) into n from public.match_events
    where match_id = '00000000-0000-4000-8000-000000000f01';
  if n <> 0 then raise exception 'TEST FAIL rls_match_events_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.match_events;
  if n <> 1 then raise exception 'TEST FAIL cross_group_isolation_match_events: got % rows', n; end if;
end $$;

-- match_events_insert_by_non_member_denied
do $$ begin
  begin
    insert into public.match_events (match_id, seq, type, side, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 5, 'point', 'a',
       '00000000-0000-4000-8000-000000000ccc');
    raise exception 'TEST FAIL match_events_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- member B: sees the log, cannot rewrite it, cannot forge the scorer
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.match_events;
  if n <> 1 then raise exception 'TEST FAIL member_sees_events: got % rows', n; end if;
end $$;

-- match_events_update_denied (grant-level, errors as a member)
do $$ begin
  begin
    update public.match_events set payload = '{"tampered":true}'::jsonb
      where match_id = '00000000-0000-4000-8000-000000000f01';
    raise exception 'TEST FAIL match_events_update_denied: update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- match_events_delete_denied / match_events_truncate_denied
do $$ begin
  begin
    delete from public.match_events;
    raise exception 'TEST FAIL match_events_delete_denied: delete succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.match_events;
    raise exception 'TEST FAIL match_events_truncate_denied: truncate succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- match_events_scorer_forgery_denied: B writes an event as A
do $$ begin
  begin
    insert into public.match_events (match_id, seq, type, side, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 6, 'point', 'a',
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL match_events_scorer_forgery_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- and the positive: B scores as themselves
insert into public.match_events (match_id, seq, type, side, scorer_id) values
  ('00000000-0000-4000-8000-000000000f01', 2, 'point', 'b',
   '00000000-0000-4000-8000-000000000bbb');

rollback;
\echo rls_match_events: all tests passed
