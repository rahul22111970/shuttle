-- S1-09 (db half): the one write path for session events. The S1-08 review
-- handed this slice the same-actor seq race: seq is caller-computed and
-- non-unique, so two rapid taps could tie on (seq, created_at) and leave
-- replay order to a UUID coin flip. This RPC serialises writers per session
-- with an advisory lock and computes seq server-side.
--
-- SECURITY INVOKER (the default) on purpose: RLS still decides who may
-- insert; the lock only decides in what order.
--
-- Known gap, deliberate (S1-09 review): direct INSERT on session_events
-- stays policy-legal alongside this RPC. The api module is the only writer
-- in P1; revoking INSERT would force SECURITY DEFINER here, and offline
-- sync (P3) needs its own path regardless.
begin;

create function public.append_session_event(
  p_session_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.session_events
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  next_seq integer;
  result public.session_events;
begin
  -- one writer per session at a time; released at transaction end
  perform pg_advisory_xact_lock(hashtext(p_session_id::text));
  select coalesce(max(seq), 0) + 1 into next_seq
    from public.session_events
    where session_id = p_session_id;
  insert into public.session_events (session_id, seq, type, actor_id, payload)
    values (p_session_id, next_seq, p_type, auth.uid(), p_payload)
    returning * into result;
  return result;
end;
$$;

-- the S1-07 lesson, applied by name: default privileges grant EXECUTE to
-- anon at creation; strip it
revoke execute on function public.append_session_event(uuid, text, jsonb) from public, anon;
grant execute on function public.append_session_event(uuid, text, jsonb) to authenticated;

commit;
