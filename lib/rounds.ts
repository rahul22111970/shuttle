// Round generation: the checked-in roster meets @shuttle/rounds, the seed
// is persisted in the round_generated event payload, and the round's
// matches are real rows. Rebuilding the same inputs from the DB and
// re-running the engine must reproduce the round exactly — that is the
// determinism the event payload exists to guarantee.
//
// PM decisions recorded at S1-16: every round match is one game to a fixed
// points total, americano(24) by default (RESEARCH §6: 21-24 point games
// run 10-14 minutes); both americano and mexicano nights use it, because
// both formats are fixed-total per RESEARCH §7. The fairness engines
// assume a fixed roster (S1-03 review): a mid-night check-in changes the
// config and fairness is approximate from that point. Every point scored
// tonight counts toward mexicano standings, including quick-logged
// matches in the same session — deliberate, not incidental.
import {
  americanoRound,
  mexicanoRound,
  type NightConfig,
  type Round,
  type Tallies,
} from "@shuttle/rounds";
import { americano, type MatchConfig, type MatchState } from "@shuttle/score";
import {
  appendSessionEvent,
  fetchSessionEvents,
  rosterFromEvents,
  type SessionEvent,
} from "./session";
import { supabase } from "./supabase";

export const ROUND_POINTS = 24;

export type RoundFormat = "americano" | "mexicano";

export type RoundGeneratedPayload = {
  format: RoundFormat;
  seed: number;
  courts: number;
  round: Round;
  matchIds: readonly string[];
};

function roundEvents(events: readonly SessionEvent[]): RoundGeneratedPayload[] {
  return events
    .filter((e) => e.type === "round_generated")
    .map((e) => e.payload as unknown as RoundGeneratedPayload);
}

// A player's night tally: every point their side has scored across the
// session's matches, live or complete, summed from snapshots.
function sideTotal(snapshot: MatchState, side: "a" | "b"): number {
  const gamePoints = snapshot.games.reduce((sum, g) => sum + g[side], 0);
  return gamePoints + snapshot.score[side];
}

export async function talliesForSession(sessionId: string): Promise<Tallies> {
  const { data, error } = await supabase
    .from("matches")
    .select("snapshot, match_participants(player_id, side)")
    .eq("session_id", sessionId);
  if (error) throw error;
  const tallies: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as unknown as {
      snapshot: MatchState | null;
      match_participants: { player_id: string; side: "a" | "b" }[];
    };
    if (!r.snapshot) continue;
    for (const p of r.match_participants) {
      tallies[p.player_id] = (tallies[p.player_id] ?? 0) + sideTotal(r.snapshot, p.side);
    }
  }
  return tallies;
}

export async function generateRound(
  sessionId: string,
  groupId: string,
  format: RoundFormat,
  courts: number,
  seed: number
): Promise<RoundGeneratedPayload> {
  const events = await fetchSessionEvents(sessionId);
  const roster = rosterFromEvents(events);
  const previous = roundEvents(events).map((p) => p.round);
  const config: NightConfig = { players: [...roster.checkedIn], courts, seed };

  let round: Round;
  if (format === "americano") {
    round = americanoRound(config, previous);
  } else {
    // players who left mid-night still own tally rows; the engine refuses
    // unknown names, so standings are filtered to who is actually here
    const raw = await talliesForSession(sessionId);
    const tallies = Object.fromEntries(
      roster.checkedIn.filter((p) => p in raw).map((p) => [p, raw[p]])
    );
    round = mexicanoRound(config, previous, tallies);
  }

  // matches first, then the event carrying their ids: the payload can then
  // be checked row-for-row against the tables. ponytail: two phases, no
  // transaction; a crash between them leaves round matches without their
  // event. A generate_round RPC is the upgrade when it bites.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("not signed in");
  const matchConfig: MatchConfig = americano(ROUND_POINTS);
  const matchIds: string[] = [];
  for (const court of round.courts) {
    const { data: match, error } = await supabase
      .from("matches")
      .insert({
        group_id: groupId,
        session_id: sessionId,
        config: matchConfig,
        created_by: userData.user.id,
      })
      .select()
      .single<{ id: string }>();
    if (error) throw error;
    const participants = [
      ...court.pairs[0].map((player_id) => ({ match_id: match.id, player_id, side: "a" })),
      ...court.pairs[1].map((player_id) => ({ match_id: match.id, player_id, side: "b" })),
    ];
    const seated = await supabase.from("match_participants").insert(participants);
    if (seated.error) throw seated.error;
    matchIds.push(match.id);
  }

  const payload: RoundGeneratedPayload = { format, seed, courts, round, matchIds };
  await appendSessionEvent(sessionId, "round_generated", payload as unknown as Record<string, unknown>);
  return payload;
}
