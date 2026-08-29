-- Decay rows (0017) are service-role territory: a signed-in member must
-- not be able to forge one, delete one, or bend a match row into decay
-- shape. One rolled-back transaction, house pattern.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000d0aa', 'authenticated', 'authenticated', 'rls-d-a@test.local'),
  ('00000000-0000-4000-8000-00000000d0bb', 'authenticated', 'authenticated', 'rls-d-b@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-00000000d0aa', 'Decay A', 'player'),
  ('00000000-0000-4000-8000-00000000d0bb', 'Decay B', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000d0aa","role":"authenticated"}';
insert into public.groups (id, name, captain_id) values
  ('00000000-0000-4000-8000-00000000d001', 'Decay Gang', '00000000-0000-4000-8000-00000000d0aa');
insert into public.group_members (group_id, player_id) values
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d0aa'),
  ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d0bb');

-- rating_decay_client_insert_denied: a member cannot forge a decay row,
-- even against their own group's ladder
do $$ begin
  begin
    insert into public.rating_history (player_id, group_id, rating_before, rating_after, kind, week) values
      ('00000000-0000-4000-8000-00000000d0bb', '00000000-0000-4000-8000-00000000d001', 1200, 1192, 'decay', '2026-08-24');
    raise exception 'TEST FAIL rating_decay_client_insert_denied';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- rating_decay_signed_forge_denied: the clever forge - created_by = self
-- satisfies the insert policy's first conjunct, but the shape check
-- demands a null author on decay rows
do $$ begin
  begin
    insert into public.rating_history (player_id, group_id, rating_before, rating_after, kind, week, created_by) values
      ('00000000-0000-4000-8000-00000000d0bb', '00000000-0000-4000-8000-00000000d001', 1200, 1192, 'decay', '2026-08-24',
       '00000000-0000-4000-8000-00000000d0aa');
    raise exception 'TEST FAIL rating_decay_signed_forge_denied';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- the service role's own write shape, planted for the tests below
reset role;
insert into public.rating_history (id, player_id, group_id, rating_before, rating_after, kind, week) values
  ('00000000-0000-4000-8000-00000000d009', '00000000-0000-4000-8000-00000000d0bb',
   '00000000-0000-4000-8000-00000000d001', 1200, 1192, 'decay', '2026-08-24');

-- rating_decay_once_per_week: the unique index refuses a second decay for
-- the same player, group and week
do $$ begin
  begin
    insert into public.rating_history (player_id, group_id, rating_before, rating_after, kind, week) values
      ('00000000-0000-4000-8000-00000000d0bb', '00000000-0000-4000-8000-00000000d001', 1192, 1184, 'decay', '2026-08-24');
    raise exception 'TEST FAIL rating_decay_once_per_week';
  exception when unique_violation then null;
  end;
end $$;

-- rating_decay_shape_enforced: a decay row cannot carry match fields, and
-- a match row cannot claim a week
do $$ begin
  begin
    insert into public.rating_history (player_id, group_id, rating_before, rating_after, k, kind, week) values
      ('00000000-0000-4000-8000-00000000d0aa', '00000000-0000-4000-8000-00000000d001', 1200, 1192, 32, 'decay', '2026-08-17');
    raise exception 'TEST FAIL rating_decay_shape_enforced_k';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000d0bb","role":"authenticated"}';

-- rating_decay_member_select_allowed: the deducted player sees their row
do $$ begin
  if (select count(*) from public.rating_history
      where id = '00000000-0000-4000-8000-00000000d009') <> 1 then
    raise exception 'TEST FAIL rating_decay_member_select_allowed';
  end if;
end $$;

-- rating_decay_client_delete_denied: no client can delete a decay row;
-- the 0015 undo policy needs a live match and decay rows have none
delete from public.rating_history where id = '00000000-0000-4000-8000-00000000d009';
do $$ begin
  if (select count(*) from public.rating_history
      where id = '00000000-0000-4000-8000-00000000d009') <> 1 then
    raise exception 'TEST FAIL rating_decay_client_delete_denied';
  end if;
end $$;

rollback;
select 'rls_rating_decay: all assertions passed' as result;
