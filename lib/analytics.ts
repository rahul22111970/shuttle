// Group analytics, pure: a group's completed matches + rating rows in,
// the season out — leaderboard, duos, superlatives. Every number on the
// Stats tab comes from here and nowhere else. Reuses lib/stats for the
// per-player result math (winPct, streak, form) instead of re-deriving.
import { INITIAL_RATING } from "@shuttle/rating";
import { currentStreak, lastTen, winPct, type Form, type PlayedMatch } from "./stats";

export type StatsMatch = {
  created_at: string;
  snapshot: {
    winner?: "a" | "b" | null;
    games?: readonly { a: number; b: number }[];
    score?: { a: number; b: number };
  } | null;
  participants: readonly { player_id: string; side: "a" | "b" }[];
};

export type RatingRow = { player_id: string; rating_after: number; created_at: string };

export type LeaderboardRow = {
  playerId: string;
  // latest rating_after; INITIAL_RATING until the first rated game
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  // decided games only, like lib/stats
  winPct: number | null;
  pointsFor: number;
  // signed like lib/stats: positive = wins, negative = losses
  streak: number;
  // last 5 results, most recent first
  form: Form[];
};

export type Duo = {
  // the pair, id-sorted
  ids: [string, string];
  games: number;
  wins: number;
  winPct: number | null;
};

export type Superlatives = {
  mostGames: { playerId: string; n: number } | null;
  bestDuo: { ids: [string, string]; winPct: number; games: number } | null;
  // the longest CURRENT winning streak in the group
  hotStreak: { playerId: string; streak: number } | null;
  // largest point margin; ties go to the most recent match
  biggestWin: { winnerIds: string[]; loserIds: string[]; margin: number; score: string } | null;
};

export type GroupStats = {
  leaderboard: LeaderboardRow[];
  duos: Duo[];
  superlatives: Superlatives;
};

const gamesOf = (m: StatsMatch) =>
  m.snapshot?.games && m.snapshot.games.length > 0
    ? m.snapshot.games
    : m.snapshot?.score
      ? [m.snapshot.score]
      : [];

// the minimal PlayedMatch lib/stats needs: winner and the viewer's side
const asPlayed = (m: StatsMatch, side: "a" | "b"): PlayedMatch => ({
  id: "",
  groupId: "",
  createdAt: m.created_at,
  side,
  winner: m.snapshot?.winner ?? null,
  games: gamesOf(m),
  partnerIds: [],
  opponentIds: [],
});

export function groupAnalytics(
  matches: readonly StatsMatch[],
  ratings: readonly RatingRow[]
): GroupStats {
  // lib/stats expects most-recent-first; sort here so callers need not care
  const done = matches
    .filter((m) => m.snapshot)
    .slice()
    .sort((x, y) => y.created_at.localeCompare(x.created_at));

  const latest = new Map<string, { at: string; rating: number }>();
  for (const r of ratings) {
    const cur = latest.get(r.player_id);
    if (!cur || r.created_at >= cur.at) latest.set(r.player_id, { at: r.created_at, rating: r.rating_after });
  }

  const per = new Map<string, { played: PlayedMatch[]; wins: number; losses: number; pointsFor: number }>();
  const duoMap = new Map<string, { ids: [string, string]; games: number; wins: number; decided: number }>();
  let biggestWin: Superlatives["biggestWin"] = null;

  for (const m of done) {
    const games = gamesOf(m);
    const pts = { a: 0, b: 0 };
    for (const g of games) {
      pts.a += g.a;
      pts.b += g.b;
    }
    const winner = m.snapshot?.winner ?? null;

    for (const p of m.participants) {
      const row = per.get(p.player_id) ?? { played: [], wins: 0, losses: 0, pointsFor: 0 };
      row.played.push(asPlayed(m, p.side));
      row.pointsFor += pts[p.side];
      if (winner !== null) {
        if (winner === p.side) row.wins++;
        else row.losses++;
      }
      per.set(p.player_id, row);
    }

    for (const side of ["a", "b"] as const) {
      const sideIds = m.participants.filter((p) => p.side === side).map((p) => p.player_id);
      for (let i = 0; i < sideIds.length; i++) {
        for (let j = i + 1; j < sideIds.length; j++) {
          const ids = [sideIds[i], sideIds[j]].sort() as [string, string];
          const key = ids.join("|");
          const d = duoMap.get(key) ?? { ids, games: 0, wins: 0, decided: 0 };
          d.games++;
          if (winner !== null) {
            d.decided++;
            if (winner === side) d.wins++;
          }
          duoMap.set(key, d);
        }
      }
    }

    if (winner !== null) {
      const margin = Math.abs(pts.a - pts.b);
      // strict >: iterating most-recent-first, a tie keeps the newer match
      if (!biggestWin || margin > biggestWin.margin) {
        biggestWin = {
          winnerIds: m.participants.filter((p) => p.side === winner).map((p) => p.player_id),
          loserIds: m.participants.filter((p) => p.side !== winner).map((p) => p.player_id),
          margin,
          score: games
            .map((g) => (winner === "b" ? `${g.b}–${g.a}` : `${g.a}–${g.b}`))
            .join(" · "),
        };
      }
    }
  }

  const ids = new Set([...per.keys(), ...latest.keys()]);
  const leaderboard: LeaderboardRow[] = [...ids]
    .map((playerId) => {
      const s = per.get(playerId) ?? { played: [], wins: 0, losses: 0, pointsFor: 0 };
      return {
        playerId,
        rating: latest.get(playerId)?.rating ?? INITIAL_RATING,
        gamesPlayed: s.played.length,
        wins: s.wins,
        losses: s.losses,
        winPct: winPct(s.played),
        pointsFor: s.pointsFor,
        streak: currentStreak(s.played),
        form: lastTen(s.played).slice(0, 5),
      };
    })
    .sort(
      (x, y) =>
        y.rating - x.rating || y.wins - x.wins || x.playerId.localeCompare(y.playerId)
    );

  const duos: Duo[] = [...duoMap.values()]
    .filter((d) => d.games >= 2)
    .map((d) => ({
      ids: d.ids,
      games: d.games,
      wins: d.wins,
      winPct: d.decided === 0 ? null : Math.round((d.wins / d.decided) * 100),
    }))
    .sort(
      (x, y) =>
        (y.winPct ?? -1) - (x.winPct ?? -1) ||
        y.games - x.games ||
        x.ids.join("|").localeCompare(y.ids.join("|"))
    );

  // leaderboard order (rating desc) breaks every superlative tie
  let mostGames: Superlatives["mostGames"] = null;
  let hotStreak: Superlatives["hotStreak"] = null;
  for (const row of leaderboard) {
    if (row.gamesPlayed > (mostGames?.n ?? 0)) mostGames = { playerId: row.playerId, n: row.gamesPlayed };
    if (row.streak > (hotStreak?.streak ?? 0)) hotStreak = { playerId: row.playerId, streak: row.streak };
  }
  const top = duos.find((d) => d.winPct !== null);
  const bestDuo = top ? { ids: top.ids, winPct: top.winPct as number, games: top.games } : null;

  return { leaderboard, duos, superlatives: { mostGames, bestDuo, hotStreak, biggestWin } };
}
