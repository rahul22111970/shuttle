// Rating recording: on match completion, compute deltas with the pure
// engine and append one rating_history row per participant. All the maths
// lives in @shuttle/rating; this file owns fetching, margins, idempotency
// and the replay used to prove the stored chain.
import type { MatchConfig, MatchState } from "@shuttle/score";
import {
  INITIAL_RATING,
  doublesDeltas,
  kFor,
  singlesDeltas,
  weeklyDecayAfter,
  type PlayerRating,
} from "@shuttle/rating";
import { supabase } from "./supabase";

export type RatingRow = {
  player_id: string;
  match_id: string;
  group_id: string;
  rating_before: number;
  rating_after: number;
  k: number;
};

// stored rows disagree with what the engine computes: never overwrite,
// never pretend it is done — a human looks (0011's accepted-risk note)
export class RatingConflictError extends Error {
  constructor(matchId: string) {
    super(`rating rows for match ${matchId} exist with different values`);
    this.name = "RatingConflictError";
  }
}

// the format's largest possible winner-minus-loser points total
export function maxMarginFor(config: MatchConfig): number {
  if (config.kind === "americano") return config.totalPoints;
  const gamesNeeded = Math.ceil(config.bestOf / 2);
  return (config.game.cap ?? config.game.pointsToWin) * gamesNeeded;
}

// winner's total points minus loser's across games, clamped to 0: a
// bestOf winner can score fewer points overall and the engine throws on
// negative margins by design — the clamp is this caller's contract
export function pointMarginFor(snapshot: MatchState): number {
  if (snapshot.winner === null) return 0;
  const games = snapshot.games.length > 0 ? snapshot.games : [snapshot.score];
  const a = games.reduce((n, g) => n + g.a, 0);
  const b = games.reduce((n, g) => n + g.b, 0);
  const margin = snapshot.winner === "a" ? a - b : b - a;
  return Math.max(0, margin);
}

// Current rating + prior rated-match count, from the stored chain.
// excludeMatchId keeps a first write honest (its own rows are not
// "prior"); beforeCutoff keeps a RE-record honest — prior state must be
// what it was when the match was first recorded, not what it is now.
// ACCEPTED RISK (S1-26 review, same loudness as 0011's): two DIFFERENT
// matches for one player recorded concurrently both read the same prior
// state and fork the chain silently. Escalation: a SECURITY DEFINER RPC
// with a per-player advisory lock. rebuildRatings is the detector.
export async function ratingStateFor(
  playerIds: readonly string[],
  groupId: string,
  excludeMatchId?: string,
  beforeCutoff?: string
): Promise<Map<string, PlayerRating>> {
  const state = new Map<string, PlayerRating>(
    playerIds.map((id) => [id, { rating: INITIAL_RATING, matchesPlayed: 0 }])
  );
  if (playerIds.length === 0) return state;
  let query = supabase
    .from("rating_history")
    .select("player_id, rating_after, created_at, match_id")
    .eq("group_id", groupId)
    .in("player_id", playerIds as string[])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  // a bare .neq would also drop decay rows: null match_id fails SQL's <>
  if (excludeMatchId)
    query = query.or(`match_id.neq.${excludeMatchId},match_id.is.null`);
  if (beforeCutoff) query = query.lt("created_at", beforeCutoff);
  const res = await query;
  if (res.error) throw res.error;
  for (const row of res.data) {
    const prev = state.get(row.player_id);
    if (!prev) continue;
    state.set(row.player_id, {
      rating: row.rating_after,
      // decay rows move the rating but were not matches played
      matchesPlayed: prev.matchesPlayed + (row.match_id === null ? 0 : 1),
    });
  }
  return state;
}

type MatchForRating = {
  id: string;
  group_id: string;
  config: MatchConfig;
  snapshot: MatchState;
  participants: readonly { player_id: string; side: "a" | "b" }[];
};

async function fetchMatchForRating(matchId: string): Promise<MatchForRating | null> {
  const res = await supabase
    .from("matches")
    .select("id, group_id, config, status, snapshot, match_participants(player_id, side)")
    .eq("id", matchId)
    .maybeSingle();
  if (res.error) throw res.error;
  if (!res.data || res.data.status !== "complete" || !res.data.snapshot) return null;
  return {
    id: res.data.id,
    group_id: res.data.group_id,
    config: res.data.config as MatchConfig,
    snapshot: res.data.snapshot as MatchState,
    participants: res.data.match_participants as MatchForRating["participants"],
  };
}

// pure: given everyone's current state, the rows this match writes.
// Rateable = a decided 1v1 or 2v2 with participants; anything else
// (draws, participant-less casual scores, lopsided seatings) rates nobody.
export function ratingRowsFor(
  match: MatchForRating,
  state: Map<string, PlayerRating>
): RatingRow[] {
  const { snapshot, participants } = match;
  if (snapshot.winner === null) return [];
  const winners = participants.filter((p) => p.side === snapshot.winner);
  const losers = participants.filter((p) => p.side !== snapshot.winner);
  if (!(winners.length === losers.length && (winners.length === 1 || winners.length === 2)))
    return [];

  // both clamps are this caller's contract: the engine throws outside
  // 0..maxMargin, and quick-log deliberately accepts implausible values
  const maxMargin = maxMarginFor(match.config);
  const margin = Math.min(pointMarginFor(snapshot), maxMargin);
  const of = (id: string) => state.get(id) as PlayerRating;
  const row = (id: string, delta: number): RatingRow => {
    const before = of(id);
    return {
      player_id: id,
      match_id: match.id,
      group_id: match.group_id,
      rating_before: Math.round(before.rating),
      rating_after: Math.round(before.rating + delta),
      k: kFor(before.matchesPlayed),
    };
  };

  if (winners.length === 1) {
    const d = singlesDeltas(of(winners[0].player_id), of(losers[0].player_id), margin, maxMargin);
    return [row(winners[0].player_id, d.winner), row(losers[0].player_id, d.loser)];
  }
  const d = doublesDeltas(
    [of(winners[0].player_id), of(winners[1].player_id)],
    [of(losers[0].player_id), of(losers[1].player_id)],
    margin,
    maxMargin
  );
  return [
    row(winners[0].player_id, d.winners[0]),
    row(winners[1].player_id, d.winners[1]),
    row(losers[0].player_id, d.losers[0]),
    row(losers[1].player_id, d.losers[1]),
  ];
}

