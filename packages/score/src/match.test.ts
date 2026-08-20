import fc from "fast-check";
import {
  americano,
  applyMatchPoint,
  createMatch,
  pickleball,
  PRESETS,
  scoreCall,
  undo,
  type MatchConfig,
  type MatchState,
  type Side,
} from "@shuttle/score";

const RUNS = { numRuns: 1000 };

const gameArb = fc
  .record({
    pointsToWin: fc.integer({ min: 2, max: 25 }),
    deuce: fc.boolean(),
    capExtra: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }),
  })
  .map(({ pointsToWin, deuce, capExtra }) => ({
    pointsToWin,
    settingAt: deuce ? pointsToWin - 1 : null,
    cap: capExtra === null ? null : pointsToWin + capExtra,
  }));

const standardArb: fc.Arbitrary<MatchConfig> = fc
  .record({
    bestOf: fc.constantFrom(1, 3, 5),
    game: gameArb,
    interval: fc.boolean(),
  })
  .map(({ bestOf, game, interval }) => ({
    kind: "standard" as const,
    bestOf,
    game,
    midGameIntervalAt: interval && game.pointsToWin > 1 ? Math.max(1, Math.ceil(game.pointsToWin / 2)) : null,
  }));

const configArb: fc.Arbitrary<MatchConfig> = fc.oneof(
  standardArb,
  fc.integer({ min: 1, max: 48 }).map(americano)
);

const seqArb = fc.array(fc.constantFrom<Side>("a", "b"), { maxLength: 400 });

// apply a raw sequence, stopping at the finish line
function play(config: MatchConfig, seq: Side[]): MatchState {
  let state = createMatch(config);
  for (const side of seq) {
    if (state.finished) break;
    state = applyMatchPoint(state, side);
  }
  return state;
}

it("undo then replay equals the pre-undo state, for any event sequence", () => {
  fc.assert(
    fc.property(configArb, seqArb, fc.constantFrom<Side>("a", "b"), (config, seq, extra) => {
      const before = play(config, seq);
      if (before.finished) return;
      const after = applyMatchPoint(before, extra);
      const undone = undo(after);
      expect(undone).toEqual(before);
      // and the "then replay" half: reapplying the same point restores it all
      expect(applyMatchPoint(undone, extra)).toEqual(after);
    }),
    RUNS
  );
});

it("bestOf terminates at ceil(n/2) games, and not before", () => {
  fc.assert(
    fc.property(standardArb, seqArb, (config, seq) => {
      const state = play(config, seq);
      if (config.kind !== "standard") return;
      const need = Math.ceil(config.bestOf / 2);
      if (state.finished) {
        expect(state.winner).not.toBeNull();
        expect(state.gamesWon[state.winner as Side]).toBe(need);
        const loser: Side = state.winner === "a" ? "b" : "a";
        expect(state.gamesWon[loser]).toBeLessThan(need);
        expect(state.games.length).toBeLessThanOrEqual(config.bestOf);
      } else {
        expect(state.gamesWon.a).toBeLessThan(need);
        expect(state.gamesWon.b).toBeLessThan(need);
      }
    }),
    RUNS
  );
});

it("interval events fire exactly once per threshold crossing", () => {
  fc.assert(
    fc.property(
      standardArb.filter((c) => c.kind === "standard" && c.midGameIntervalAt !== null),
      seqArb,
      (config, seq) => {
        if (config.kind !== "standard" || config.midGameIntervalAt === null) return;
        const t = config.midGameIntervalAt;
        const state = play(config, seq);
        const intervals = state.events.filter((e) => e.type === "interval");
        // independent oracle: a completed game always crossed the threshold
        // (its winner scored past it), so it owns exactly one interval; the
        // current game owns one iff its leading score has reached it.
        for (let g = 0; g < state.games.length; g++) {
          expect(intervals.filter((e) => e.game === g).length).toBe(1);
        }
        const currentIdx = state.games.length;
        const currentCrossed =
          !state.finished && Math.max(state.score.a, state.score.b) >= t;
        expect(intervals.filter((e) => e.game === currentIdx).length).toBe(
          currentCrossed ? 1 : 0
        );
        // no stray events pointing at game indices that do not exist
        expect(intervals.length).toBe(state.games.length + (currentCrossed ? 1 : 0));
        // and one game_break between consecutive games, none after the last
        const breaks = state.events.filter((e) => e.type === "game_break");
        const expectedBreaks = state.finished ? state.games.length - 1 : state.games.length;
        expect(breaks.length).toBe(expectedBreaks);
      }
    ),
    RUNS
  );
});

