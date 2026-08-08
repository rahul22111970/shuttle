import { supabase } from "./supabase";

export type Group = {
  id: string;
  name: string;
  captain_id: string;
  created_at: string;
};

export type Session = {
  id: string;
  group_id: string;
  starts_at: string;
  status: "planned" | "live" | "closed";
  created_at: string;
};

export type SessionEventType =
  | "rsvp_in"
  | "rsvp_out"
  | "check_in"
  | "round_generated"
  | "session_closed";

export type SessionEvent = {
  id: string;
  session_id: string;
  seq: number;
  type: SessionEventType;
  actor_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("not signed in");
  return data.user.id;
}

// Creates the group and seats the creator as captain AND first member, so
// the captain is never invisible in their own roster (S1-07 review note).
// ponytail: two statements, no transaction; a crash between them orphans a
// captain-only group that is visible but unusable. Move to a create_group
// RPC when it bites.
export async function createGroup(name: string): Promise<Group> {
  const uid = await currentUserId();
  const { data, error } = await supabase
    .from("groups")
    .insert({ name, captain_id: uid })
    .select()
    .single<Group>();
  if (error) throw error;
  const membership = await supabase
    .from("group_members")
    .insert({ group_id: data.id, player_id: uid });
  if (membership.error) throw membership.error;
  return data;
}

export async function createSession(groupId: string, startsAt: string): Promise<Session> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ group_id: groupId, starts_at: startsAt })
    .select()
    .single<Session>();
  if (error) throw error;
  return data;
}

// Every session-event write goes through the RPC: server-computed seq,
// advisory-lock serialisation, actor always the caller. No direct inserts.
export async function appendSessionEvent(
  sessionId: string,
  type: SessionEventType,
  payload: Record<string, unknown> = {}
): Promise<SessionEvent> {
  const { data, error } = await supabase
    .rpc("append_session_event", {
      p_session_id: sessionId,
      p_type: type,
      p_payload: payload,
    })
    .single<SessionEvent>();
  if (error) throw error;
  return data;
}

export const rsvpIn = (sessionId: string) => appendSessionEvent(sessionId, "rsvp_in");
// forPlayer marks SOMEONE ELSE (stub players cannot sign in; whoever holds
// a phone marks arrivals). The actor stays honest — actor_id is the writer,
// the subject rides in the payload and replay reads it there.
export const rsvpOut = (sessionId: string, forPlayer?: string) =>
  appendSessionEvent(sessionId, "rsvp_out", forPlayer ? { player_id: forPlayer } : {});
export const checkIn = (sessionId: string, forPlayer?: string) =>
  appendSessionEvent(sessionId, "check_in", forPlayer ? { player_id: forPlayer } : {});

// The close is an event first (the log is the truth) and a status flip
// second (the plain-row projection the session list reads).
export async function closeSession(sessionId: string): Promise<void> {
  await appendSessionEvent(sessionId, "session_closed");
  const { error } = await supabase
    .from("sessions")
    .update({ status: "closed" })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function fetchSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const { data, error } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", sessionId)
    .order("seq", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SessionEvent[];
}

export type Roster = {
  attending: readonly string[];
  checkedIn: readonly string[];
};

// Pure replay: rsvp_in adds, rsvp_out removes (and un-checks), check_in
// implies attendance. The canonical (seq, created_at, id) sort lives HERE
// (S1-09 review carry): realtime and any other caller deliver events in
// arrival order, and replay must not depend on who fetched.
export function rosterFromEvents(events: readonly SessionEvent[]): Roster {
  const ordered = [...events].sort(
    (x, y) =>
      x.seq - y.seq ||
      x.created_at.localeCompare(y.created_at) ||
      x.id.localeCompare(y.id)
  );
  const attending = new Set<string>();
  const checkedIn = new Set<string>();
  for (const event of ordered) {
    // the subject defaults to the actor; a payload player_id marks someone
    // else (arrivals logged from the captain's phone)
    const subject =
      typeof event.payload.player_id === "string" ? event.payload.player_id : event.actor_id;
    if (event.type === "rsvp_in") attending.add(subject);
    else if (event.type === "rsvp_out") {
      attending.delete(subject);
      checkedIn.delete(subject);
    } else if (event.type === "check_in") {
      attending.add(subject);
      checkedIn.add(subject);
    }
  }
  return { attending: [...attending], checkedIn: [...checkedIn] };
}

export async function getRoster(sessionId: string): Promise<Roster> {
  return rosterFromEvents(await fetchSessionEvents(sessionId));
}

export async function listGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as Group[];
}

export type Member = { id: string; name: string };

export async function listGroupMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("player_id, profiles(display_name)")
    .eq("group_id", groupId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as { player_id: string; profiles: { display_name: string } | null };
    return { id: r.player_id, name: r.profiles?.display_name ?? "Player" };
  });
}

// the next session that still matters: planned or live, soonest first
export async function nextSession(groupId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_id", groupId)
    .in("status", ["planned", "live"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle<Session>();
  if (error) throw error;
  return data;
}

// start-night is a plain-row status flip: the log's event types have no
// session_started; rounds (S1-16) will write round_generated events
export async function startNight(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "live" })
    .eq("id", sessionId);
  if (error) throw error;
}
