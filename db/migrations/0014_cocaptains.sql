-- 0014: co-captains. groups.captain_id stays the OWNER — only they wipe
-- data and promote or demote. group_members.is_captain grants the day-to-day
-- powers: add players, remove members, run and cancel nights.
begin;

alter table public.group_members
  add column is_captain boolean not null default false;

-- Captaincy test used inside policies. SECURITY DEFINER like
-- is_group_member (0002): a group_members policy querying group_members
-- under RLS would recurse.
create function public.is_group_captain(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = gid and captain_id = auth.uid()
  ) or exists (
    select 1 from public.group_members
    where group_id = gid and player_id = auth.uid() and is_captain
  );
$$;
revoke execute on function public.is_group_captain(uuid) from public, anon;
grant execute on function public.is_group_captain(uuid) to authenticated;

-- membership powers now include co-captains
drop policy group_members_captain_insert on public.group_members;
create policy group_members_captain_insert on public.group_members
  for insert to authenticated
  with check (public.is_group_captain(group_id));

drop policy group_members_captain_delete on public.group_members;
create policy group_members_captain_delete on public.group_members
  for delete to authenticated
  using (public.is_group_captain(group_id));

-- only the owner flips is_captain
create policy group_members_owner_update on public.group_members
  for update to authenticated
  using (exists (
    select 1 from public.groups g
    where g.id = group_id and g.captain_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.groups g
    where g.id = group_id and g.captain_id = (select auth.uid())
  ));

commit;
