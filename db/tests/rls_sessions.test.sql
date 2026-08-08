-- RLS + append-only proof for sessions and session_events. One rolled-back
-- transaction; cross-group isolation uses a second live group (S1-07
-- review note), so "stranger" means a real user with their own group, not
-- an empty account.
\set ON_ERROR_STOP on
begin;

-- fixtures: group 1 = captain A + member B; group 2 = captain C (the
-- stranger relative to group 1)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-s-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-s-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-s-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.sessions'::regclass) then
    raise exception 'TEST FAIL rls_sessions_enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.session_events'::regclass) then
    raise exception 'TEST FAIL rls_session_events_enabled';
  end if;
end $$;

-- A builds group 1 and its session, and RSVPs in
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Tuesday Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');
insert into public.sessions (id, group_id, starts_at) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000901', now() + interval '1 day');
insert into public.session_events (session_id, seq, type, actor_id) values
  ('00000000-0000-4000-8000-000000000e01', 1, 'rsvp_in', '00000000-0000-4000-8000-000000000aaa');

-- C builds group 2 with a session of their own: the cross-group fixture
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000902', 'Other Gang', '00000000-0000-4000-8000-000000000ccc');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000ccc');
insert into public.sessions (id, group_id, starts_at) values
  ('00000000-0000-4000-8000-000000000e02', '00000000-0000-4000-8000-000000000902', now() + interval '2 days');
insert into public.session_events (session_id, seq, type, actor_id) values
  ('00000000-0000-4000-8000-000000000e02', 1, 'rsvp_in', '00000000-0000-4000-8000-000000000ccc');

-- rls_sessions_stranger_zero_rows: C sees their own session, none of group 1's
do $$ declare n int; begin
  select count(*) into n from public.sessions
    where id = '00000000-0000-4000-8000-000000000e01';
  if n <> 0 then raise exception 'TEST FAIL rls_sessions_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.sessions;
  if n <> 1 then raise exception 'TEST FAIL cross_group_isolation_sessions: got % rows', n; end if;
end $$;

-- rls_session_events_stranger_zero_rows: C has exactly their own one event,
-- and zero of group 1's — the stronger form, distinguishing "filtered" from
-- "nothing to see"
do $$ declare n int; begin
  select count(*) into n from public.session_events
    where session_id = '00000000-0000-4000-8000-000000000e01';
  if n <> 0 then raise exception 'TEST FAIL rls_session_events_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.session_events;
  if n <> 1 then raise exception 'TEST FAIL cross_group_isolation_events: got % rows', n; end if;
end $$;

-- sessions_update_by_stranger_zero_rows: RLS update policies filter, so C
-- flipping group 1's status must touch zero rows
do $$ declare n int; begin
  update public.sessions set status = 'live'
    where id = '00000000-0000-4000-8000-000000000e01';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST FAIL sessions_update_by_stranger_zero_rows: % rows', n; end if;
end $$;

-- session_events_truncate_denied: TRUNCATE is not gated by RLS, only by the
-- grant this migration revokes
do $$ begin
  begin
    truncate public.session_events;
    raise exception 'TEST FAIL session_events_truncate_denied: truncate succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- session_events_insert_by_non_member_denied: C writes into group 1's session
do $$ begin
  begin
    insert into public.session_events (session_id, seq, type, actor_id) values
      ('00000000-0000-4000-8000-000000000e01', 2, 'rsvp_in', '00000000-0000-4000-8000-000000000ccc');
    raise exception 'TEST FAIL session_events_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- sessions_insert_by_non_member_denied: C schedules a session for group 1
do $$ begin
  begin
    insert into public.sessions (group_id, starts_at) values
      ('00000000-0000-4000-8000-000000000901', now());
    raise exception 'TEST FAIL sessions_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- member B sees the session and its one event
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.sessions
    where id = '00000000-0000-4000-8000-000000000e01';
  if n <> 1 then raise exception 'TEST FAIL member_sees_session: got % rows', n; end if;
  select count(*) into n from public.session_events;
  if n <> 1 then raise exception 'TEST FAIL member_sees_events: got % rows', n; end if;
  select count(*) into n from public.session_events
    where session_id = '00000000-0000-4000-8000-000000000e02';
  if n <> 0 then raise exception 'TEST FAIL cross_group_isolation_events_b: got % rows', n; end if;
end $$;

-- session_events_actor_forgery_denied: B writes an event as A
do $$ begin
  begin
    insert into public.session_events (session_id, seq, type, actor_id) values
      ('00000000-0000-4000-8000-000000000e01', 2, 'rsvp_in', '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL session_events_actor_forgery_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- session_events_update_denied: append-only at the grant level, so even a
-- member's update errors rather than filtering
do $$ begin
  begin
    update public.session_events set payload = '{"tampered":true}'::jsonb
      where session_id = '00000000-0000-4000-8000-000000000e01';
    raise exception 'TEST FAIL session_events_update_denied: update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- session_events_delete_denied: same, for delete
do $$ begin
  begin
    delete from public.session_events
      where session_id = '00000000-0000-4000-8000-000000000e01';
    raise exception 'TEST FAIL session_events_delete_denied: delete succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- member B can RSVP as themselves (the positive insert path)
insert into public.session_events (session_id, seq, type, actor_id) values
  ('00000000-0000-4000-8000-000000000e01', 2, 'rsvp_in', '00000000-0000-4000-8000-000000000bbb');

rollback;
\echo rls_sessions: all tests passed
