import { readFileSync } from "fs";
import fc from "fast-check";
import {
  BASE_K,
  doublesDeltas,
  expectedScore,
  INITIAL_RATING,
  kFor,
  marginMultiplier,
  PROVISIONAL_K,
  PROVISIONAL_MATCHES,
  singlesDeltas,
  type PlayerRating,
} from "@shuttle/rating";

const RUNS = { numRuns: 1000 };

const playerArb: fc.Arbitrary<PlayerRating> = fc.record({
  rating: fc.integer({ min: 400, max: 2400 }),
  matchesPlayed: fc.integer({ min: 0, max: 60 }),
});

const marginArb = fc
  .record({
    maxMargin: fc.integer({ min: 1, max: 60 }),
    frac: fc.integer({ min: 0, max: 100 }),
  })
  .map(({ maxMargin, frac }) => ({
    maxMargin,
    pointMargin: Math.floor((maxMargin * frac) / 100),
  }));

it("winner's delta is ≥ 0 and loser's is ≤ 0, always", () => {
  fc.assert(
    fc.property(playerArb, playerArb, marginArb, (w, l, { pointMargin, maxMargin }) => {
      const d = singlesDeltas(w, l, pointMargin, maxMargin);
      expect(d.winner).toBeGreaterThanOrEqual(0);
      expect(d.loser).toBeLessThanOrEqual(0);
    }),
    RUNS
  );
});

it("delta is monotonically non-decreasing in point margin", () => {
  fc.assert(
    fc.property(
      playerArb,
      playerArb,
      fc.integer({ min: 1, max: 60 }),
      (w, l, maxMargin) => {
        let prev = -Infinity;
        for (let margin = 0; margin <= maxMargin; margin++) {
          const d = singlesDeltas(w, l, margin, maxMargin);
          expect(d.winner).toBeGreaterThanOrEqual(prev);
          prev = d.winner;
        }
      }
    ),
    RUNS
  );
});

it("provisional K strictly exceeds established K, and kFor switches at the threshold", () => {
  expect(PROVISIONAL_K).toBeGreaterThan(BASE_K);
  expect(kFor(0)).toBe(PROVISIONAL_K);
  expect(kFor(PROVISIONAL_MATCHES - 1)).toBe(PROVISIONAL_K);
  expect(kFor(PROVISIONAL_MATCHES)).toBe(BASE_K);
});

it("an equal-rating, equal-K match has symmetric deltas", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 400, max: 2400 }),
      fc.integer({ min: 0, max: 60 }),
      marginArb,
      (rating, matches, { pointMargin, maxMargin }) => {
        const p: PlayerRating = { rating, matchesPlayed: matches };
        const d = singlesDeltas(p, p, pointMargin, maxMargin);
        expect(d.winner).toBeCloseTo(-d.loser, 10);
      }
    ),
    RUNS
  );
});

it("oracle: deltas are zero-sum in expectation once K is divided out", () => {
  // independent invariant from Elo itself: E_win + E_lose = 1, so
  // winnerDelta/K_w must equal -loserDelta/K_l regardless of margin.
  fc.assert(
    fc.property(playerArb, playerArb, marginArb, (w, l, { pointMargin, maxMargin }) => {
      const d = singlesDeltas(w, l, pointMargin, maxMargin);
      expect(d.winner / kFor(w.matchesPlayed)).toBeCloseTo(
        -d.loser / kFor(l.matchesPlayed),
        10
      );
    }),
    RUNS
  );
});

it("deterministic: same inputs, same deltas", () => {
  fc.assert(
    fc.property(playerArb, playerArb, marginArb, (w, l, { pointMargin, maxMargin }) => {
      expect(singlesDeltas(w, l, pointMargin, maxMargin)).toEqual(
        singlesDeltas(w, l, pointMargin, maxMargin)
      );
    }),
    RUNS
  );
});

