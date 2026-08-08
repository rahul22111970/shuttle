import fc from "fast-check";
import {
  mexicanoRound,
  type NightConfig,
  type Round,
  type Tallies,
} from "@shuttle/rounds";

const RUNS = { numRuns: 1000 };

const configArb: fc.Arbitrary<NightConfig> = fc.record({
  players: fc
    .integer({ min: 4, max: 12 })
    .map((n) => Array.from({ length: n }, (_, i) => `p${i}`)),
  courts: fc.integer({ min: 1, max: 4 }),
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
});

// distinct tallies so the standings order is fully determined by the tally,
// leaving no tie for the seed to break — the oracle then needs no knowledge
// of the shuffle
const withDistinctTallies = configArb.chain((config) =>
  fc
    .shuffledSubarray(
      Array.from({ length: 100 }, (_, i) => i),
      { minLength: config.players.length, maxLength: config.players.length }
    )
    .map((values) => ({
      config,
      tallies: Object.fromEntries(
        config.players.map((p, i) => [p, values[i]])
      ) as Tallies,
    }))
);

const onCourt = (round: Round): string[] =>
  round.courts.flatMap((c) => c.pairs.flatMap((pair) => [...pair]));

it("every round is an exact partition with the right court count", () => {
  fc.assert(
    fc.property(withDistinctTallies, fc.integer({ min: 0, max: 3 }), ({ config, tallies }, priorRounds) => {
      const previous = playNight(config, tallies, priorRounds);
      const round = mexicanoRound(config, previous, tallies);
      const seen = [...onCourt(round), ...round.resting];
      expect(seen.length).toBe(config.players.length);
      expect(new Set(seen)).toEqual(new Set(config.players));
      const usable = Math.min(config.courts, Math.floor(config.players.length / 4));
      expect(round.courts.length).toBe(usable);
      if (round.resting.length > 0) {
        expect(round.resting).toContain(round.scorer);
      } else {
        expect(round.scorer).toBeNull();
      }
    }),
    RUNS
  );
});

it("rounds 2+ pair adjacent standings, 1&3 vs 2&4, on every court", () => {
  fc.assert(
    fc.property(withDistinctTallies, fc.integer({ min: 1, max: 3 }), ({ config, tallies }, priorRounds) => {
      // real history: rest duty has moved players in and out of the courts
      const previous = playNight(config, tallies, priorRounds);
      const round = mexicanoRound(config, previous, tallies);
      // independent oracle: sort the players actually on court by their
      // tally, chunk into fours, and demand each court is exactly that
      // chunk split 1&3 vs 2&4
      const ranked = onCourt(round).sort((a, b) => tallies[b] - tallies[a]);
      round.courts.forEach((court, i) => {
        const [first, second, third, fourth] = ranked.slice(i * 4, i * 4 + 4);
        expect(new Set(court.pairs[0])).toEqual(new Set([first, third]));
        expect(new Set(court.pairs[1])).toEqual(new Set([second, fourth]));
      });
    }),
    RUNS
  );
});

it("deterministic under fixed seed and tallies, history included", () => {
  fc.assert(
    fc.property(
      withDistinctTallies,
      fc.integer({ min: 1, max: 8 }),
      ({ config, tallies }, roundCount) => {
        const nightOnce = playNight(config, tallies, roundCount);
        const nightTwice = playNight(config, tallies, roundCount);
        expect(nightOnce).toEqual(nightTwice);
      }
    ),
    RUNS
  );
});

function playNight(config: NightConfig, tallies: Tallies, roundCount: number): Round[] {
  const rounds: Round[] = [];
  for (let i = 0; i < roundCount; i++) {
    rounds.push(mexicanoRound(config, rounds, tallies));
  }
  return rounds;
}

it("round 1 comes from the seed: all-zero tallies still produce full courts", () => {
  fc.assert(
    fc.property(configArb, (config) => {
      const tallies = Object.fromEntries(config.players.map((p) => [p, 0])) as Tallies;
      const round = mexicanoRound(config, [], tallies);
      const usable = Math.min(config.courts, Math.floor(config.players.length / 4));
      expect(round.courts.length).toBe(usable);
      expect(new Set([...onCourt(round), ...round.resting])).toEqual(
        new Set(config.players)
      );
    }),
    RUNS
  );
});

it("refuses tallies for unknown players and non-finite tallies", () => {
  const config: NightConfig = { players: ["a", "b", "c", "d"], courts: 1, seed: 7 };
  expect(() => mexicanoRound(config, [], { ghost: 5 })).toThrow("unknown player");
  expect(() => mexicanoRound(config, [], { a: NaN })).toThrow("finite");
});
