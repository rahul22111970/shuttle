-- RLS proof for groups and group_members. One transaction, rolled back:
-- no residue on the shared hosted DB. Roles are switched before every
-- assertion because postgres owns the tables and bypasses RLS.
\set ON_ERROR_STOP on
begin;

-- fixtures: captain A, member B, stranger C
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-g-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-g-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-g-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

-- rls_groups_enabled / rls_group_members_enabled: catalog says RLS is on
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.groups'::regclass) then
    raise exception 'TEST FAIL rls_groups_enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.group_members'::regclass) then
    raise exception 'TEST FAIL rls_group_members_enabled';
  end if;
end $$;

-- A creates the group and adds A and B: proves any authed user creates as
-- captain, and the captain-insert policy, in one stroke
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Tuesday Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');

-- groups_insert_wrong_captain_denied: A cannot create a group captained by B
do $$ begin
  begin
    insert into public.groups (name, captain_id) values
      ('Impostor Gang', '00000000-0000-4000-8000-000000000bbb');
    raise exception 'TEST FAIL groups_insert_wrong_captain_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- rls_groups_stranger_zero_rows / rls_group_members_stranger_zero_rows
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.groups;
  if n <> 0 then raise exception 'TEST FAIL rls_groups_stranger_zero_rows: got % rows', n; end if;
  select count(*) into n from public.group_members;
  if n <> 0 then raise exception 'TEST FAIL rls_group_members_stranger_zero_rows: got % rows', n; end if;
end $$;

-- member_sees_group_and_comembers: B is not the captain but sees the group
-- row and both membership rows
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.groups;
  if n <> 1 then raise exception 'TEST FAIL member_sees_group: got % rows', n; end if;
  select count(*) into n from public.group_members;
  if n <> 2 then raise exception 'TEST FAIL member_sees_comembers: got % rows', n; end if;
end $$;

-- group_members_insert_by_non_captain_denied: B tries to add C
do $$ begin
  begin
    insert into public.group_members (group_id, player_id) values
      ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000ccc');
    raise exception 'TEST FAIL group_members_insert_by_non_captain_denied: insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- group_members_delete_by_non_captain_denied: RLS delete policies filter
-- rather than error, so B deleting A's membership must affect zero rows
do $$ declare n int; begin
  delete from public.group_members
    where group_id = '00000000-0000-4000-8000-000000000901'
      and player_id = '00000000-0000-4000-8000-000000000aaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST FAIL group_members_delete_by_non_captain_denied: deleted % rows', n; end if;
end $$;

-- captain_removes_member: A removes B, one row gone
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
do $$ declare n int; begin
  delete from public.group_members
    where group_id = '00000000-0000-4000-8000-000000000901'
      and player_id = '00000000-0000-4000-8000-000000000bbb';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'TEST FAIL captain_removes_member: deleted % rows', n; end if;
end $$;

rollback;
\echo rls_groups: all tests passed