it("doubles: everyone is rated against the opposing team average, individually", () => {
  fc.assert(
    fc.property(
      playerArb,
      playerArb,
      playerArb,
      playerArb,
      marginArb,
      (w1, w2, l1, l2, { pointMargin, maxMargin }) => {
        const d = doublesDeltas([w1, w2], [l1, l2], pointMargin, maxMargin);
        // winners gain, losers lose
        for (const x of d.winners) expect(x).toBeGreaterThanOrEqual(0);
        for (const x of d.losers) expect(x).toBeLessThanOrEqual(0);
        // independent oracle: each delta reconstructed from first principles
        const m = marginMultiplier(pointMargin, maxMargin);
        const lAvg = (l1.rating + l2.rating) / 2;
        expect(d.winners[0]).toBeCloseTo(
          kFor(w1.matchesPlayed) * m * (1 - expectedScore(w1.rating, lAvg)),
          10
        );
        // the stronger winner gains no more than the weaker one at equal K
        if (w1.matchesPlayed === w2.matchesPlayed) {
          const [strong, weak] =
            w1.rating >= w2.rating ? [d.winners[0], d.winners[1]] : [d.winners[1], d.winners[0]];
          expect(strong).toBeLessThanOrEqual(weak + 1e-9);
        }
      }
    ),
    RUNS
  );
});

it("anchor: the Elo scale itself — a full-scale gap means 10:11 odds", () => {
  // independent pin on the logistic: with own = opponent + ELO_SCALE the
  // expected score is exactly 10/11, from Elo's definition, not this code
  for (const r of [800, 1200, 1900]) {
    expect(expectedScore(r + 400, r)).toBeCloseTo(10 / 11, 10);
    expect(expectedScore(r, r + 400)).toBeCloseTo(1 / 11, 10);
    expect(expectedScore(r, r)).toBeCloseTo(0.5, 10);
  }
});

it("expectedScore strictly decreases as the opponent strengthens", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 400, max: 2400 }),
      fc.integer({ min: 400, max: 2399 }),
      (own, opp) => {
        expect(expectedScore(own, opp)).toBeGreaterThan(expectedScore(own, opp + 1));
      }
    ),
    RUNS
  );
});

it("anchor: two fresh 1200s, no margin — provisional K moves ±32, established ±16", () => {
  const fresh: PlayerRating = { rating: INITIAL_RATING, matchesPlayed: 0 };
  const settled: PlayerRating = { rating: INITIAL_RATING, matchesPlayed: 30 };
  const p = singlesDeltas(fresh, fresh, 0, 21);
  expect(p.winner).toBeCloseTo(PROVISIONAL_K / 2, 10);
  const e = singlesDeltas(settled, settled, 0, 21);
  expect(e.winner).toBeCloseTo(BASE_K / 2, 10);
  // and the full-margin multiplier doubles it
  const blowout = singlesDeltas(settled, settled, 21, 21);
  expect(blowout.winner).toBeCloseTo(BASE_K, 10);
});

it("refuses nonsense inputs", () => {
  const p: PlayerRating = { rating: 1200, matchesPlayed: 0 };
  expect(() => singlesDeltas(p, p, -1, 21)).toThrow("pointMargin");
  expect(() => singlesDeltas(p, p, 22, 21)).toThrow("pointMargin");
  expect(() => singlesDeltas(p, p, 0, 0)).toThrow("maxMargin");
  expect(() => singlesDeltas({ rating: NaN, matchesPlayed: 0 }, p, 0, 21)).toThrow("finite");
  expect(() => kFor(-1)).toThrow("matchesPlayed");
  expect(() => kFor(2.5)).toThrow("matchesPlayed");
});

it("constants module is the single source: no rating literal outside it", () => {
  // the acceptance grep as a test: index.ts must not contain 1200, 400, 32
  // or 64 as numeric literals; they may only arrive via constants imports
  const src = readFileSync(`${__dirname}/index.ts`, "utf8");
  expect(src.match(/\b(1200|400|32|64)\b/)).toBeNull();
});
