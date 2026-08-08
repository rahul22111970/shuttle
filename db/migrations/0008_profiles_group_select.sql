-- S1-17 (db half): the S0-08 ceiling comes due. Rosters, round cards and
-- standings all show co-members' names, but profiles select was owner-only,
-- so every other member rendered as "Player". Group co-members may now see
-- each other's profile rows; strangers still see nothing.
begin;

-- do I share at least one group with the target? SECURITY DEFINER breaks
-- the profiles -> group_members -> (policies) loop the same way
-- is_group_member does (0002).
create function public.shares_group_with(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.player_id = auth.uid()
      and theirs.player_id = target
  );
$$;

-- the S1-07 lesson: default privileges hand anon EXECUTE at creation
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.shares_group_with(uuid) to authenticated;

-- Whole-row exposure to co-members is deliberate: phone is the point in a
-- badminton circle, and S1-20's ledger needs the captain's upi_vpa visible
-- to debtors. A column-restricted view is the narrowing path if a slice
-- ever needs one.
create policy profiles_co_member_select on public.profiles
  for select to authenticated
  using (public.shares_group_with(id));

commit;
