// The analytics engine, pure half: trends, head-to-head, clutch, comebacks
// and the sentences the Stats tab leads with. No I/O; controllers feed it
// the same rows they already fetch. See ANALYTICS.md for what ships and why.
import type { MatchState, Side } from "@shuttle/score";
import { applyMatchPoint, createMatch } from "@shuttle/score";
import { INITIAL_RATING } from "@shuttle/rating";
import type { PlayedMatch } from "./stats";

// group-scope match rows: the stats-section fetch, snapshot kept whole
export type FullMatch = {
  created_at: string;
  snapshot: MatchState | null;
  participants: readonly { player_id: string; side: "a" | "b" }[];
};

// snapshot is member-written jsonb (live scoring updates it), so every
// read below assumes a row can be garbage: optional-chain the shape checks
// and skip what does not parse - one bad row must never take the tab down
const settingAtOf = (s: MatchState): number | null =>
  s.config?.kind === "standard" ? s.config.game?.settingAt ?? null : null;

// ---- weekly movement: the chevron beside each leaderboard rating ----

// per player: latest rating minus their rating a week ago. A player whose
// whole chain is younger than a week moves from INITIAL_RATING.
export function weeklyMovement(
  rows: readonly { player_id: string; rating_after: number; created_at: string }[],
  now: Date
): Map<string, number> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const sorted = [...rows].sort((x, y) => x.created_at.localeCompare(y.created_at));
  const current = new Map<string, number>();
  const baseline = new Map<string, number>();
  for (const r of sorted) {
    current.set(r.player_id, r.rating_after);
    if (r.created_at <= cutoff) baseline.set(r.player_id, r.rating_after);
  }
  const out = new Map<string, number>();
  for (const [id, rating] of current) {
    out.set(id, rating - (baseline.get(id) ?? INITIAL_RATING));
  }
  return out;
}

// ---- activity heatmap: games per day, GitHub-style ----

export type DayCell = { date: string; count: number };

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// columns oldest -> newest, each a Mon..Sun week in device-local time; the
// last column stops at today
export function activityGrid(
  dates: readonly string[],
  now: Date,
  weeks = 16
): { weeks: DayCell[][]; max: number; total: number } {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const k = dayKey(new Date(iso));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - (sinceMonday + (weeks - 1) * 7) * 86_400_000);
  const grid: DayCell[][] = [];
  let max = 0;
  let total = 0;
  for (let w = 0; w < weeks; w++) {
    const col: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      if (day.getTime() > today.getTime()) break;
      const count = counts.get(dayKey(day)) ?? 0;
      max = Math.max(max, count);
      total += count;
      col.push({ date: dayKey(day), count });
    }
    grid.push(col);
  }
  return { weeks: grid, max, total };
}

// ---- head-to-head: the record friends argue about ----

export type H2HRow = { opponentId: string; wins: number; losses: number };

export function headToHead(matches: readonly PlayedMatch[]): H2HRow[] {
  const table = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    if (m.winner === null) continue;
    const won = m.winner === m.side;
    for (const opp of m.opponentIds) {
      const row = table.get(opp) ?? { wins: 0, losses: 0 };
      if (won) row.wins += 1;
      else row.losses += 1;
      table.set(opp, row);
    }
  }
  return [...table.entries()]
    .map(([opponentId, r]) => ({ opponentId, ...r }))
    .sort(
      (x, y) => y.wins + y.losses - (x.wins + x.losses) || y.wins - x.wins
    );
}

// ---- clutch: games that reached deuce ----

// per player, over every COMPLETED game in the given matches: how the
// deuce games (both sides at settingAt or beyond) went. Games with no
// setting rule (americano) carry no deuce and are skipped.
export function deuceTable(
  matches: readonly FullMatch[]
): Map<string, { won: number; lost: number }> {
  const table = new Map<string, { won: number; lost: number }>();
  for (const m of matches) {
    if (!m.snapshot || !Array.isArray(m.snapshot.games)) continue;
    const settingAt = settingAtOf(m.snapshot);
    if (settingAt === null) continue;
    for (const g of m.snapshot.games) {
      if (Math.min(g.a, g.b) < settingAt || g.a === g.b) continue;
      const winner: Side = g.a > g.b ? "a" : "b";
      for (const p of m.participants) {
        const row = table.get(p.player_id) ?? { won: 0, lost: 0 };
        if (p.side === winner) row.won += 1;
        else row.lost += 1;
        table.set(p.player_id, row);
      }
    }
  }
  return table;
}