it("americano ends at exactly the points total, winner is the leader, ties are real", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 48 }), seqArb, (total, seq) => {
      const state = play(americano(total), seq);
      expect(state.score.a + state.score.b).toBeLessThanOrEqual(total);
      if (state.finished) {
        expect(state.score.a + state.score.b).toBe(total);
        if (state.score.a === state.score.b) expect(state.winner).toBeNull();
        else expect(state.winner).toBe(state.score.a > state.score.b ? "a" : "b");
      } else {
        expect(state.winner).toBeNull();
      }
    }),
    RUNS
  );
});

it("identical sequences yield identical match states", () => {
  fc.assert(
    fc.property(configArb, seqArb, (config, seq) => {
      expect(play(config, seq)).toEqual(play(config, seq));
    }),
    RUNS
  );
});

// Preset constants, asserted literally against RESEARCH §5.
it("bwf3x21 is 3 games of 21, setting 20, cap 30, breather at 11", () => {
  expect(PRESETS.bwf3x21).toEqual({
    kind: "standard",
    bestOf: 3,
    game: { pointsToWin: 21, settingAt: 20, cap: 30 },
    midGameIntervalAt: 11,
  });
});

it("bwf3x15 is the 2027 law: 3 games of 15, setting 14, cap 21, breather at 8", () => {
  expect(PRESETS.bwf3x15).toEqual({
    kind: "standard",
    bestOf: 3,
    game: { pointsToWin: 15, settingAt: 14, cap: 21 },
    midGameIntervalAt: 8,
  });
});

it("bwf1x21 is one game to 21 with the BWF deuce ending", () => {
  expect(PRESETS.bwf1x21).toEqual({
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin: 21, settingAt: 20, cap: 30 },
    midGameIntervalAt: 11,
  });
});

it("refuses points after the match ends and undo on an empty list", () => {
  const done = play(americano(1), ["a"]);
  expect(done.finished).toBe(true);
  expect(() => applyMatchPoint(done, "b")).toThrow("after the match ended");
  expect(() => undo(createMatch(americano(4)))).toThrow("nothing to undo");
});

it("refuses nonsense match configs", () => {
  expect(() => createMatch({ kind: "americano", totalPoints: 0 })).toThrow();
  expect(() =>
    createMatch({ ...PRESETS.bwf3x21, bestOf: 2 })
  ).toThrow("odd");
  expect(() =>
    createMatch({ ...PRESETS.bwf3x21, midGameIntervalAt: 21 })
  ).toThrow("midGameIntervalAt");
});

// ---------------------------------------------------------------------------
// Pickleball side-out scoring, asserted against the 2026 USA Pickleball
// Official Rulebook. `points` is the RALLY WINNER list, so these sequences
// read as "who won each rally", not "who scored".
// ---------------------------------------------------------------------------

const rallies = (config: MatchConfig, seq: readonly Side[]): MatchState =>
  seq.reduce<MatchState>((s, side) => applyMatchPoint(s, side), createMatch(config));

it("pickleball(11, doubles) is one game to 11, win by two, no cap, end change at 6", () => {
  expect(pickleball(11, true)).toEqual({
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin: 11, settingAt: 10, cap: null },
    midGameIntervalAt: 6,
    serve: { mode: "sideout", doubles: true },
  });
  expect(pickleball(15, true).midGameIntervalAt).toBe(8);
  expect(pickleball(21, true).midGameIntervalAt).toBe(11);
});

it("opens a doubles game at 0-0-2: the starting team has only its second server", () => {
  const start = createMatch(pickleball(11, true));
  expect(start.serving).toBe("a");
  expect(start.serverNumber).toBe(2);
  expect(scoreCall(start)).toBe("0–0–2");
  // A loses the first rally, and because they were already server 2 it is a
  // side out straight away (USAP 5.B.2)
  const out = applyMatchPoint(start, "b");
  expect(out.score).toEqual({ a: 0, b: 0 });
  expect(out.serving).toBe("b");
  expect(out.serverNumber).toBe(1);
  expect(scoreCall(out)).toBe("0–0–1");
});

it("only the serving side scores; a lost rally moves the serve, not the score", () => {
  // B receives the side out, then wins two rallies of their own
  const s = rallies(pickleball(11, true), ["b", "b", "b"]);
  expect(s.score).toEqual({ a: 0, b: 2 });
  expect(s.serving).toBe("b");
  expect(s.serverNumber).toBe(1);
  // B's first server loses one: server 2 comes up, still no point for A
  const t = applyMatchPoint(s, "a");
  expect(t.score).toEqual({ a: 0, b: 2 });
  expect(t.serving).toBe("b");
  expect(t.serverNumber).toBe(2);
  // and the second one loses too: now it is a real side out
  const u = applyMatchPoint(t, "a");
  expect(u.score).toEqual({ a: 0, b: 2 });
  expect(u.serving).toBe("a");
  expect(u.serverNumber).toBe(1);
  expect(scoreCall(u)).toBe("0–2–1");
});

