-- 0013: every group carries its own sign-in code. This retires the single
-- app-wide PILOT_CODE: pilot-login now matches the typed code against the
-- groups the phone's owner belongs to, so a code only ever opens accounts
-- inside its own group. The volatile default gives every existing and
-- future row its own random six characters.
begin;

alter table public.groups
  add column code text not null default lower(substr(md5(random()::text), 1, 6));

commit;
