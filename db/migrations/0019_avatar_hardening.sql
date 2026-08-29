-- Avatar hardening (0018 security review): the bucket itself refuses
-- anything but real image types and oversized files - the client checks
-- are courtesy, this is the boundary. The photo shape pins to exactly
-- what the app writes (uuid folder, millisecond name, image extension),
-- which also closes the '..' the old regex admitted.
begin;

update storage.buckets
  set file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'avatars';

alter table public.profiles drop constraint profiles_avatar_shape;
alter table public.profiles add constraint profiles_avatar_shape check (
  avatar is null
  or avatar ~ '^preset:[a-z0-9-]+$'
  or avatar ~ '^photo:[0-9a-f-]{36}/[0-9]+\.(jpg|png|webp)$'
);

commit;
