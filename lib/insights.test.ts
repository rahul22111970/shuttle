// Oracles for the analytics engine: fixed fixtures in, exact numbers out.
import { applyMatchPoint, createMatch, PRESETS, type MatchState, type Side } from "@shuttle/score";
import { INITIAL_RATING } from "@shuttle/rating";
import type { PlayedMatch } from "./stats";
import {
  activityGrid,
  biggestComeback,
  deuceRecord,
  deuceTable,
  groupSentences,
  headToHead,
  weeklyMovement,
  type FullMatch,
} from "./insights";

const NOW = new Date(2026, 7, 29, 12, 0, 0); // local Sat 2026-08-29

const played = (over: Partial<PlayedMatch>): PlayedMatch => ({
  id: "m",
  groupId: "g",
  createdAt: "2026-08-20T12:00:00Z",
  side: "a",
  winner: "a",
  games: [{ a: 21, b: 15 }],
  partnerIds: [],
  opponentIds: ["opp"],
  ...over,
});

it("weeklyMovement measures against the week-ago rating, INITIAL for newcomers", () => {
  const rows = [
    { player_id: "old", rating_after: 1250, created_at: "2026-08-10T10:00:00Z" },
    { player_id: "old", rating_after: 1280, created_at: "2026-08-28T10:00:00Z" },
    { player_id: "new", rating_after: 1216, created_at: "2026-08-27T10:00:00Z" },
    { player_id: "flat", rating_after: 1190, created_at: "2026-08-01T10:00:00Z" },
  ];
  const m = weeklyMovement(rows, NOW);
  expect(m.get("old")).toBe(30);
  expect(m.get("new")).toBe(1216 - INITIAL_RATING);
  expect(m.get("flat")).toBe(0);
  expect(m.has("ghost")).toBe(false);
});

it("activityGrid buckets by local day, Monday columns, capped at today", () => {
  const dates = [
    new Date(2026, 7, 28, 21, 0).toISOString(), // Fri
    new Date(2026, 7, 28, 22, 0).toISOString(), // Fri again
    new Date(2026, 7, 24, 20, 0).toISOString(), // Mon
  ];
  const g = activityGrid(dates, NOW, 2);
  expect(g.weeks).toHaveLength(2);
  expect(g.weeks[1][0]).toEqual({ date: "2026-08-24", count: 1 });
  expect(g.weeks[1][4]).toEqual({ date: "2026-08-28", count: 2 });
  // Saturday is today: the column holds Mon..Sat, never tomorrow
  expect(g.weeks[1]).toHaveLength(6);
  expect(g.max).toBe(2);
  expect(g.total).toBe(3);
});

it("headToHead counts decided games per opponent, busiest rivalry first", () => {
  const ms = [
    played({ opponentIds: ["x"], winner: "a" }),
    played({ opponentIds: ["x"], winner: "b" }),
    played({ opponentIds: ["x", "y"], winner: "a" }),
    played({ opponentIds: ["y"], winner: null }),
  ];
  expect(headToHead(ms)).toEqual([
    { opponentId: "x", wins: 2, losses: 1 },
    { opponentId: "y", wins: 1, losses: 0 },
  ]);
});

it("deuce logic gates on settingAt and ignores games that never got there", () => {
  const ms = [
    played({ settingAt: 20, games: [{ a: 22, b: 20 }, { a: 21, b: 12 }] }),
    played({ settingAt: 20, games: [{ a: 20, b: 22 }], winner: "b" }),
    played({ settingAt: null, games: [{ a: 32, b: 30 }] }),
  ] as (PlayedMatch & { settingAt: number | null })[];
  expect(deuceRecord(ms)).toEqual({ won: 1, lost: 1 });
});

it("deuceTable credits every participant by side", () => {
  const snap = {
    config: PRESETS.bwf1x21,
    games: [{ a: 22, b: 20 }],
  } as unknown as MatchState;
  const m: FullMatch = {
    created_at: "2026-08-20T12:00:00Z",
    snapshot: snap,
    participants: [
      { player_id: "p1", side: "a" },
      { player_id: "p2", side: "b" },
    ],
  };
  const t = deuceTable([m]);
  expect(t.get("p1")).toEqual({ won: 1, lost: 0 });
  expect(t.get("p2")).toEqual({ won: 0, lost: 1 });
});

// build a real rally sequence: side B leads 0-5, side A wins 21-x
function comebackSnapshot(): MatchState {
  let s = createMatch(PRESETS.bwf1x21);
  const feed = (side: Side, n: number) => {
    for (let i = 0; i < n; i++) s = applyMatchPoint(s, side);
  };
  feed("b", 5);
  feed("a", 21);
  return s;
}

it("biggestComeback finds the deficit the winner dug out of", () => {
  const m: FullMatch = {
    created_at: "2026-08-20T12:00:00Z",
    snapshot: comebackSnapshot(),
    participants: [
      { player_id: "hero", side: "a" },
      { player_id: "z", side: "b" },
    ],
  };
  const quick: FullMatch = {
    created_at: "2026-08-21T12:00:00Z",
    // quick-logged: no rally data, must be skipped, never crash
    snapshot: { config: PRESETS.bwf1x21, points: [], games: [{ a: 21, b: 5 }] } as unknown as MatchState,
    participants: [],
  };
  const best = biggestComeback([m, quick]);
  expect(best).toMatchObject({ winnerIds: ["hero"], deficit: 5, score: "21–5" });
});

it("groupSentences gates every line and ships at most three", () => {
  expect(
    groupSentences({
      comeback: null,
      climber: { name: "Rajat", delta: 4 },
      clutch: { name: "Sai", won: 2, lost: 0 },
      bestDuo: { names: "A & B", winPct: 80, games: 2 },
      hotStreak: { name: "Gautam", streak: 2 },
    })
  ).toEqual([]);
  const all = groupSentences({
    comeback: { names: "A & B", deficit: 7, score: "23–21", winnerIds: [], created_at: "" },
    climber: { name: "Rajat", delta: 22 },
    clutch: { name: "Sai", won: 5, lost: 1 },
    bestDuo: { names: "A & B", winPct: 80, games: 6 },
    hotStreak: { name: "Gautam", streak: 5 },
  });
  expect(all).toHaveLength(3);
  expect(all[0]).toBe("A & B came back from 7 down to take it 23–21, live scored.");
  expect(all[1]).toBe("Rajat climbed 22 this week.");
  expect(all[2]).toBe("Sai wins 83% of games that reach deuce (6 played).");
});

it("garbage snapshots are skipped, never a crash: one bad row must not take the tab down", () => {
  const junk: FullMatch[] = [
    { created_at: "2026-08-20T12:00:00Z", snapshot: {} as MatchState, participants: [] },
    { created_at: "2026-08-20T12:00:00Z", snapshot: { points: "x", config: 7 } as unknown as MatchState, participants: [] },
    { created_at: "2026-08-20T12:00:00Z", snapshot: { config: { kind: "standard", game: { settingAt: 20 } }, games: "no" } as unknown as MatchState, participants: [] },
    { created_at: "2026-08-20T12:00:00Z", snapshot: null, participants: [] },
    // a "standard" config with no game block
    { created_at: "2026-08-20T12:00:00Z", snapshot: { config: { kind: "standard" }, games: [{ a: 22, b: 20 }] } as unknown as MatchState, participants: [] },
  ];
  expect(biggestComeback(junk)).toBeNull();
  expect(deuceTable(junk).size).toBe(0);
});
