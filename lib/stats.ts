// Profile stats: one cross-group fetch and pure aggregates over it.
// The pure functions take PlayedMatch[] ordered most-recent-first; every
// display number on the Me tab comes from here and nowhere else.
import type { MatchState } from "@shuttle/score";
import { supabase } from "./supabase";

export type PlayedMatch = {
  id: string;
  groupId: string;
  createdAt: string;
  // the viewer's side and the match outcome
  side: "a" | "b";
  winner: "a" | "b" | null;
  games: readonly { readonly a: number; readonly b: number }[];
  // same-side player ids, viewer excluded
  partnerIds: readonly string[];
  // opposing player ids
  opponentIds: readonly string[];
  // the config's deuce threshold, for clutch stats; null = no deuce rule
  settingAt?: number | null;
};

export type Form = "w" | "l" | "d";

export type Chemistry = {
  partnerId: string;
  played: number;
  // wins/decided among matches with this partner; null if none decided
  winPct: number | null;
};

export const CHEMISTRY_FLOOR = 3;

const result = (m: PlayedMatch): Form =>
  m.winner === null ? "d" : m.winner === m.side ? "w" : "l";

// win % over decided matches only; draws neither help nor hurt
export function winPct(matches: readonly PlayedMatch[]): number | null {
  const decided = matches.filter((m) => m.winner !== null);
  if (decided.length === 0) return null;
  const wins = decided.filter((m) => result(m) === "w").length;
  return Math.round((wins / decided.length) * 100);
}

// consecutive same-result run from the most recent decided match;
// positive = wins, negative = losses, 0 = nothing decided yet.
// A draw between decided matches breaks the run.
export function currentStreak(matches: readonly PlayedMatch[]): number {
  let streak = 0;
  for (const m of matches) {
    const r = result(m);
    if (r === "d") break;
    if (streak === 0) streak = r === "w" ? 1 : -1;
    else if (streak > 0 && r === "w") streak++;
    else if (streak < 0 && r === "l") streak--;
    else break;
  }
  return streak;
}

// most recent first, at most 10 entries
export function lastTen(matches: readonly PlayedMatch[]): Form[] {
  return matches.slice(0, 10).map(result);
}

// win % per partner over decided matches together; partners under the
// floor are excluded entirely. Sorted best-first, ties by games played.
export function chemistry(matches: readonly PlayedMatch[]): Chemistry[] {
  const per = new Map<string, { played: number; decided: number; wins: number }>();
  for (const m of matches) {
    for (const id of m.partnerIds) {
      const row = per.get(id) ?? { played: 0, decided: 0, wins: 0 };
      row.played++;
      if (m.winner !== null) {
        row.decided++;
        if (result(m) === "w") row.wins++;
      }
      per.set(id, row);
    }
  }
  return [...per.entries()]
    .filter(([, r]) => r.played >= CHEMISTRY_FLOOR)
    .map(([partnerId, r]) => ({
      partnerId,
      played: r.played,
      winPct: r.decided === 0 ? null : Math.round((r.wins / r.decided) * 100),
    }))
    .sort((x, y) => (y.winPct ?? -1) - (x.winPct ?? -1) || y.played - x.played);
}

type ParticipantRow = { player_id: string; side: "a" | "b" };

// Tonight's table: per player over a set of COMPLETED matches — wins,
// losses, win % over decided games, and points their side scored. Pure,
// so the live night can feed it straight from its matches map.
export type NightRow = {
  playerId: string;
  wins: number;
  losses: number;
  winPct: number | null;
  points: number;
};

export function nightSummary(
  matches: readonly {
    status: "live" | "complete";
    snapshot: {
      winner?: "a" | "b" | null;
      games?: readonly { a: number; b: number }[];
      score?: { a: number; b: number };
    } | null;
    participants: readonly ParticipantRow[];
  }[]
): NightRow[] {
  const per = new Map<string, { wins: number; losses: number; decided: number; points: number }>();
  for (const m of matches) {
    if (m.status !== "complete" || !m.snapshot) continue;
    const games =
      m.snapshot.games && m.snapshot.games.length > 0
        ? m.snapshot.games
        : m.snapshot.score
          ? [m.snapshot.score]
          : [];
    const total = { a: 0, b: 0 };
    for (const g of games) {
      total.a += g.a;
      total.b += g.b;
    }
    const winner = m.snapshot.winner ?? null;
    for (const p of m.participants) {
      const row = per.get(p.player_id) ?? { wins: 0, losses: 0, decided: 0, points: 0 };
      row.points += total[p.side];
      if (winner !== null) {
        row.decided++;
        if (winner === p.side) row.wins++;
        else row.losses++;
      }
      per.set(p.player_id, row);
    }
  }
  return [...per.entries()]
    .map(([playerId, r]) => ({
      playerId,
      wins: r.wins,
      losses: r.losses,
      winPct: r.decided === 0 ? null : Math.round((r.wins / r.decided) * 100),
      points: r.points,
    }))
    .sort((x, y) => y.wins - x.wins || y.points - x.points || x.playerId.localeCompare(y.playerId));
}

// every complete match the player took part in, across all their groups,
// most recent first (RLS scopes this to groups they belong to)
export async function fetchPlayedMatches(playerId: string): Promise<PlayedMatch[]> {
  const ids = await supabase
    .from("match_participants")
    .select("match_id")
    .eq("player_id", playerId);
  if (ids.error) throw ids.error;
  if (ids.data.length === 0) return [];
  // ponytail: .in() id list travels in the URL — breaks around ~200-400
  // matches per player and the 1000-row cap truncates silently before an
  // error appears. Swap to an aliased !inner embed filtered to the viewer
  // when any player nears a couple hundred matches.
  const res = await supabase
    .from("matches")
    .select("id, group_id, created_at, snapshot, match_participants(player_id, side)")
    .in("id", ids.data.map((r) => r.match_id))
    .eq("status", "complete")
    .order("created_at", { ascending: false });
  if (res.error) throw res.error;
  const rows = (res.data ?? []) as unknown as {
    id: string;
    group_id: string;
    created_at: string;
    snapshot: MatchState | null;
    match_participants: ParticipantRow[];
  }[];
  return rows
    .filter((r) => r.snapshot)
    .map((r) => {
      const side = r.match_participants.find((p) => p.player_id === playerId)?.side as
        | "a"
        | "b";
      const snap = r.snapshot as MatchState;
      return {
        id: r.id,
        groupId: r.group_id,
        createdAt: r.created_at,
        side,
        winner: snap.winner,
        settingAt: snap.config?.kind === "standard" ? snap.config.game?.settingAt ?? null : null,
        games: Array.isArray(snap.games) && snap.games.length > 0 ? snap.games : [snap.score],
        partnerIds: r.match_participants
          .filter((p) => p.side === side && p.player_id !== playerId)
          .map((p) => p.player_id),
        opponentIds: r.match_participants
          .filter((p) => p.side !== side)
          .map((p) => p.player_id),
      };
    });
}
