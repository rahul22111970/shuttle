-- S1-18: the money log. Expenses and settlements as rows nobody rewrites;
-- balances are computed client-side by @shuttle/split (decision 15), whose
-- fold is additive and permutation-invariant, so seq here is display
-- order, not arithmetic order — non-unique and caller-computed like
-- session_events, unlike match_events.
--
-- Shape conventions the api layer relies on:
--   expense: payer_id paid amount_paise, split across participant_ids
--   settlement: payer_id handed amount_paise to exactly participant_ids[1]
begin;

-- CHECKs cannot subquery; a tiny immutable helper carries the dedup rule.
-- One duplicate participant would permanently poison a group's balances:
-- @shuttle/split hard-throws on duplicates and this log is immutable.
create function public.uuid_array_is_distinct(ids uuid[])
returns boolean
language sql
immutable
as $$
  select cardinality(ids) = (select count(distinct x) from unnest(ids) x);
$$;

create table public.ledger_events (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  session_id      uuid references public.sessions (id) on delete set null,
  seq             integer not null,
  type            text not null check (type in ('expense', 'settlement')),
  -- known gap, same as groups.captain_id (0002): no on-delete path until
  -- the account-deletion slice
  payer_id        uuid not null references public.profiles (id),
  amount_paise    integer not null check (amount_paise > 0),
  -- uuid[] cannot carry FKs; membership of participants is the api's
  -- lookup concern, and @shuttle/split treats ids as opaque names
  participant_ids uuid[] not null
                  check (array_length(participant_ids, 1) >= 1)
                  check (public.uuid_array_is_distinct(participant_ids)),
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  -- a settlement flows to exactly one person, and never to the payer
  check (
    type <> 'settlement'
    or (array_length(participant_ids, 1) = 1 and participant_ids[1] <> payer_id)
  )
);

create index ledger_events_group_id_seq_idx on public.ledger_events (group_id, seq);

alter table public.ledger_events enable row level security;

-- append-only at the grant level: the S1-08 lesson, every privilege by name
revoke update, delete, truncate on table public.ledger_events from anon, authenticated;

create policy ledger_events_member_select on public.ledger_events
  for select to authenticated
  using (public.is_group_member(group_id));

-- members write money events, and only as themselves: created_by is the
-- writer, though payer_id may name whoever actually opened their wallet
-- payer must belong to the group: the same no-strangers rule 0005 enforces
-- for match participants, applied to whoever opened their wallet
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
  );

commit;
