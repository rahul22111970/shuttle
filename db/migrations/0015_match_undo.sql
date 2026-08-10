-- 0015: voice logging needs an undo. The person who logged a game (or any
-- captain of its group) can delete it within 48 hours; events and
-- participants cascade, rating rows are deleted first by the client which
-- then rebuilds the participants' ladders. Old history stays immutable.
begin;

-- 0005 revoked DELETE at the grant level so it would error loudly rather
-- than filter. The undo needs the grant back; the policies below are the
-- gate. rating_history never had its delete revoked, only policy-gated.
grant delete on table public.matches to authenticated;
grant delete on table public.rating_history to authenticated;

create policy matches_undo_delete on public.matches
  for delete to authenticated
  using (
    (created_by = (select auth.uid()) or public.is_group_captain(group_id))
    and created_at > now() - interval '48 hours'
  );

create policy rating_history_undo_delete on public.rating_history
  for delete to authenticated
  using (exists (
    select 1 from public.matches m
    where m.id = match_id
      and (m.created_by = (select auth.uid()) or public.is_group_captain(m.group_id))
      and m.created_at > now() - interval '48 hours'
  ));

commit;
