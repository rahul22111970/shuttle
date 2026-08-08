-- Proof for append_match_event: atomic append+snapshot, stale-seq
-- rejection, completion flip, live-gate, invoker mode, and that the
-- re-granted update column stays unreachable outside the RPC. One
-- rolled-back transaction.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-p-a@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-p-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Member A', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

-- rpc_is_invoker: the acceptance's no-SECURITY-DEFINER proof, from the catalog
do $$ begin
  if (select prosecdef from pg_proc where proname = 'append_match_event') then
    raise exception 'TEST FAIL rpc_is_invoker: append_match_event is SECURITY DEFINER';
  end if;
  if has_function_privilege('anon', 'public.append_match_event(uuid, integer, jsonb, jsonb)', 'execute') then
    raise exception 'TEST FAIL rpc_anon_execute_revoked';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'RPC Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa');
insert into public.matches (id, group_id, config, created_by) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000901', '{}',
   '00000000-0000-4000-8000-000000000aaa');

-- append_writes_event_and_snapshot: one call, both effects
do $$
declare e public.match_events; snap jsonb;
begin
  e := public.append_match_event(
    '00000000-0000-4000-8000-000000000f01', 1,
    '{"type":"point","side":"a"}', '{"score":{"a":1,"b":0},"finished":false}');
  if e.seq <> 1 or e.type <> 'point' or e.side <> 'a' then
    raise exception 'TEST FAIL append_writes_event_and_snapshot: event %', e;
  end if;
  if e.scorer_id <> '00000000-0000-4000-8000-000000000aaa' then
    raise exception 'TEST FAIL append_scorer_is_caller';
  end if;
  select snapshot into snap from public.matches
    where id = '00000000-0000-4000-8000-000000000f01';
  if snap->'score'->>'a' <> '1' then
    raise exception 'TEST FAIL append_writes_event_and_snapshot: snapshot %', snap;
  end if;
end $$;

-- append_rejects_stale_seq: a replayed seq and a gapped seq both refuse
do $$ begin
  begin
    perform public.append_match_event(
      '00000000-0000-4000-8000-000000000f01', 1,
      '{"type":"point","side":"b"}', '{}');
    raise exception 'TEST FAIL append_rejects_stale_seq: replayed seq accepted';
  exception when sqlstate 'SH001' then null;
  end;
  begin
    perform public.append_match_event(
      '00000000-0000-4000-8000-000000000f01', 5,
      '{"type":"point","side":"b"}', '{}');
    raise exception 'TEST FAIL append_rejects_stale_seq: gapped seq accepted';
  exception when sqlstate 'SH001' then null;
  end;
end $$;

-- append_completes_match: a finished snapshot flips status
do $$
declare st text;
begin
  perform public.append_match_event(
    '00000000-0000-4000-8000-000000000f01', 2,
    '{"type":"result","payload":{"final":true}}',
    '{"score":{"a":21,"b":3},"finished":true,"winner":"a"}');
  select status into st from public.matches
    where id = '00000000-0000-4000-8000-000000000f01';
  if st <> 'complete' then
    raise exception 'TEST FAIL append_completes_match: status %', st;
  end if;
  -- rpc_guc_resets: the policy flag must not outlive the RPC's own update;
  -- asserted here directly so the proof does not depend on test ordering
  if current_setting('shuttle.rpc', true) = 'append_match_event' then
    raise exception 'TEST FAIL rpc_guc_resets: flag still set after the RPC returned';
  end if;
end $$;

-- append_refuses_complete_match: the RPC gate
do $$ begin
  begin
    perform public.append_match_event(
      '00000000-0000-4000-8000-000000000f01', 3,
      '{"type":"point","side":"a"}', '{}');
    raise exception 'TEST FAIL append_refuses_complete_match: append accepted';
  exception when sqlstate 'SH002' then null;
  end;
end $$;

-- match_events_insert_not_live_denied: the S1-12 carry, direct path
do $$ begin
  begin
    insert into public.match_events (match_id, seq, type, side, scorer_id) values
      ('00000000-0000-4000-8000-000000000f01', 3, 'point', 'a',
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL match_events_insert_not_live_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- matches_direct_update_denied_after_regrant: the column grant exists now,
-- but the policy's GUC check still errors a direct member write
do $$ begin
  begin
    update public.matches set snapshot = '{"forged":true}'::jsonb
      where id = '00000000-0000-4000-8000-000000000f01';
    raise exception 'TEST FAIL matches_direct_update_denied_after_regrant: update succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- append_invisible_match_no_oracle: a stranger gets the same error as a
-- missing match
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
do $$ begin
  begin
    perform public.append_match_event(
      '00000000-0000-4000-8000-000000000f01', 3,
      '{"type":"point","side":"a"}', '{}');
    raise exception 'TEST FAIL append_invisible_match_no_oracle: append accepted';
  exception when sqlstate 'SH404' then null;
  end;
  begin
    perform public.append_match_event(
      '99999999-9999-4999-8999-999999999999', 1,
      '{"type":"point","side":"a"}', '{}');
    raise exception 'TEST FAIL append_missing_match: append accepted';
  exception when sqlstate 'SH404' then null;
  end;
end $$;

rollback;
\echo rls_match_rpc: all tests passed
