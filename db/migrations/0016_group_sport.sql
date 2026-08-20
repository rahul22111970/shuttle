-- 0016: a group plays one sport. Badminton is the default so every existing
-- row and every existing client keep working untouched; pickleball groups
-- differ only in their scoring rules and their words, never their spine.
-- Sport is fixed at creation on purpose: a group's whole ladder, ledger and
-- game log is one sport's history, and re-labelling it would silently
-- rewrite what those numbers mean.
begin;

alter table public.groups
  add column sport text not null default 'badminton'
  check (sport in ('badminton', 'pickleball'));

commit;
