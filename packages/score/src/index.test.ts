import fc from "fast-check";
import {
  applyPoint,
  createGame,
  type GameConfig,
  type GameState,
  type Side,
} from "@shuttle/score";

const RUNS = { numRuns: 1000 };

// Valid configs: deuce games carry settingAt = pointsToWin - 1, golden games
// carry null; cap is null or pointsToWin + up to 15.
const configArb: fc.Arbitrary<GameConfig> = fc
  .record({
    pointsToWin: fc.integer({ min: 1, max: 30 }),
    deuce: fc.boolean(),
    capExtra: fc.option(fc.integer({ min: 0, max: 15 }), { nil: null }),
  })
  .map(({ pointsToWin, deuce, capExtra }) => ({
    pointsToWin,
    settingAt: deuce ? pointsToWin - 1 : null,
    cap: capExtra === null ? null : pointsToWin + capExtra + (deuce ? 1 : 0),
  }));

const seqArb = fc.array(fc.constantFrom<Side>("a", "b"), { maxLength: 200 });

// The winning condition, restated independently of the implementation.
function shouldEnd(c: GameConfig, own: number, opp: number): boolean {
  if (c.cap !== null && own >= c.cap) return true;
  return own >= c.pointsToWin && (c.settingAt === null || own - opp >= 2);
}

function play(config: GameConfig, seq: Side[]): GameState {
  let state = createGame(config);
  for (const side of seq) {
    if (state.winner) break;
    state = applyPoint(state, side);
  }
  return state;
}

it("a game ends iff the winning condition per config holds", () => {
  fc.assert(
    fc.property(configArb, seqArb, (config, seq) => {
      let state = createGame(config);
      for (const side of seq) {
        if (state.winner) break;
        state = applyPoint(state, side);
        const own = state.score[side];
        const opp = state.score[side === "a" ? "b" : "a"];
        expect(state.winner).toBe(shouldEnd(config, own, opp) ? side : null);
      }
    }),
    RUNS
  );
});

it("score at cap ends the game to the leader", () => {
  fc.assert(
    fc.property(
      configArb.filter((c) => c.cap !== null),
      seqArb,
      (config, seq) => {
        const state = play(config, seq);
        if (state.winner) {
          // whoever the game ends to is strictly ahead, cap or not
          const loser: Side = state.winner === "a" ? "b" : "a";
          expect(state.score[state.winner]).toBeGreaterThan(state.score[loser]);
          expect(state.score[state.winner]).toBeLessThanOrEqual(config.cap as number);
        }
      }
    ),
    RUNS
  );
});

it("setting extends correctly at settingAt-all", () => {
  fc.assert(
    fc.property(fc.integer({ min: 2, max: 30 }), (pointsToWin) => {
      const config: GameConfig = {
        pointsToWin,
        settingAt: pointsToWin - 1,
        cap: null,
      };
      // reach settingAt-all
      let state = createGame(config);
      for (let i = 0; i < pointsToWin - 1; i++) {
        state = applyPoint(state, "a");
        state = applyPoint(state, "b");
      }
      expect(state.winner).toBeNull();
      // one point past pointsToWin is not enough: lead is 1
      state = applyPoint(state, "a");
      expect(state.score.a).toBe(pointsToWin);
      expect(state.winner).toBeNull();
      // opponent equalises, then two in a row end it
      state = applyPoint(state, "b");
      expect(state.winner).toBeNull();
      state = applyPoint(state, "a");
      expect(state.winner).toBeNull();
      state = applyPoint(state, "a");
      expect(state.winner).toBe("a");
    }),
    RUNS
  );
});

it("scores never decrease and each point adds exactly one", () => {
  fc.assert(
    fc.property(configArb, seqArb, (config, seq) => {
      let state = createGame(config);
      for (const side of seq) {
        if (state.winner) break;
        const before = state.score;
        state = applyPoint(state, side);
        expect(state.score.a).toBeGreaterThanOrEqual(before.a);
        expect(state.score.b).toBeGreaterThanOrEqual(before.b);
        expect(state.score.a + state.score.b).toBe(before.a + before.b + 1);
      }
    }),
    RUNS
  );
});

it("identical point sequences yield identical states", () => {
  fc.assert(
    fc.property(configArb, seqArb, (config, seq) => {
      expect(play(config, seq)).toEqual(play(config, seq));
    }),
    RUNS
  );
});

// The examples that anchor the properties to real badminton.
// Independent oracle: restates what a finished (or unfinished) badminton
// score must look like, in a different formulation from the engine's
// winning condition, so a shared misreading cannot pass both.
it("every state satisfies the badminton shape of a win", () => {
  fc.assert(
    fc.property(configArb, seqArb, (config, seq) => {
      const state = play(config, seq);
      if (!state.winner) {
        if (config.cap !== null) {
          expect(state.score.a).toBeLessThan(config.cap);
          expect(state.score.b).toBeLessThan(config.cap);
        }
        return;
      }
      const w = state.score[state.winner];
      const l = state.score[state.winner === "a" ? "b" : "a"];
      expect(w).toBeGreaterThan(l);
      if (config.cap !== null && w === config.cap) return; // cap win: any margin
      if (config.settingAt === null) {
        expect(w).toBe(config.pointsToWin); // golden: exactly pointsToWin
      } else if (l < config.settingAt) {
        expect(w).toBe(config.pointsToWin); // clean win: no extension
      } else {
        expect(w - l).toBe(2); // deuce extension ends on exactly two
      }
    }),
    RUNS
  );
});

it("plays the 21-point deuce game to 30-29 at the cap", () => {
  const config: GameConfig = { pointsToWin: 21, settingAt: 20, cap: 30 };
  let state = createGame(config);
  for (let i = 0; i < 29; i++) {
    state = applyPoint(state, "a");
    if (state.winner) break;
    state = applyPoint(state, "b");
  }
  // alternated to 29-29 without ending
  expect(state.score).toEqual({ a: 29, b: 29 });
  expect(state.winner).toBeNull();
  state = applyPoint(state, "a");
  expect(state.score).toEqual({ a: 30, b: 29 });
  expect(state.winner).toBe("a");
});

it("golden point ends at pointsToWin regardless of margin", () => {
  const config: GameConfig = { pointsToWin: 21, settingAt: null, cap: null };
  let state = createGame(config);
  for (let i = 0; i < 20; i++) {
    state = applyPoint(state, "a");
    state = applyPoint(state, "b");
  }
  expect(state.winner).toBeNull();
  state = applyPoint(state, "a");
  expect(state.score).toEqual({ a: 21, b: 20 });
  expect(state.winner).toBe("a");
});

it("refuses a point after the game ended", () => {
  const config: GameConfig = { pointsToWin: 1, settingAt: null, cap: null };
  const done = applyPoint(createGame(config), "a");
  expect(done.winner).toBe("a");
  expect(() => applyPoint(done, "b")).toThrow("after the game ended");
});

it("refuses nonsense configs", () => {
  expect(() => createGame({ pointsToWin: 0, settingAt: null, cap: null })).toThrow();
  expect(() => createGame({ pointsToWin: 21, settingAt: 19, cap: null })).toThrow();
  expect(() => createGame({ pointsToWin: 21, settingAt: null, cap: 20 })).toThrow();
  expect(() => createGame({ pointsToWin: 21, settingAt: 20, cap: 21 })).toThrow();
});