const rowsEqual = (stored: RatingRow[], computed: RatingRow[]): boolean => {
  if (stored.length !== computed.length) return false;
  const key = (r: RatingRow) =>
    `${r.player_id}|${r.rating_before}|${r.rating_after}|${r.k}`;
  const have = new Set(stored.map(key));
  return computed.every((r) => have.has(key(r)));
};

// On completion: compute and append. One atomic multi-row insert (the
// 0011 contract); a conflict re-reads and accepts only value-identical
// rows, anything else is a RatingConflictError. Returns the rows written
// (or already present), [] for unrateable matches.
export async function recordRatings(matchId: string): Promise<RatingRow[]> {
  const match = await fetchMatchForRating(matchId);
  if (!match) return [];
  const existing = await supabase
    .from("rating_history")
    .select("player_id, match_id, group_id, rating_before, rating_after, k, created_at")
    .eq("match_id", matchId);
  if (existing.error) throw existing.error;

  const playerIds = match.participants.map((p) => p.player_id);
  if (existing.data.length > 0) {
    // recompute against prior state AS OF the first recording, or any
    // match rated since would turn an innocent retry into a false conflict
    const cutoff = existing.data.map((r) => r.created_at).sort()[0];
    const asOf = await ratingStateFor(playerIds, match.group_id, matchId, cutoff);
    if (rowsEqual(existing.data, ratingRowsFor(match, asOf))) return existing.data;
    throw new RatingConflictError(matchId);
  }
  const state = await ratingStateFor(playerIds, match.group_id, matchId);
  const rows = ratingRowsFor(match, state);
  if (rows.length === 0) return [];

  const me = (await supabase.auth.getUser()).data.user?.id;
  const ins = await supabase
    .from("rating_history")
    .insert(rows.map((r) => ({ ...r, created_by: me })));
  if (ins.error) {
    // unique_violation: someone else won the race; accept identical rows
    if (ins.error.code === "23505") {
      const again = await supabase
        .from("rating_history")
        .select("player_id, match_id, group_id, rating_before, rating_after, k, created_at")
        .eq("match_id", matchId);
      if (again.error) throw again.error;
      const cutoff = again.data.map((r) => r.created_at).sort()[0];
      const asOf = await ratingStateFor(playerIds, match.group_id, matchId, cutoff);
      if (rowsEqual(again.data, ratingRowsFor(match, asOf))) return again.data;
      throw new RatingConflictError(matchId);
    }
    throw ins.error;
  }
  return rows;
}

// Replay the player's stored chain through the engine: own rating rebuilt
// from INITIAL_RATING forward, opponents taken at their STORED
// rating_before for each match. Proves the chain was engine-written.
export async function rebuildRatings(playerId: string, groupId: string): Promise<RatingRow[]> {
  const own = await supabase
    .from("rating_history")
    .select("match_id, created_at")
    .eq("player_id", playerId)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (own.error) throw own.error;
  const rebuilt: RatingRow[] = [];
  let rating = INITIAL_RATING;
  let matchesPlayed = 0;
  for (const entry of own.data) {
    // a decay row (no match) replays through the same engine step the job
    // used; it moves the rating and counts as nothing else
    if (entry.match_id === null) {
      rating = weeklyDecayAfter(rating) ?? rating;
      continue;
    }
    const match = await fetchMatchForRating(entry.match_id);
    if (!match) continue;
    const others = await supabase
      .from("rating_history")
      .select("player_id, match_id, group_id, rating_before, rating_after, k")
      .eq("match_id", entry.match_id);
    if (others.error) throw others.error;
    const state = new Map<string, PlayerRating>();
    for (const p of match.participants) {
      if (p.player_id === playerId) {
        state.set(p.player_id, { rating, matchesPlayed });
      } else {
        const stored = others.data.find((r) => r.player_id === p.player_id);
        if (!stored) continue;
        // matchesPlayed here is a placeholder (kFor(64) is NOT 64's k):
        // opponents' matchesPlayed feeds only THEIR k, and the engine
        // never lets their k touch our delta — averages use ratings only
        state.set(p.player_id, {
          rating: stored.rating_before,
          matchesPlayed: stored.k,
        });
      }
    }
    // a fabricated partial row set (0011's accepted risk) can leave a
    // participant unrated; rating that match would crash on missing state
    if (match.participants.some((p) => !state.has(p.player_id))) continue;
    const rows = ratingRowsFor(match, state);
    const mine = rows.find((r) => r.player_id === playerId);
    if (!mine) continue;
    rebuilt.push(mine);
    rating = mine.rating_after;
    matchesPlayed++;
  }
  return rebuilt;
}
