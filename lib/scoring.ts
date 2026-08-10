// The scoring flows: engine state lives on the phone, every change ships
// as an append through the S1-13 RPC, and the snapshot stored beside each
// event IS the serialized engine state — which is what makes replay
// equality a testable invariant instead of a hope.
import {
  applyMatchPoint,
  createMatch as engineCreate,
  undo as engineUndo,
  type MatchConfig,
  type MatchState,
  type Side,
} from "@shuttle/score";
import { supabase } from "./supabase";
import { rebuildRatings, recordRatings } from "./rating";

export type MatchRow = {
  id: string;
  group_id: string;
  session_id: string | null;
  config: MatchConfig;
  status: "live" | "complete";
  snapshot: MatchState | null;
  created_by: string;
  created_at: string;
};

export type Participant = { player_id: string; side: Side };

export type MatchEventRow = {
  id: string;
  match_id: string;
  seq: number;
  type: "point" | "undo" | "result";
  side: Side | null;
  scorer_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};

// The RPC's three distinctive codes, typed; anything else falls through as
// a plain Error (S1-13 review carry: a malformed event surfaces as a raw
// check violation, not an SHxxx).
export class StaleSeqError extends Error {}
export class MatchNotLiveError extends Error {}
export class MatchNotFoundError extends Error {}

function typedError(error: { code?: string; message?: string }): Error {
  const message = error.message ?? "scoring call failed";
  if (error.code === "SH001") return new StaleSeqError(message);
  if (error.code === "SH002") return new MatchNotLiveError(message);
  if (error.code === "SH404") return new MatchNotFoundError(message);
  return new Error(message);
}

// A live match in the scorer's hand: engine state plus the next seq to
// claim. Both advance together or not at all — on append failure the
// caller keeps its old handle.
export type LiveMatch = {
  readonly matchId: string;
  readonly state: MatchState;
  readonly nextSeq: number;
};

// ponytail: two statements, no transaction; a crash between them orphans a
// live player-less match. Move to a create_match RPC when it bites (same
// ceiling as createGroup in lib/session.ts).
async function insertMatchRow(
  groupId: string,
  config: MatchConfig,
  participants: readonly Participant[],
  sessionId?: string
): Promise<MatchRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("not signed in");
  const { data, error } = await supabase
    .from("matches")
    .insert({
      group_id: groupId,
      session_id: sessionId ?? null,
      config,
      created_by: userData.user.id,
    })
    .select()
    .single<MatchRow>();
  if (error) throw error;
  if (participants.length > 0) {
    const rows = participants.map((p) => ({ match_id: data.id, ...p }));
    const seated = await supabase.from("match_participants").insert(rows);
    if (seated.error) throw seated.error;
  }
  return data;
}

async function append(
  matchId: string,
  expectedSeq: number,
  event: { type: string; side?: Side; payload?: Record<string, unknown> },
  snapshot: MatchState | Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .rpc("append_match_event", {
      p_match_id: matchId,
      p_expected_seq: expectedSeq,
      p_event: event,
      p_snapshot: snapshot,
    })
    .single();
  if (error) throw typedError(error);
}

export async function startMatch(
  groupId: string,
  config: MatchConfig,
  participants: readonly Participant[],
  sessionId?: string
): Promise<LiveMatch> {
  const row = await insertMatchRow(groupId, config, participants, sessionId);
  return { matchId: row.id, state: engineCreate(config), nextSeq: 1 };
}

export async function scorePoint(live: LiveMatch, side: Side): Promise<LiveMatch> {
  const state = applyMatchPoint(live.state, side);
  await append(live.matchId, live.nextSeq, { type: "point", side }, state);
  if (state.finished) {
    // best-effort: the point is saved either way. No retry surface exists
    // yet — S1-27's complete screen adds one recordRatings call on load
    // (idempotent by design); until then a transient failure leaves the
    // match unrated with only this warning
    recordRatings(live.matchId).catch((e) => console.warn("rating write failed", e));
  }
  return { matchId: live.matchId, state, nextSeq: live.nextSeq + 1 };
}