it("singles sides out on the first lost rally and calls two numbers (USAP 5.A.3)", () => {
  const start = createMatch(pickleball(11, false));
  expect(start.serverNumber).toBeNull();
  expect(scoreCall(start)).toBe("0–0");
  const s = rallies(pickleball(11, false), ["a", "a", "b"]);
  expect(s.score).toEqual({ a: 2, b: 0 });
  expect(s.serving).toBe("b");
  expect(s.serverNumber).toBeNull();
  expect(scoreCall(s)).toBe("0–2");
});

it("wins by two at 10-all with no cap, however long it takes", () => {
  // one level point in singles side-out: A holds and scores, A sides out,
  // B holds and scores, B sides out — four rallies, serve back with A
  const level = (n: number): Side[] =>
    Array.from({ length: n }, () => ["a", "b", "b", "a"] as Side[]).flat();
  const cfg = pickleball(11, false);
  const at10 = rallies(cfg, level(10));
  expect(at10.score).toEqual({ a: 10, b: 10 });
  expect(at10.serving).toBe("a");
  expect(at10.finished).toBe(false);
  // 11-10 is not a win
  const eleven = applyMatchPoint(at10, "a");
  expect(eleven.score).toEqual({ a: 11, b: 10 });
  expect(eleven.finished).toBe(false);
  // 12-10 is
  const twelve = applyMatchPoint(eleven, "a");
  expect(twelve.finished).toBe(true);
  expect(twelve.winner).toBe("a");
  expect(twelve.games).toEqual([{ a: 12, b: 10 }]);
  expect(twelve.serving).toBeNull();
  // badminton caps at 30, pickleball does not: 25-23 is a legal finish
  const long = rallies(cfg, [...level(23), "a", "a"]);
  expect(long.games).toEqual([{ a: 25, b: 23 }]);
});

it("the initial service changes each game of a bestOf (USAP 21.F.2)", () => {
  const cfg = { ...pickleball(11, true), bestOf: 3 };
  const game1: Side[] = [...Array<Side>(11).fill("a")];
  const after = rallies(cfg, game1);
  expect(after.games).toEqual([{ a: 11, b: 0 }]);
  expect(after.serving).toBe("b");
  expect(after.serverNumber).toBe(2);
});

it("rally scoring drops the server number and scores every rally (USAP 14.A)", () => {
  const cfg = pickleball(11, true, true);
  expect(cfg.serve).toBeUndefined();
  const s = rallies(cfg, ["a", "b", "b"]);
  expect(s.score).toEqual({ a: 1, b: 2 });
  expect(s.serving).toBe("b");
  expect(s.serverNumber).toBeNull();
  expect(scoreCall(s)).toBe("2–1");
});

it("undo rewinds a side out as faithfully as a point", () => {
  const s = rallies(pickleball(11, true), ["b", "b", "a"]);
  expect(s.serving).toBe("b");
  expect(s.serverNumber).toBe(2);
  const back = undo(s);
  expect(back.serving).toBe("b");
  expect(back.serverNumber).toBe(1);
  expect(back.score).toEqual({ a: 0, b: 1 });
});

it("badminton keeps rally scoring: the last rally winner serves, no server number", () => {
  const s = rallies(PRESETS.bwf1x21, ["a", "b"]);
  expect(s.score).toEqual({ a: 1, b: 1 });
  expect(s.serving).toBe("b");
  expect(s.serverNumber).toBeNull();
  expect(createMatch(PRESETS.bwf1x21).serving).toBe("a");
});

it("bwf1x21 plays the real deuce ending: win by two from 20-all, 30 takes it", () => {
  const level = (n: number): Side[] =>
    Array.from({ length: n * 2 }, (_, i) => (i % 2 === 0 ? "a" : "b"));
  const at20 = rallies(PRESETS.bwf1x21, level(20));
  expect(at20.score).toEqual({ a: 20, b: 20 });
  expect(at20.finished).toBe(false);
  // 21-20 does not end it
  expect(applyMatchPoint(at20, "a").finished).toBe(false);
  // 22-20 does
  expect(rallies(PRESETS.bwf1x21, [...level(20), "a", "a"]).winner).toBe("a");
  // and at 29-all the 30th point takes it regardless of margin (Law 7.5)
  const at29 = rallies(PRESETS.bwf1x21, level(29));
  expect(at29.score).toEqual({ a: 29, b: 29 });
  const capped = applyMatchPoint(at29, "b");
  expect(capped.finished).toBe(true);
  expect(capped.games).toEqual([{ a: 29, b: 30 }]);
});

it("refuses a side-out config that cannot be won by two", () => {
  expect(() =>
    createMatch({ ...pickleball(11, true), game: { pointsToWin: 11, settingAt: null, cap: null } })
  ).toThrow("win-by-two");
});
