import { groupAnalytics, type RatingRow, type StatsMatch } from "./analytics";

// hand-computed oracle fixtures: every expected number worked out on paper
// before the assertion was written.

const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();

const match = (
  day: number,
  a: string[],
  b: string[],
  scores: { a: number; b: number }[],
  winner?: "a" | "b" | null
): StatsMatch => {
  const totals = scores.reduce((t, g) => ({ a: t.a + g.a, b: t.b + g.b }), { a: 0, b: 0 });
  return {
    created_at: at(day),
    snapshot: {
      winner: winner !== undefined ? winner : totals.a === totals.b ? null : totals.a > totals.b ? "a" : "b",
      games: scores,
      score: { a: 0, b: 0 },
    },
    participants: [
      ...a.map((player_id) => ({ player_id, side: "a" as const })),
      ...b.map((player_id) => ({ player_id, side: "b" as const })),
    ],
  };
};

const rating = (player_id: string, rating_after: number, day: number): RatingRow => ({
  player_id,
  rating_after,
  created_at: at(day),
});

const row = (r: ReturnType<typeof groupAnalytics>, id: string) => {
  const found = r.leaderboard.find((x) => x.playerId === id);
  if (!found) throw new Error(`no leaderboard row for ${id}`);
  return found;
};

it("empty inputs yield an empty season", () => {
  const r = groupAnalytics([], []);
  expect(r.leaderboard).toEqual([]);
  expect(r.duos).toEqual([]);
  expect(r.superlatives).toEqual({ mostGames: null, bestDuo: null, hotStreak: null, biggestWin: null });
});

it("one singles game writes both rows: 1-0 at 100% vs 0-1 at 0%", () => {
  const r = groupAnalytics([match(1, ["A"], ["B"], [{ a: 21, b: 15 }])], []);
  expect(row(r, "A")).toEqual({
    playerId: "A", rating: 1200, gamesPlayed: 1, wins: 1, losses: 0,
    winPct: 100, pointsFor: 21, streak: 1, form: ["w"],
  });
  expect(row(r, "B")).toEqual({
    playerId: "B", rating: 1200, gamesPlayed: 1, wins: 0, losses: 1,
    winPct: 0, pointsFor: 15, streak: -1, form: ["l"],
  });
  // equal ratings: the winner sorts first
  expect(r.leaderboard[0].playerId).toBe("A");
});

it("rating is the latest rating_after; unrated players hold 1200", () => {
  const r = groupAnalytics(
    [match(1, ["A"], ["B"], [{ a: 21, b: 15 }])],
    [rating("A", 1232, 1), rating("A", 1260, 2)]
  );
  expect(row(r, "A").rating).toBe(1260);
  expect(row(r, "B").rating).toBe(1200);
});

it("a rated player with no games still appears, 0 games and no win %", () => {
  const r = groupAnalytics([], [rating("C", 1300, 1)]);
  expect(row(r, "C")).toEqual({
    playerId: "C", rating: 1300, gamesPlayed: 0, wins: 0, losses: 0,
    winPct: null, pointsFor: 0, streak: 0, form: [],
  });
});

it("the leaderboard sorts by rating, descending", () => {
  const r = groupAnalytics(
    [match(1, ["A"], ["B"], [{ a: 21, b: 15 }])],
    [rating("A", 1210, 1), rating("B", 1350, 1), rating("C", 1250, 1)]
  );
  expect(r.leaderboard.map((x) => x.playerId)).toEqual(["B", "C", "A"]);
});

it("draws count as games played but never move win %", () => {
  // A: draw, win, draw → 1 of 1 decided = 100%, 3 games, 51 points for
  const r = groupAnalytics(
    [
      match(1, ["A"], ["B"], [{ a: 15, b: 15 }], null),
      match(2, ["A"], ["B"], [{ a: 21, b: 10 }]),
      match(3, ["A"], ["B"], [{ a: 15, b: 15 }], null),
    ],
    []
  );
  expect(row(r, "A").gamesPlayed).toBe(3);
  expect(row(r, "A").winPct).toBe(100);
  expect(row(r, "A").pointsFor).toBe(51);
  // the most recent decided run is broken by the draw on top
  expect(row(r, "A").streak).toBe(0);
});

