-- Avatars (0018): the folder name is the authorisation. A user writes
-- inside their own uid folder, never anyone else's; the avatar column
-- only accepts the two shapes the app writes. Rolled back, house pattern.
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000a0aa', 'authenticated', 'authenticated', 'rls-av-a@test.local'),
  ('00000000-0000-4000-8000-00000000a0bb', 'authenticated', 'authenticated', 'rls-av-b@test.local');
insert into public.profiles (id, display_name, account_type) values
  ('00000000-0000-4000-8000-00000000a0aa', 'Ava A', 'player'),
  ('00000000-0000-4000-8000-00000000a0bb', 'Ava B', 'player');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-00000000a0aa","role":"authenticated"}';

-- avatars_own_folder_insert_allowed
insert into storage.objects (bucket_id, name, owner_id) values
  ('avatars', '00000000-0000-4000-8000-00000000a0aa/1.jpg', '00000000-0000-4000-8000-00000000a0aa');

-- avatars_foreign_folder_insert_denied: A cannot write into B's folder
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, owner_id) values
      ('avatars', '00000000-0000-4000-8000-00000000a0bb/1.jpg', '00000000-0000-4000-8000-00000000a0aa');
    raise exception 'TEST FAIL avatars_foreign_folder_insert_denied';
  exception when insufficient_privilege then null;
  end;
end $$;

-- avatars_rootfile_insert_denied: no folder, no write
do $$ begin
  begin
    insert into storage.objects (bucket_id, name, owner_id) values
      ('avatars', 'loose.jpg', '00000000-0000-4000-8000-00000000a0aa');
    raise exception 'TEST FAIL avatars_rootfile_insert_denied';
  exception when insufficient_privilege then null;
  end;
end $$;

-- profiles_avatar_shape: presets and photos in, junk out
update public.profiles set avatar = 'preset:bolt'
  where id = '00000000-0000-4000-8000-00000000a0aa';
update public.profiles set avatar = 'photo:00000000-0000-4000-8000-00000000a0aa/1.jpg'
  where id = '00000000-0000-4000-8000-00000000a0aa';
do $$ begin
  begin
    update public.profiles set avatar = 'javascript:alert(1)'
      where id = '00000000-0000-4000-8000-00000000a0aa';
    raise exception 'TEST FAIL profiles_avatar_shape';
  exception when check_violation then null;
  end;
end $$;

-- profiles_avatar_no_traversal (0019): a photo path cannot climb out
do $$ begin
  begin
    update public.profiles set avatar = 'photo:../../etc/passwd.jpg'
      where id = '00000000-0000-4000-8000-00000000a0aa';
    raise exception 'TEST FAIL profiles_avatar_no_traversal';
  exception when check_violation then null;
  end;
end $$;

rollback;
select 'rls_avatars: all assertions passed' as result;