// player-scope version, from the shape the player room already has
export function deuceRecord(
  matches: readonly PlayedMatch[]
): { won: number; lost: number } {
  let won = 0;
  let lost = 0;
  for (const m of matches) {
    if (m.settingAt == null) continue;
    for (const g of m.games) {
      if (Math.min(g.a, g.b) < m.settingAt || g.a === g.b) continue;
      const w: Side = g.a > g.b ? "a" : "b";
      if (w === m.side) won += 1;
      else lost += 1;
    }
  }
  return { won, lost };
}

// ---- comebacks: replayed from the rally sequence (live-scored only) ----

export type Comeback = {
  winnerIds: string[];
  deficit: number;
  score: string;
  created_at: string;
};

// the deepest hole a game's eventual winner climbed out of, across every
// live-scored game in the set. Ties go to the most recent.
export function biggestComeback(matches: readonly FullMatch[]): Comeback | null {
  let best: Comeback | null = null;
  for (const m of matches) {
    const snap = m.snapshot;
    if (
      !snap ||
      !Array.isArray(snap.points) ||
      snap.points.length === 0 ||
      snap.config?.kind !== "standard"
    )
      continue;
    try {
      let state = createMatch(snap.config);
      let deficit = { a: 0, b: 0 };
      for (const p of snap.points) {
        const next = applyMatchPoint(state, p);
        deficit = {
          a: Math.max(deficit.a, next.score.b - next.score.a),
          b: Math.max(deficit.b, next.score.a - next.score.b),
        };
        if (next.games.length > state.games.length) {
          const g = next.games[next.games.length - 1];
          const w: Side = g.a > g.b ? "a" : "b";
          const dug = deficit[w];
          if (dug > 0 && (!best || dug > best.deficit ||
              (dug === best.deficit && m.created_at > best.created_at))) {
            best = {
              winnerIds: m.participants.filter((x) => x.side === w).map((x) => x.player_id),
              deficit: dug,
              score: `${Math.max(g.a, g.b)}–${Math.min(g.a, g.b)}`,
              created_at: m.created_at,
            };
          }
          deficit = { a: 0, b: 0 };
        }
        state = next;
      }
    } catch {
      // a snapshot the engine refuses to replay rates no records
    }
  }
  return best;
}

// ---- the sentences the tab leads with ----

// gates keep these honest: nothing prints below its minimum sample.
// Priority order is drama first; at most three ship.
export function groupSentences(input: {
  comeback: (Comeback & { names: string }) | null;
  climber: { name: string; delta: number } | null;
  clutch: { name: string; won: number; lost: number } | null;
  bestDuo: { names: string; winPct: number; games: number } | null;
  hotStreak: { name: string; streak: number } | null;
}): string[] {
  const out: string[] = [];
  if (input.comeback && input.comeback.deficit >= 5) {
    out.push(
      `${input.comeback.names} came back from ${input.comeback.deficit} down to take it ${input.comeback.score}, live scored.`
    );
  }
  if (input.climber && input.climber.delta >= 15) {
    out.push(`${input.climber.name} climbed ${input.climber.delta} this week.`);
  }
  if (input.clutch && input.clutch.won + input.clutch.lost >= 4) {
    const p = Math.round((input.clutch.won / (input.clutch.won + input.clutch.lost)) * 100);
    if (p >= 60) {
      out.push(
        `${input.clutch.name} wins ${p}% of games that reach deuce (${input.clutch.won + input.clutch.lost} played).`
      );
    }
  }
  if (input.bestDuo && input.bestDuo.games >= 3) {
    out.push(
      `${input.bestDuo.names} win ${input.bestDuo.winPct}% together (${input.bestDuo.games} games).`
    );
  }
  if (input.hotStreak && input.hotStreak.streak >= 3) {
    out.push(`${input.hotStreak.name} has won ${input.hotStreak.streak} in a row.`);
  }
  return out.slice(0, 3);
}
