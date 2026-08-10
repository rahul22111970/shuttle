-- RLS proof for 0015: the logger deletes their own recent match, a captain
-- deletes anyone's, a plain member deletes nothing, and an old match is
-- immovable by everyone. Rolls itself back.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-c000-000000000001', 'authenticated', 'authenticated', 'cap@undo.test'),
  ('00000000-0000-4000-c000-000000000002', 'authenticated', 'authenticated', 'log@undo.test'),
  ('00000000-0000-4000-c000-000000000003', 'authenticated', 'authenticated', 'mem@undo.test');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-c000-000000000001', 'Cap', 'player'),
  ('00000000-0000-4000-c000-000000000002', 'Logger', 'player'),
  ('00000000-0000-4000-c000-000000000003', 'Member', 'player');
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-d000-000000000001', 'Undo Gang', '00000000-0000-4000-c000-000000000001');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000001'),
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000002'),
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-000000000003');
-- fresh match by Logger, old match by Logger
insert into public.matches (id, group_id, status, config, created_by, created_at) values
  ('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-d000-000000000001',
   'complete', '{}'::jsonb, '00000000-0000-4000-c000-000000000002', now()),
  ('00000000-0000-4000-e000-000000000002', '00000000-0000-4000-d000-000000000001',
   'complete', '{}'::jsonb, '00000000-0000-4000-c000-000000000002', now() - interval '72 hours'),
  ('00000000-0000-4000-e000-000000000003', '00000000-0000-4000-d000-000000000001',
   'complete', '{}'::jsonb, '00000000-0000-4000-c000-000000000002', now());

set local role authenticated;

-- member_deletes_nothing: RLS delete policies filter, so 0 rows go
set local request.jwt.claims to '{"sub":"00000000-0000-4000-c000-000000000003","role":"authenticated"}';
delete from public.matches where id = '00000000-0000-4000-e000-000000000001';
do $$ begin
  if not exists (select 1 from public.matches where id = '00000000-0000-4000-e000-000000000001') then
    raise exception 'TEST FAIL member_deletes_nothing';
  end if;
end $$;

-- logger_deletes_own_fresh
set local request.jwt.claims to '{"sub":"00000000-0000-4000-c000-000000000002","role":"authenticated"}';
delete from public.matches where id = '00000000-0000-4000-e000-000000000001';
do $$ begin
  if exists (select 1 from public.matches where id = '00000000-0000-4000-e000-000000000001') then
    raise exception 'TEST FAIL logger_deletes_own_fresh';
  end if;
end $$;

-- old_match_immovable: even the logger cannot touch a 72-hour-old match
delete from public.matches where id = '00000000-0000-4000-e000-000000000002';
do $$ begin
  if not exists (select 1 from public.matches where id = '00000000-0000-4000-e000-000000000002') then
    raise exception 'TEST FAIL old_match_immovable';
  end if;
end $$;

-- captain_deletes_anyones_fresh
set local request.jwt.claims to '{"sub":"00000000-0000-4000-c000-000000000001","role":"authenticated"}';
delete from public.matches where id = '00000000-0000-4000-e000-000000000003';
do $$ begin
  if exists (select 1 from public.matches where id = '00000000-0000-4000-e000-000000000003') then
    raise exception 'TEST FAIL captain_deletes_anyones_fresh';
  end if;
end $$;

reset role;
select 'rls_match_undo: all tests passed';
rollback;