export async function undoPoint(live: LiveMatch): Promise<LiveMatch> {
  const state = engineUndo(live.state);
  await append(live.matchId, live.nextSeq, { type: "undo" }, state);
  return { matchId: live.matchId, state, nextSeq: live.nextSeq + 1 };
}

// Quick-log: the whole match as one result event. The snapshot is shaped
// like a one-game MatchState so every reader (feed, stats, rating) sees
// the same fields live scoring produces.
export async function quickLog(
  groupId: string,
  config: MatchConfig,
  participants: readonly Participant[],
  finalScore: { a: number; b: number },
  sessionId?: string
): Promise<MatchRow> {
  // refuse shapes the engine can never emit: standard badminton cannot tie,
  // and a one-result quick-log cannot represent a multi-game match. Value
  // plausibility (retirements, abandoned games) stays the caller's business
  // per decision 12.
  if (
    !Number.isInteger(finalScore.a) ||
    !Number.isInteger(finalScore.b) ||
    finalScore.a < 0 ||
    finalScore.b < 0
  ) {
    throw new Error("scores are whole shuttle counts, zero or more");
  }
  if (config.kind === "standard") {
    if (finalScore.a === finalScore.b) {
      throw new Error("a standard match cannot tie");
    }
    if (config.bestOf > 1) {
      throw new Error("quick-log records single-game matches; score bestOf matches live");
    }
  }
  const row = await insertMatchRow(groupId, config, participants, sessionId);
  const winner =
    finalScore.a === finalScore.b ? null : finalScore.a > finalScore.b ? "a" : "b";
  const snapshot = {
    config,
    points: [],
    games: [finalScore],
    gamesWon: { a: winner === "a" ? 1 : 0, b: winner === "b" ? 1 : 0 },
    score: { a: 0, b: 0 },
    finished: true,
    winner,
    events: [],
    quickLog: true,
  };
  await append(row.id, 1, { type: "result", payload: { score: finalScore } }, snapshot);
  recordRatings(row.id).catch((e) => console.warn("rating write failed", e));
  return { ...row, status: "complete", snapshot: snapshot as unknown as MatchState };
}

export async function fetchMatch(matchId: string): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .maybeSingle<MatchRow>();
  if (error) throw error;
  return data;
}

export async function fetchMatchEvents(matchId: string): Promise<MatchEventRow[]> {
  const { data, error } = await supabase
    .from("match_events")
    .select("*")
    .eq("match_id", matchId)
    .order("seq", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchEventRow[];
}

// Pure replay of a live-scored log: the invariant that the stored snapshot
// is exactly what the engine says. Result events are quick-log territory
// and have no point history to fold; refuse them loudly.
// Rehydrating a LiveMatch after StaleSeqError: fetch events, replay, and
// nextSeq = events.length + 1 — valid because the RPC guarantees contiguous
// seqs from 1 (S1-15 builds this).
export function replayMatch(config: MatchConfig, events: readonly MatchEventRow[]): MatchState {
  let state = engineCreate(config);
  for (const event of events) {
    if (event.type === "point") state = applyMatchPoint(state, event.side as Side);
    else if (event.type === "undo") state = engineUndo(state);
    else throw new Error("replayMatch folds live logs only; result events have no history");
  }
  return state;
}

// Voice logging's undo: delete a recent match and rebuild its players'
// ladders. RLS (0015) is the gate — only the logger or a captain, only
// within 48 hours; events and participants cascade off the match row.
// ponytail: only the four participants' ratings are rebuilt; other
// players' later rows keep the numbers they were computed with. Rebuild
// the whole group if retro-accuracy ever matters.
export async function deleteMatch(
  matchId: string,
  groupId: string,
  participantIds: readonly string[]
): Promise<void> {
  const ratings = await supabase.from("rating_history").delete().eq("match_id", matchId);
  if (ratings.error) throw ratings.error;
  const match = await supabase.from("matches").delete().eq("id", matchId);
  if (match.error) throw match.error;
  for (const playerId of participantIds) {
    await rebuildRatings(playerId, groupId);
  }
}
