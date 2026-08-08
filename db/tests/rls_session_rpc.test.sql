-- Proof for append_session_event: seq is server-computed and gapless per
-- session, RLS still gates the insert, the actor is the caller, and anon
-- cannot execute. One rolled-back transaction.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-r-a@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-r-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Member A', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'RPC Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa');
insert into public.sessions (id, group_id, starts_at) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-000000000901', now());

-- session_rpc_seq_increments: two appends, seq 1 then 2, actor = caller
do $$ declare e public.session_events; begin
  e := public.append_session_event('00000000-0000-4000-8000-000000000e01', 'rsvp_in');
  if e.seq <> 1 then raise exception 'TEST FAIL session_rpc_seq_increments: first seq %', e.seq; end if;
  if e.actor_id <> '00000000-0000-4000-8000-000000000aaa' then
    raise exception 'TEST FAIL session_rpc_actor_is_caller: got %', e.actor_id;
  end if;
  e := public.append_session_event('00000000-0000-4000-8000-000000000e01', 'rsvp_out');
  if e.seq <> 2 then raise exception 'TEST FAIL session_rpc_seq_increments: second seq %', e.seq; end if;
end $$;

-- session_rpc_non_member_denied: the RPC runs as the caller, so RLS still
-- refuses a stranger
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
do $$ begin
  begin
    perform public.append_session_event('00000000-0000-4000-8000-000000000e01', 'rsvp_in');
    raise exception 'TEST FAIL session_rpc_non_member_denied: append succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- session_rpc_anon_execute_revoked
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.append_session_event(uuid, text, jsonb)', 'execute') then
    raise exception 'TEST FAIL session_rpc_anon_execute_revoked';
  end if;
end $$;

rollback;
\echo rls_session_rpc: all tests passed
