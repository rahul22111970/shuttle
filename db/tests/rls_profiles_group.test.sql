-- Proof for the co-member profiles policy: sharing a group opens the name,
-- a stranger stays blind, and the owner path is untouched. One rolled-back
-- transaction.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000aaa', 'authenticated', 'authenticated', 'rls-pg-a@test.local'),
  ('00000000-0000-4000-8000-000000000bbb', 'authenticated', 'authenticated', 'rls-pg-b@test.local'),
  ('00000000-0000-4000-8000-000000000ccc', 'authenticated', 'authenticated', 'rls-pg-c@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-000000000aaa', 'Captain A', 'player'),
  ('00000000-0000-4000-8000-000000000bbb', 'Member B', 'player'),
  ('00000000-0000-4000-8000-000000000ccc', 'Stranger C', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000aaa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-000000000901', 'Name Gang', '00000000-0000-4000-8000-000000000aaa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000aaa'),
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000bbb');

-- co_member_sees_name: B reads A's display name
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n text; begin
  select display_name into n from public.profiles
    where id = '00000000-0000-4000-8000-000000000aaa';
  if n is distinct from 'Captain A' then
    raise exception 'TEST FAIL co_member_sees_name: got %', n;
  end if;
end $$;

-- member_sees_exactly_group: B sees self + A, not C
do $$ declare n int; begin
  select count(*) into n from public.profiles;
  if n <> 2 then raise exception 'TEST FAIL member_sees_exactly_group: got % rows', n; end if;
end $$;

-- rls_profiles_stranger_still_zero: C shares no group, sees only self
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000ccc","role":"authenticated"}';
do $$ declare n int; begin
  select count(*) into n from public.profiles
    where id <> '00000000-0000-4000-8000-000000000ccc';
  if n <> 0 then raise exception 'TEST FAIL rls_profiles_stranger_still_zero: got % rows', n; end if;
end $$;

-- co_member_cannot_update: select widened, write path untouched
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000bbb","role":"authenticated"}';
do $$ declare n int; begin
  update public.profiles set display_name = 'Forged'
    where id = '00000000-0000-4000-8000-000000000aaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'TEST FAIL co_member_cannot_update: % rows', n; end if;
end $$;

-- shares_group_with_anon_revoked: the S1-07 lesson, asserted from catalog
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.shares_group_with(uuid)', 'execute') then
    raise exception 'TEST FAIL shares_group_with_anon_revoked';
  end if;
end $$;

rollback;
\echo rls_profiles_group: all tests passed
