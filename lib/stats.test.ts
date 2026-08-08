import {
  CHEMISTRY_FLOOR,
  chemistry,
  currentStreak,
  lastTen,
  winPct,
  type PlayedMatch,
} from "./stats";

// fixtures: most recent first, matching fetchPlayedMatches order
let seq = 0;
const match = (
  outcome: "w" | "l" | "d",
  partnerIds: string[] = []
): PlayedMatch => {
  const side = "a" as const;
  seq++;
  return {
    id: `m${seq}`,
    groupId: "g1",
    createdAt: new Date(2026, 0, 100 - seq).toISOString(),
    side,
    winner: outcome === "d" ? null : outcome === "w" ? "a" : "b",
    games: [{ a: 21, b: 15 }],
    partnerIds,
    opponentIds: ["opp"],
  };
};

it("zero matches: no win %, no streak, empty form", () => {
  expect(winPct([])).toBeNull();
  expect(currentStreak([])).toBe(0);
  expect(lastTen([])).toEqual([]);
  expect(chemistry([])).toEqual([]);
});

it("all losses: 0% and a negative streak", () => {
  const ms = [match("l"), match("l"), match("l")];
  expect(winPct(ms)).toBe(0);
  expect(currentStreak(ms)).toBe(-3);
  expect(lastTen(ms)).toEqual(["l", "l", "l"]);
});

it("draws are excluded from win % (tie handling)", () => {
  // 1 win, 1 loss, 2 draws -> 50%, not 25%
  const ms = [match("w"), match("d"), match("l"), match("d")];
  expect(winPct(ms)).toBe(50);
});

it("all draws: win % is null, not 0", () => {
  expect(winPct([match("d"), match("d")])).toBeNull();
});

it("streak counts from the most recent and a draw breaks it", () => {
  expect(currentStreak([match("w"), match("w"), match("l")])).toBe(2);
  expect(currentStreak([match("l"), match("w")])).toBe(-1);
  expect(currentStreak([match("d"), match("w"), match("w")])).toBe(0);
  expect(currentStreak([match("w"), match("d"), match("w")])).toBe(1);
});

it("last-10 form truncates at ten, most recent first", () => {
  const ms = Array.from({ length: 12 }, (_, i) => match(i % 2 === 0 ? "w" : "l"));
  const form = lastTen(ms);
  expect(form).toHaveLength(10);
  expect(form[0]).toBe("w");
  expect(form[1]).toBe("l");
});

it("chemistry excludes partners under the 3-match floor", () => {
  const ms = [
    match("w", ["asha"]),
    match("w", ["asha"]),
    match("l", ["asha"]),
    match("w", ["bela"]),
    match("w", ["bela"]),
  ];
  const chem = chemistry(ms);
  expect(chem).toHaveLength(1);
  expect(chem[0]).toEqual({ partnerId: "asha", played: 3, winPct: 67 });
  expect(CHEMISTRY_FLOOR).toBe(3);
});

it("chemistry win % ignores drawn games together but counts them toward the floor", () => {
  const ms = [match("w", ["asha"]), match("d", ["asha"]), match("d", ["asha"])];
  expect(chemistry(ms)).toEqual([{ partnerId: "asha", played: 3, winPct: 100 }]);
});

it("chemistry sorts best percentage first, then games played", () => {
  const ms = [
    match("l", ["asha"]),
    match("w", ["asha"]),
    match("w", ["asha"]),
    match("w", ["bela"]),
    match("w", ["bela"]),
    match("w", ["bela"]),
    match("w", ["bela"]),
  ];
  const chem = chemistry(ms);
  expect(chem.map((c) => c.partnerId)).toEqual(["bela", "asha"]);
});

it("equal percentages fall back to games played", () => {
  // asha 1 of 2 decided (a draw pads the floor), bela 2 of 4: both 50%
  const eq = [
    match("w", ["asha"]),
    match("l", ["asha"]),
    match("d", ["asha"]),
    match("w", ["bela"]),
    match("w", ["bela"]),
    match("l", ["bela"]),
    match("l", ["bela"]),
  ];
  const chem = chemistry(eq);
  expect(chem[0]).toMatchObject({ partnerId: "bela", winPct: 50, played: 4 });
  expect(chem[1]).toMatchObject({ partnerId: "asha", winPct: 50, played: 3 });
});

// independent oracle: percentages recomputed by hand, never via the
// implementation's own arithmetic
it("a hand-checked season: 6 wins 3 losses 1 draw reads 67%, streak +2", () => {
  const ms = [
    match("w"),
    match("w"),
    match("l"),
    match("w"),
    match("d"),
    match("w"),
    match("l"),
    match("w"),
    match("w"),
    match("l"),
  ];
  expect(winPct(ms)).toBe(67); // 6 of 9 decided
  expect(currentStreak(ms)).toBe(2);
  expect(lastTen(ms)).toEqual(["w", "w", "l", "w", "d", "w", "l", "w", "w", "l"]);
});
