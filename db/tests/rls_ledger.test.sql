-- RLS + append-only + shape proof for ledger_events. One rolled-back
-- transaction; the stranger owns a live group and event (stronger form).
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-l-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-l-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-l-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.ledger_events'::regclass) then
    raise exception 'TEST FAIL rls_ledger_events_enabled';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Ledger Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');

-- A logs the court expense across both members
insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
  ('00000000-0000-4000-8000-000000000901', 1, 'expense',
   '00000000-0000-4000-8000-000000000aaa', 60000,
   array['00000000-0000-4000-8000-000000000aaa','00000000-0000-4000-8000-000000000bbb']::uuid[],
   '00000000-0000-4000-8000-000000000aaa');

-- ledger_events_created_by_forgery_denied
do $$ begin
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'expense',
       '00000000-0000-4000-8000-000000000aaa', 100,
       array['00000000-0000-4000-8000-000000000aaa']::uuid[],
       '00000000-0000-4000-8000-000000000bbb');
    raise exception 'TEST FAIL ledger_events_created_by_forgery_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ledger_payer_must_be_group_member_denied: A logs C (no group) as payer
do $$ begin
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'expense',
       '00000000-0000-4000-8000-000000000ccc', 100,
       array['00000000-0000-4000-8000-000000000aaa']::uuid[],
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL ledger_payer_must_be_group_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ledger_participant_duplicates_denied: one duplicate would poison the fold
do $$ begin
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'expense',
       '00000000-0000-4000-8000-000000000aaa', 100,
       array['00000000-0000-4000-8000-000000000bbb','00000000-0000-4000-8000-000000000bbb']::uuid[],
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL ledger_participant_duplicates_denied: insert succeeded';
  exception when check_violation then null;
  end;
end $$;

-- shape: settlements flow to exactly one person, never the payer
do $$ begin
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'settlement',
       '00000000-0000-4000-8000-000000000bbb', 100,
       array['00000000-0000-4000-8000-000000000aaa','00000000-0000-4000-8000-000000000bbb']::uuid[],
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL ledger_settlement_multi_payee_refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'settlement',
       '00000000-0000-4000-8000-000000000bbb', 100,
       array['00000000-0000-4000-8000-000000000bbb']::uuid[],
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL ledger_settlement_self_pay_refused';
  exception when check_violation then null;
  end;
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 2, 'expense',
       '00000000-0000-4000-8000-000000000aaa', 0,
       array['00000000-0000-4000-8000-000000000aaa']::uuid[],
       '00000000-0000-4000-8000-000000000aaa');
    raise exception 'TEST FAIL ledger_zero_amount_refused';
  exception when check_violation then null;
  end;
end $$;

-- C's own world (the stronger stranger form)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000902', 'Other Gang', '00000000-0000-4000-8000-000000000ccc');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-000000000ccc');
insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
  ('00000000-0000-4000-8000-000000000902', 1, 'expense',
   '00000000-0000-4000-8000-000000000ccc', 500,
   array['00000000-0000-4000-8000-000000000ccc']::uuid[],
   '00000000-0000-4000-8000-000000000ccc');

-- rls_ledger_events_stranger_zero_rows + cross-group isolation
do $$ declare n int; begin
  select count(*) into n from public.ledger_events
    where group_id = '00000000-0000-4000-8000-000000000901';
  if n <> 0 then raise exception 'TEST FAIL rls_ledger_events_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.ledger_events;
  if n <> 1 then raise exception 'TEST FAIL cross_group_isolation_ledger: got % rows', n; end if;
end $$;

-- ledger_events_insert_by_non_member_denied
do $$ begin
  begin
    insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
      ('00000000-0000-4000-8000-000000000901', 9, 'expense',
       '00000000-0000-4000-8000-000000000ccc', 100,
       array['00000000-0000-4000-8000-000000000ccc']::uuid[],
       '00000000-0000-4000-8000-000000000ccc');
    raise exception 'TEST FAIL ledger_events_insert_by_non_member_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- member B sees the log, cannot rewrite it, and can settle as themselves
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.ledger_events;
  if n <> 1 then raise exception 'TEST FAIL member_sees_ledger: got % rows', n; end if;
end $$;

-- ledger_events_update_denied / delete / truncate: grant-level, errors
do $$ begin
  begin
    update public.ledger_events set amount_paise = 1;
    raise exception 'TEST FAIL ledger_events_update_denied: update succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ledger_events;
    raise exception 'TEST FAIL ledger_events_delete_denied: delete succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.ledger_events;
    raise exception 'TEST FAIL ledger_events_truncate_denied: truncate succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.ledger_events (group_id, seq, type, payer_id, amount_paise, participant_ids, created_by) values
  ('00000000-0000-4000-8000-000000000901', 2, 'settlement',
   '00000000-0000-4000-8000-000000000bbb', 30000,
   array['00000000-0000-4000-8000-000000000aaa']::uuid[],
   '00000000-0000-4000-8000-000000000bbb');

rollback;
\echo rls_ledger: all tests passed
