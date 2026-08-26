import { parseBulk, suggest } from "./bulk";

const M = [
  { id: "rp", name: "Rahul Pareek" },
  { id: "rd", name: "Rahul Deo" },
  { id: "sk", name: "Sai Kiran" },
  { id: "g", name: "Gautam" },
  { id: "mj", name: "Mitrajit" },
  { id: "rj", name: "Rajat" },
  { id: "pw", name: "Prajwal" },
];

const one = (text: string) => {
  const r = parseBulk(text, M);
  expect(r.errors).toEqual([]);
  expect(r.games).toHaveLength(1);
  return r.games[0];
};

const err = (text: string) => {
  const r = parseBulk(text, M);
  expect(r.games).toEqual([]);
  expect(r.errors).toHaveLength(1);
  return r.errors[0];
};

it("parses a plain 1v1 with a hyphen score", () => {
  expect(one("prajwal 21-19 rajat")).toEqual({
    line: 1,
    a: ["pw"],
    b: ["rj"],
    score: { a: 21, b: 19 },
  });
});

it("parses ampersand pairs", () => {
  const g = one("rahul p & sai 21-15 gautam & mitrajit");
  expect(g.a).toEqual(["rp", "sk"]);
  expect(g.b).toEqual(["g", "mj"]);
});

it("parses slash and comma separators with a spaced score", () => {
  const g = one("Rahul P/Sai 21 15 Gautam, Mitrajit");
  expect(g.a).toEqual(["rp", "sk"]);
  expect(g.b).toEqual(["g", "mj"]);
  expect(g.score).toEqual({ a: 21, b: 15 });
});

it("parses space-only names, pairing two-word members greedily", () => {
  const g = one("gautam mitrajit 21-15 sai kiran prajwal");
  expect(g.a).toEqual(["g", "mj"]);
  expect(g.b).toEqual(["sk", "pw"]);
});

it("parses 'A vs B' with the score at the end", () => {
  const g = one("Prajwal/ Rajat Vs Gautam/ Sai Kiran 21-15");
  expect(g.a).toEqual(["pw", "rj"]);
  expect(g.b).toEqual(["g", "sk"]);
  expect(g.score).toEqual({ a: 21, b: 15 });
});

it("parses space-only names either side of vs", () => {
  const g = one("Rahul P Gautam vs Sai Kiran Mitrajit 21-17");
  expect(g.a).toEqual(["rp", "g"]);
  expect(g.b).toEqual(["sk", "mj"]);
  expect(g.score).toEqual({ a: 21, b: 17 });
});

it("accepts v, v. and v/s as the separator", () => {
  for (const sep of ["v", "v.", "v/s", "vs.", "versus"]) {
    expect(one(`prajwal ${sep} rajat 21-19`).b).toEqual(["rj"]);
  }
});

it("a lone 'v' stays an initial when the line needs it as one", () => {
  const withV = [...M, { id: "rv", name: "Rahul Verma" }, { id: "vk", name: "Vikas" }];
  const g = (text: string) => {
    const r = parseBulk(text, withV);
    expect(r.errors).toEqual([]);
    return r.games[0];
  };
  expect(g("rahul v 21-15 gautam").a).toEqual(["rv"]);
  expect(g("gautam 21-15 v").b).toEqual(["vk"]);
  expect(g("v 21-15 gautam").a).toEqual(["vk"]);
  expect(g("rajat v 21-15 gautam prajwal").a).toEqual(["rj", "vk"]);
  // a real vs outranks an initial earlier on the line
  expect(g("prajwal rahul v vs gautam mitrajit 21-17").a).toEqual(["pw", "rv"]);
});

it("keeps working when vs sits beside a mid-line score", () => {
  const g = one("prajwal vs 21-19 rajat");
  expect(g.a).toEqual(["pw"]);
  expect(g.b).toEqual(["rj"]);
});

it("accepts an en dash score", () => {
  expect(one("prajwal 21–19 rajat").score).toEqual({ a: 21, b: 19 });
});

it("accepts a colon score", () => {
  expect(one("prajwal 21:15 rajat").score).toEqual({ a: 21, b: 15 });
});

it("resolves first-name prefixes", () => {
  const g = one("raj 21-15 pra");
  expect(g.a).toEqual(["rj"]);
  expect(g.b).toEqual(["pw"]);
});