it("form holds the last 5, most recent first; streak is signed", () => {
  // A oldest→newest: w w w l l → form l,l,w,w,w; streak -2
  const days = [1, 2, 3, 4, 5];
  const games = days.map((d) =>
    match(d, ["A"], ["B"], d <= 3 ? [{ a: 21, b: 12 }] : [{ a: 12, b: 21 }])
  );
  // a sixth, oldest win that must fall off the form window
  const r = groupAnalytics([match(0, ["A"], ["B"], [{ a: 21, b: 1 }]), ...games], []);
  expect(row(r, "A").form).toEqual(["l", "l", "w", "w", "w"]);
  expect(row(r, "A").streak).toBe(-2);
  expect(row(r, "B").streak).toBe(2);
  expect(row(r, "A").gamesPlayed).toBe(6);
});

it("pointsFor sums the player's side across multi-game matches", () => {
  const r = groupAnalytics(
    [match(1, ["A"], ["B"], [{ a: 21, b: 18 }, { a: 19, b: 21 }, { a: 21, b: 15 }])],
    []
  );
  expect(row(r, "A").pointsFor).toBe(61);
  expect(row(r, "B").pointsFor).toBe(54);
});

it("a snapshot with only a score still counts as one game", () => {
  const r = groupAnalytics(
    [{ ...match(1, ["A"], ["B"], []), snapshot: { winner: "a", games: [], score: { a: 21, b: 7 } } }],
    []
  );
  expect(row(r, "A").pointsFor).toBe(21);
  expect(row(r, "A").wins).toBe(1);
});

it("duos need 2 games together; best pair first", () => {
  // A&B: 2 games, 2 wins = 100%. C&D: 2 games, 0 wins = 0%. A&C: 1 game, out.
  const r = groupAnalytics(
    [
      match(1, ["A", "B"], ["C", "D"], [{ a: 21, b: 15 }]),
      match(2, ["A", "B"], ["C", "D"], [{ a: 21, b: 18 }]),
      match(3, ["A", "C"], ["B", "D"], [{ a: 21, b: 19 }]),
    ],
    []
  );
  expect(r.duos).toEqual([
    { ids: ["A", "B"], games: 2, wins: 2, winPct: 100 },
    { ids: ["C", "D"], games: 2, wins: 0, winPct: 0 },
  ]);
  expect(r.superlatives.bestDuo).toEqual({ ids: ["A", "B"], winPct: 100, games: 2 });
});

it("a duo with only draws carries no win % and is never the best pair", () => {
  const r = groupAnalytics(
    [
      match(1, ["A", "B"], ["C", "D"], [{ a: 15, b: 15 }], null),
      match(2, ["A", "B"], ["C", "D"], [{ a: 11, b: 11 }], null),
    ],
    []
  );
  expect(r.duos[0]).toEqual({ ids: ["A", "B"], games: 2, wins: 0, winPct: null });
  expect(r.superlatives.bestDuo).toBeNull();
});

it("most games: the higher-rated player takes a tie", () => {
  const r = groupAnalytics(
    [match(1, ["A"], ["B"], [{ a: 21, b: 15 }]), match(2, ["A"], ["B"], [{ a: 15, b: 21 }])],
    [rating("B", 1300, 2), rating("A", 1250, 2)]
  );
  expect(r.superlatives.mostGames).toEqual({ playerId: "B", n: 2 });
});

it("hot streak: the longest current winning run; null when nobody is winning", () => {
  // A wins 1, then B wins 2 → B on W2, A on L2
  const r = groupAnalytics(
    [
      match(1, ["A"], ["B"], [{ a: 21, b: 15 }]),
      match(2, ["A"], ["B"], [{ a: 10, b: 21 }]),
      match(3, ["A"], ["B"], [{ a: 12, b: 21 }]),
    ],
    []
  );
  expect(r.superlatives.hotStreak).toEqual({ playerId: "B", streak: 2 });

  // one decided game: only the loser has a current run after a draw on top
  const none = groupAnalytics(
    [
      match(1, ["A"], ["B"], [{ a: 21, b: 15 }]),
      match(2, ["A"], ["B"], [{ a: 15, b: 15 }], null),
    ],
    []
  );
  expect(none.superlatives.hotStreak).toBeNull();
});

it("biggest win: largest margin, winner-first score; a tie goes to the newer game", () => {
  const r = groupAnalytics(
    [
      match(1, ["A", "B"], ["C", "D"], [{ a: 21, b: 5 }]), // margin 16
      match(2, ["A", "B"], ["C", "D"], [{ a: 10, b: 21 }]), // margin 11
      match(3, ["E"], ["F"], [{ a: 5, b: 21 }]), // margin 16, newer
    ],
    []
  );
  expect(r.superlatives.biggestWin).toEqual({
    winnerIds: ["F"],
    loserIds: ["E"],
    margin: 16,
    score: "21–5",
  });
});
