-- S1-13: the atomic append-and-snapshot RPC, the event-sourcing keystone.
-- One transaction: event inserted at exactly expected_seq, snapshot written
-- beside it. The snapshot arrives FROM THE CLIENT, computed by
-- @shuttle/score; SQL reads one boolean off it and never re-implements
-- scoring. SECURITY INVOKER: RLS still decides membership and scorer
-- honesty; the lock (two-arg form per the S1-09 review, so match locks and
-- session locks cannot collide) only decides order.
--
-- Distinctive error codes the api layer types on:
--   SH001 stale expected_seq   SH002 match not live   SH404 match invisible
begin;

create function public.append_match_event(
  p_match_id uuid,
  p_expected_seq integer,
  p_event jsonb,
  p_snapshot jsonb
)
returns public.match_events
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  current_max integer;
  m_status text;
  result public.match_events;
begin
  perform pg_advisory_xact_lock(hashtext('match_events'), hashtext(p_match_id::text));

  select status into m_status from public.matches where id = p_match_id;
  if m_status is null then
    -- invisible and missing look identical on purpose: no existence oracle
    raise exception 'match not found' using errcode = 'SH404';
  end if;
  if m_status <> 'live' then
    raise exception 'match is not live' using errcode = 'SH002';
  end if;

  select coalesce(max(seq), 0) into current_max
    from public.match_events where match_id = p_match_id;
  if p_expected_seq <> current_max + 1 then
    raise exception 'stale seq: next is %, got %', current_max + 1, p_expected_seq
      using errcode = 'SH001';
  end if;

  insert into public.match_events (match_id, seq, type, side, scorer_id, payload)
    values (
      p_match_id,
      p_expected_seq,
      p_event->>'type',
      p_event->>'side',
      auth.uid(),
      coalesce(p_event->'payload', '{}'::jsonb)
    )
    returning * into result;

  -- unlock the matches update policy for this transaction only; clients
  -- cannot reach set_config through PostgREST, so this path is RPC-only
  perform set_config('shuttle.rpc', 'append_match_event', true);
  -- completion is trust-based until S1-14's replay-equality check lands:
  -- decision 12's posture (small trusted groups, client-computed, revisit
  -- at P2 when strangers' events write ratings)
  update public.matches
    set snapshot = p_snapshot,
        status = case
          when (p_snapshot->>'finished')::boolean then 'complete'
          else status
        end
    where id = p_match_id;
  -- close the window immediately: within one transaction (psql tests, any
  -- future multi-statement caller) the flag must not outlive the one
  -- update it authorises
  perform set_config('shuttle.rpc', '', true);

  return result;
end;
$$;

revoke execute on function public.append_match_event(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.append_match_event(uuid, integer, jsonb, jsonb) to authenticated;

-- the S1-11-endorsed shape: column-scoped re-grant caps the blast radius at
-- the privilege layer even if the policy logic were wrong
grant update (snapshot, status) on public.matches to authenticated;

create policy matches_rpc_update on public.matches
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (
    public.is_group_member(group_id)
    and current_setting('shuttle.rpc', true) = 'append_match_event'
  );

-- the S1-12 carry: completion is now reachable, so direct event inserts
-- gate on the match being live, same as the RPC does
drop policy match_events_member_insert on public.match_events;
create policy match_events_member_insert on public.match_events
  for insert to authenticated
  with check (
    scorer_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and public.is_group_member(m.group_id)
        and m.status = 'live'
    )
  );

commit;
