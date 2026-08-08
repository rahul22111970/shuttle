import { nextGame } from "./rounds";

const games = (entries: [string, number][]) => new Map(entries);

test("two checked in deal a singles game in arrival order", () => {
  expect(nextGame(["asha", "bela"], games([]))).toEqual({ a: ["asha"], b: ["bela"] });
});

test("fewer than two checked in deals nothing", () => {
  expect(nextGame([], games([]))).toBeNull();
  expect(nextGame(["asha"], games([]))).toBeNull();
});

test("exactly three checked in deals nothing", () => {
  expect(nextGame(["asha", "bela", "chirag"], games([]))).toBeNull();
});

test("six checked in: the four least-played are dealt, arrival breaks ties", () => {
  // games: A2 B1 C0 D0 E1 F3 → least-played four are C, D (0 games, C arrived
  // first), then B, E (1 game, B arrived first). A and F sit.
  const deal = nextGame(
    ["A", "B", "C", "D", "E", "F"],
    games([["A", 2], ["B", 1], ["C", 0], ["D", 0], ["E", 1], ["F", 3]])
  );
  expect(deal).not.toBeNull();
  expect([...deal!.a, ...deal!.b].sort()).toEqual(["B", "C", "D", "E"]);
});

test("the two least-played land on opposite sides", () => {
  // sorted picks C, D, B, E split 1st+4th vs 2nd+3rd
  const deal = nextGame(
    ["A", "B", "C", "D", "E"],
    games([["A", 2], ["B", 1], ["C", 0], ["D", 0], ["E", 1]])
  );
  expect(deal).toEqual({ a: ["C", "E"], b: ["D", "B"] });
});

test("deterministic: the same input deals the same game", () => {
  const order = ["A", "B", "C", "D", "E"] as const;
  const tally = games([["A", 2], ["B", 1], ["E", 1]]);
  expect(nextGame(order, tally)).toEqual(nextGame(order, tally));
});
