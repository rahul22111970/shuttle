-- RLS proof for 0014: a co-captain adds and removes members; only the
-- owner promotes; a plain member can do none of it. Rolls itself back.
\set ON_ERROR_STOP on
begin;

-- fixtures: owner o, co-captain c, member m, outsider x
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated', 'o@cocap.test'),
  ('00000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated', 'c@cocap.test'),
  ('00000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated', 'm@cocap.test'),
  ('00000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated', 'x@cocap.test');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-a000-000000000001', 'Owner', 'player'),
  ('00000000-0000-4000-a000-000000000002', 'Cocap', 'player'),
  ('00000000-0000-4000-a000-000000000003', 'Member', 'player'),
  ('00000000-0000-4000-a000-000000000004', 'Extra', 'player');
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-b000-000000000001', 'Cocap Gang', '00000000-0000-4000-a000-000000000001');
insert into public.group_members (group_id, player_id, is_captain) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', false),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002', true),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003', false);

set local role authenticated;

-- cocaptain_adds_member
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}';
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004');
do $$ begin
  if not exists (select 1 from public.group_members
    where group_id = '00000000-0000-4000-b000-000000000001'
      and player_id = '00000000-0000-4000-a000-000000000004') then
    raise exception 'TEST FAIL cocaptain_adds_member';
  end if;
end $$;

-- cocaptain_removes_member
delete from public.group_members
  where group_id = '00000000-0000-4000-b000-000000000001'
    and player_id = '00000000-0000-4000-a000-000000000004';
do $$ begin
  if exists (select 1 from public.group_members
    where group_id = '00000000-0000-4000-b000-000000000001'
      and player_id = '00000000-0000-4000-a000-000000000004') then
    raise exception 'TEST FAIL cocaptain_removes_member';
  end if;
end $$;

-- cocaptain_cannot_promote: RLS update policies filter, so 0 rows move
update public.group_members set is_captain = true
  where group_id = '00000000-0000-4000-b000-000000000001'
    and player_id = '00000000-0000-4000-a000-000000000003';
do $$ begin
  if exists (select 1 from public.group_members
    where player_id = '00000000-0000-4000-a000-000000000003' and is_captain) then
    raise exception 'TEST FAIL cocaptain_cannot_promote';
  end if;
end $$;

-- member_cannot_add
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}';
do $$ begin
  begin
    insert into public.group_members (group_id, player_id) values
      ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000004');
    raise exception 'TEST FAIL member_cannot_add: insert succeeded';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- owner_promotes
set local request.jwt.claims to '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}';
update public.group_members set is_captain = true
  where group_id = '00000000-0000-4000-b000-000000000001'
    and player_id = '00000000-0000-4000-a000-000000000003';
do $$ begin
  if not exists (select 1 from public.group_members
    where player_id = '00000000-0000-4000-a000-000000000003' and is_captain) then
    raise exception 'TEST FAIL owner_promotes';
  end if;
end $$;

reset role;
select 'rls_cocaptains: all tests passed';
rollback;
