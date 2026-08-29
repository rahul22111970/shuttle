-- Avatars: a profile carries either a named preset ('preset:bolt') or a
-- path into the public avatars bucket ('photo:<uid>/<ts>.jpg'). Photos
-- upload to a per-user folder; the folder name IS the authorisation - a
-- user can only write inside their own uid. The bucket is public-read by
-- design (avatar URLs are guessable-by-uid, same trade every consumer
-- app makes); nothing else in the app stores private media there.
begin;

alter table public.profiles add column avatar text
  constraint profiles_avatar_shape check (
    avatar is null or avatar ~ '^(preset:[a-z0-9-]+|photo:[A-Za-z0-9/._-]+)$'
  );

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- write only inside your own folder; uploads are timestamp-named so there
-- is no overwrite path and insert is the only verb clients need
create policy avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
