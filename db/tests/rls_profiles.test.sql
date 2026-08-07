-- RLS proof for profiles. Runs against the shared hosted DB, so everything
-- happens inside one transaction that rolls back: no cleanup, no residue.
-- Each named test raises on failure; ON_ERROR_STOP makes psql exit nonzero.
\set ON_ERROR_STOP on
begin;

-- fixtures: two auth users; A has a profile, seeded as postgres (table owner
-- bypasses RLS, which is exactly why every check below switches role first)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-0000000000aa', 'authenticated', 'authenticated', 'rls-a@test.local'),
  ('00000000-0000-4000-8000-0000000000bb', 'authenticated', 'authenticated', 'rls-b@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-0000000000aa', 'User A', 'player');

-- rls_profiles_enabled: catalog says row security is on
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'TEST FAIL rls_profiles_enabled';
  end if;
end $$;

-- become user B
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000bb","role":"authenticated"}';

-- rls_profiles_stranger_zero_rows: B selecting A's row gets nothing
do $$ declare n int; begin
  select count(*) into n from public.profiles
    where id = '00000000-0000-4000-8000-0000000000aa';
  if n <> 0 then raise exception 'TEST FAIL rls_profiles_stranger_zero_rows: got % rows', n; end if;
end $$;

-- rls_profiles_insert_wrong_id_denied: B inserting a row under A's id errors
do $$ begin
  begin
    insert into public.profiles (id, display_name, account_type) values
      ('00000000-0000-4000-8000-0000000000aa', 'Impostor', 'player');
    raise exception 'TEST FAIL rls_profiles_insert_wrong_id_denied: insert succeeded';
  exception when insufficient_privilege then null; -- 42501, the expected RLS rejection
  end;
end $$;

-- rls_profiles_owner_insert: B inserting B's own row succeeds (the upsert policy works)
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-0000000000bb', 'User B', 'organiser');

-- become user A
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-0000000000aa","role":"authenticated"}';

-- rls_profiles_owner_reads_own_row: A sees exactly A's row
do $$ declare n int; begin
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'TEST FAIL rls_profiles_owner_reads_own_row: got % rows', n; end if;
end $$;

rollback;
\echo rls_profiles: all tests passed