it("matches Sai Kiran by 'sai'", () => {
  expect(one("sai 21-15 gautam").a).toEqual(["sk"]);
});

it("names the clash when a prefix hits two members", () => {
  expect(err("rahul 21-3 gautam")).toEqual({
    line: 1,
    message: "Two Rahuls in this group. Write 'Rahul Deo' or 'Rahul Pareek'.",
  });
});

it("a second word disambiguates against the full name", () => {
  expect(one("rahul d 21-15 gautam").a).toEqual(["rd"]);
  expect(one("rahul deo 21-15 gautam").a).toEqual(["rd"]);
  expect(one("rahul p 21-15 gautam").a).toEqual(["rp"]);
});

it("an exact first name beats a longer prefix rival", () => {
  const withRaj = [...M, { id: "r", name: "Raj" }];
  const r = parseBulk("raj 21-15 gautam", withRaj);
  expect(r.errors).toEqual([]);
  expect(r.games[0].a).toEqual(["r"]);
});

it("numbered duplicates resolve like any two-word name", () => {
  const twins = [
    { id: "s1", name: "Sai 1" },
    { id: "s2", name: "Sai 2" },
    { id: "g", name: "Gautam" },
  ];
  const r = parseBulk("sai 2 21-15 gautam", twins);
  expect(r.errors).toEqual([]);
  expect(r.games[0].a).toEqual(["s2"]);
});

it("rejects a player on both sides", () => {
  expect(err("rajat 21-15 rajat").message).toBe("Rajat is on both sides.");
});

it("rejects the same player twice on one side", () => {
  expect(err("rajat & rajat 21-15 gautam & sai").message).toBe("Rajat is listed twice.");
});

it("rejects a tie", () => {
  expect(err("prajwal 21-21 rajat").message).toBe("21-21 is a tie. One side has to win.");
});

it("rejects lopsided sides", () => {
  expect(err("rajat 21-15 gautam & sai & mitrajit").message).toBe(
    "Sides must be 1v1 or 2v2, not 1v3."
  );
  expect(err("rajat & prajwal 21-15 gautam").message).toBe(
    "Sides must be 1v1 or 2v2, not 2v1."
  );
});

it("rejects an unknown name", () => {
  expect(err("bob 21-15 rajat").message).toBe("No one called 'bob' in this group.");
});

it("rejects a line with no score", () => {
  expect(err("hello world").message).toBe(
    "No score on this line. Put it between the sides, like 21-15."
  );
});

it("rejects a side with no names", () => {
  expect(err("21-15 rajat").message).toBe("No names before the score.");
  expect(err("rajat 21-15").message).toBe("No names after the score.");
});

it("empty text parses to nothing", () => {
  expect(parseBulk("", M)).toEqual({ games: [], errors: [] });
  expect(parseBulk("\n  \n\n", M)).toEqual({ games: [], errors: [] });
});

it("a bad line never blocks its neighbours, and line numbers count blanks", () => {
  const r = parseBulk("prajwal 21-19 rajat\n\nrahul 21-3 gautam\nsai 21-15 mitrajit", M);
  expect(r.games.map((g) => g.line)).toEqual([1, 4]);
  expect(r.errors).toHaveLength(1);
  expect(r.errors[0].line).toBe(3);
});

// the autocomplete oracle: what the trailing half-word offers, and what
// tapping it must replace
it("suggest completes a half-typed first name", () => {
  const s = suggest("ra", M);
  expect(s.map((x) => x.name)).toEqual(["Rahul Pareek", "Rahul Deo", "Rajat"]);
  expect(s[0].matched).toBe("ra");
});

it("suggest works on the trailing token of a longer line", () => {
  const s = suggest("Rahul Pareek & Sai 21-15 ga", M);
  expect(s.map((x) => x.name)).toEqual(["Gautam"]);
  expect(s[0].matched).toBe("ga");
});

it("suggest prefers the two-word tail so a surname keeps its first name", () => {
  const s = suggest("rahul pa", M);
  expect(s.map((x) => x.name)).toEqual(["Rahul Pareek"]);
  expect(s[0].matched).toBe("rahul pa");
});

it("suggest stays quiet on scores, trailing space and fully typed names", () => {
  expect(suggest("rahul 21", M)).toEqual([]);
  expect(suggest("rahul ", M)).toEqual([]);
  expect(suggest("", M)).toEqual([]);
  expect(suggest("gautam", M)).toEqual([]);
});
