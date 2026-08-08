-- S1-19.1: the phantom-payee fix, required before S1-20 exposes
-- settlement entry. The log is immutable and the payer-membership policy
-- blocks any compensating event naming a phantom as payer, so money
-- recorded to a non-member is uncorrectable forever. Every participant —
-- expense shares and settlement payees alike — must belong to the group.
begin;

-- SECURITY INVOKER on purpose: the writer is a member, so group_members
-- RLS shows them their whole group, which is exactly the set to check.
create function public.uuid_array_all_members(gid uuid, ids uuid[])
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select not exists (
    select 1 from unnest(ids) as x(player)
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = gid and gm.player_id = x.player
    )
  );
$$;

revoke execute on function public.uuid_array_all_members(uuid, uuid[]) from public, anon;
grant execute on function public.uuid_array_all_members(uuid, uuid[]) to authenticated;

drop policy ledger_events_member_insert on public.ledger_events;
create policy ledger_events_member_insert on public.ledger_events
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = ledger_events.group_id
        and gm.player_id = payer_id
    )
    and public.uuid_array_all_members(group_id, participant_ids)
  );

commit;
