import fc from "fast-check";
import {
  americano,
  applyMatchPoint,
  createMatch,
  PRESETS,
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

it("casual1x21 is one golden-point game to 21", () => {
  expect(PRESETS.casual1x21).toEqual({
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin: 21, settingAt: null, cap: null },
    midGameIntervalAt: null,
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
