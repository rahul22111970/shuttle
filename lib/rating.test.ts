import { PRESETS } from "@shuttle/score";
import type { MatchState } from "@shuttle/score";
import {
  BASE_K,
  INITIAL_RATING,
  PROVISIONAL_K,
  doublesDeltas,
  singlesDeltas,
  type PlayerRating,
} from "@shuttle/rating";
import { maxMarginFor, pointMarginFor, ratingRowsFor, type RatingRow } from "./rating";

const snapshot = (over: Partial<MatchState>): MatchState =>
  ({
    config: PRESETS.casual1x21,
    points: [],
    games: [{ a: 21, b: 15 }],
    gamesWon: { a: 1, b: 0 },
    score: { a: 0, b: 0 },
    finished: true,
    winner: "a",
    events: [],
    ...over,
  }) as unknown as MatchState;

const matchOf = (
  snap: MatchState,
  participants: { player_id: string; side: "a" | "b" }[]
) => ({ id: "m1", group_id: "g1", config: snap.config, snapshot: snap, participants });

const fresh = (): PlayerRating => ({ rating: INITIAL_RATING, matchesPlayed: 0 });

it("maxMargin: casual 21, bwf3x21 with cap 30 is 60, americano is its pot", () => {
  expect(maxMarginFor(PRESETS.casual1x21)).toBe(21);
  expect(maxMarginFor(PRESETS.bwf3x21)).toBe((PRESETS.bwf3x21.game.cap ?? 21) * 2);
  expect(maxMarginFor({ kind: "americano", totalPoints: 24 })).toBe(24);
});

it("pointMargin sums across games from the winner's side", () => {
  const s = snapshot({
    winner: "b",
    games: [
      { a: 21, b: 17 },
      { a: 10, b: 21 },
      { a: 19, b: 21 },
    ],
  });
  // b total 59, a total 50
  expect(pointMarginFor(s)).toBe(9);
});

// the S1-06 review contract, by name: the engine throws on negative
// margins, so a bestOf winner outscored on total points rates at margin 0
it("bestof_points_deficit_clamps_to_zero", () => {
  const s = snapshot({
    winner: "a",
    games: [
      { a: 21, b: 19 },
      { a: 0, b: 21 },
      { a: 21, b: 19 },
    ],
  });
  // a total 42, b total 59: winner is 17 down
  expect(pointMarginFor(s)).toBe(0);
});

// the symmetric twin of the zero clamp: quick-log accepts implausible
// totals, and the engine throws above maxMargin — clamp, never crash
it("quicklog_margin_clamps_to_max", () => {
  const state = new Map([
    ["w1", fresh()],
    ["l1", fresh()],
  ]);
  const s40 = snapshot({ games: [{ a: 40, b: 5 }] });
  const rows = ratingRowsFor(
    matchOf(s40, [
      { player_id: "w1", side: "a" },
      { player_id: "l1", side: "b" },
    ]),
    state
  );
  const capped = singlesDeltas(fresh(), fresh(), 21, 21);
  expect(rows.find((r) => r.player_id === "w1")?.rating_after).toBe(
    Math.round(INITIAL_RATING + capped.winner)
  );
});

it("a decided singles writes 2 rows matching the engine fixture", () => {
  const state = new Map([
    ["w1", fresh()],
    ["l1", fresh()],
  ]);
  const rows = ratingRowsFor(
    matchOf(snapshot({}), [
      { player_id: "w1", side: "a" },
      { player_id: "l1", side: "b" },
    ]),
    state
  );
  const d = singlesDeltas(fresh(), fresh(), 6, 21);
  expect(rows).toHaveLength(2);
  const w = rows.find((r) => r.player_id === "w1") as RatingRow;
  const l = rows.find((r) => r.player_id === "l1") as RatingRow;
  expect(w.rating_after).toBe(Math.round(INITIAL_RATING + d.winner));
  expect(l.rating_after).toBe(Math.round(INITIAL_RATING + d.loser));
  expect(w.k).toBe(PROVISIONAL_K);
});

it("a decided doubles writes 4 rows; the stronger partner gains less", () => {
  const state = new Map<string, PlayerRating>([
    ["strong", { rating: 1400, matchesPlayed: 20 }],
    ["weak", { rating: 1100, matchesPlayed: 20 }],
    ["o1", { rating: 1200, matchesPlayed: 20 }],
    ["o2", { rating: 1200, matchesPlayed: 20 }],
  ]);
  const rows = ratingRowsFor(
    matchOf(snapshot({}), [
      { player_id: "strong", side: "a" },
      { player_id: "weak", side: "a" },
      { player_id: "o1", side: "b" },
      { player_id: "o2", side: "b" },
    ]),
    state
  );
  expect(rows).toHaveLength(4);
  const gain = (id: string) => {
    const r = rows.find((x) => x.player_id === id) as RatingRow;
    return r.rating_after - r.rating_before;
  };
  expect(gain("strong")).toBeLessThan(gain("weak"));
  const d = doublesDeltas(
    [state.get("strong") as PlayerRating, state.get("weak") as PlayerRating],
    [state.get("o1") as PlayerRating, state.get("o2") as PlayerRating],
    6,
    21
  );
  expect(gain("strong")).toBe(
    Math.round(1400 + d.winners[0]) - 1400
  );
  const r = rows.find((x) => x.player_id === "strong") as RatingRow;
  expect(r.k).toBe(BASE_K);
});

it("draws, participant-less and lopsided matches rate nobody", () => {
  const state = new Map([
    ["p1", fresh()],
    ["p2", fresh()],
    ["p3", fresh()],
  ]);
  expect(
    ratingRowsFor(
      matchOf(snapshot({ winner: null }), [
        { player_id: "p1", side: "a" },
        { player_id: "p2", side: "b" },
      ]),
      state
    )
  ).toEqual([]);
  expect(ratingRowsFor(matchOf(snapshot({}), []), state)).toEqual([]);
  expect(
    ratingRowsFor(
      matchOf(snapshot({}), [
        { player_id: "p1", side: "a" },
        { player_id: "p2", side: "a" },
        { player_id: "p3", side: "b" },
      ]),
      state
    )
  ).toEqual([]);
});
