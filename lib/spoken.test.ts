import { parseSpoken } from "./spoken";

const members = [
  { id: "rp", name: "Rahul Pareek" },
  { id: "rd", name: "Rahul Deo" },
  { id: "sk", name: "Sai Kiran" },
  { id: "bb", name: "Baibhab" },
  { id: "rj", name: "Rajat" },
  { id: "gt", name: "Gautam" },
];

const ok = (r: ReturnType<typeof parseSpoken>) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.message}`);
  return r.game;
};

it("parses the canonical spoken sentence, winner-first score", () => {
  const g = ok(
    parseSpoken("Rahul p and Sai versus Baibhab and Rajat, Rahul p won 21-16", members)
  );
  expect(g.a).toEqual(["rp", "sk"]);
  expect(g.b).toEqual(["bb", "rj"]);
  expect(g.score).toEqual({ a: 21, b: 16 });
});

it("flips the score when the second side won", () => {
  const g = ok(
    parseSpoken("rahul p and sai vs baibhab and rajat baibhab won 21 18", members)
  );
  expect(g.score).toEqual({ a: 18, b: 21 });
});

it("survives recogniser mush: lowercase, no punctuation, spaced score", () => {
  const g = ok(parseSpoken("gautam and rajat versus sai and baibhab gautam won 21 12", members));
  expect(g.a).toEqual(["gt", "rj"]);
  expect(g.score).toEqual({ a: 21, b: 12 });
});

it("understands spelled-out numbers", () => {
  const g = ok(parseSpoken("rajat versus gautam rajat won twenty one nineteen", members));
  expect(g.score).toEqual({ a: 21, b: 19 });
});

it("winner's points win even if spoken low-first", () => {
  const g = ok(parseSpoken("rajat versus gautam gautam won 15 21", members));
  expect(g.score).toEqual({ a: 15, b: 21 });
});

it("parses the beat form, singles", () => {
  const g = ok(parseSpoken("rajat beat gautam 21-12", members));
  expect(g.a).toEqual(["rj"]);
  expect(g.b).toEqual(["gt"]);
  expect(g.score).toEqual({ a: 21, b: 12 });
});

it("falls through to the bulk line grammar", () => {
  const g = ok(parseSpoken("rahul p & sai 21-15 baibhab & rajat", members));
  expect(g.a).toEqual(["rp", "sk"]);
  expect(g.score).toEqual({ a: 21, b: 15 });
});

it("a two-Rahuls clash names the fix, not a guess", () => {
  const r = parseSpoken("rahul and sai versus baibhab and rajat rahul won 21-16", members);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(/Rahul/);
});

it("a missing winner is refused with the hint", () => {
  const r = parseSpoken("rajat versus gautam 21-16", members);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(/who won/i);
});

it("an unknown name is refused with the resolver's message", () => {
  const r = parseSpoken("vikram beat gautam 21-3", members);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(/No one called/);
});

it("empty and garbage utterances get the teaching hint", () => {
  for (const t of ["", "uh hello", "score kya tha"]) {
    const r = parseSpoken(t, members);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Say it like/);
  }
});

// field bug 2026-08-11: the recogniser fuses "21-18" into "2118"
it("splits a fused four-digit score the way Pavitra's game needed", () => {
  const withPavitra = [...members, { id: "pv", name: "Pavitra" }];
  const g = ok(parseSpoken("rajat versus pavitra pavitra won 2118", withPavitra));
  expect(g.a).toEqual(["rj"]);
  expect(g.b).toEqual(["pv"]);
  expect(g.score).toEqual({ a: 18, b: 21 });
});

it("splits a fused three-digit score preferring the game-point half", () => {
  const g = ok(parseSpoken("rajat beat gautam 218", members));
  expect(g.score).toEqual({ a: 21, b: 8 });
});

it("splits a fused deuce score", () => {
  const g = ok(parseSpoken("rajat beat gautam 3028", members));
  expect(g.score).toEqual({ a: 30, b: 28 });
});

it("a fused tie is refused, never guessed", () => {
  const r = parseSpoken("rajat versus gautam rajat won 2121", members);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(/tie/i);
});
