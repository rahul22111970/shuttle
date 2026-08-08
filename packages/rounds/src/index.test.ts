import fc from "fast-check";
import { americanoRound, type AmericanoConfig, type Round } from "@shuttle/rounds";

const RUNS = { numRuns: 1000 };

const configArb: fc.Arbitrary<AmericanoConfig> = fc.record({
  players: fc
    .integer({ min: 4, max: 12 })
    .map((n) => Array.from({ length: n }, (_, i) => `p${i}`)),
  courts: fc.integer({ min: 1, max: 4 }),
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
});

function night(config: AmericanoConfig, roundCount: number): Round[] {
  const rounds: Round[] = [];
  for (let i = 0; i < roundCount; i++) {
    rounds.push(americanoRound(config, rounds));
  }
  return rounds;
}

const onCourt = (round: Round): string[] =>
  round.courts.flatMap((c) => c.pairs.flatMap((pair) => [...pair]));

it("every round is an exact partition: no player twice, nobody missing", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 20 }), (config, roundCount) => {
      for (const round of night(config, roundCount)) {
        const seen = [...onCourt(round), ...round.resting];
        // independent oracle: the round is exactly the player set, no more,
        // no less, no repeats
        expect(seen.length).toBe(config.players.length);
        expect(new Set(seen)).toEqual(new Set(config.players));
      }
    }),
    RUNS
  );
});

it("over any night every player's match count is within ±1", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 20 }), (config, roundCount) => {
      const rounds = night(config, roundCount);
      const plays = new Map(config.players.map((p) => [p, 0]));
      for (const round of rounds) {
        for (const p of onCourt(round)) plays.set(p, (plays.get(p) ?? 0) + 1);
      }
      const counts = [...plays.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }),
    RUNS
  );
});

it("rest assignments over a night differ by at most 1 per player", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 20 }), (config, roundCount) => {
      const rounds = night(config, roundCount);
      const rests = new Map(config.players.map((p) => [p, 0]));
      for (const round of rounds) {
        for (const p of round.resting) rests.set(p, (rests.get(p) ?? 0) + 1);
      }
      const counts = [...rests.values()];
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }),
    RUNS
  );
});

it("the scorer is a resting player, and exists exactly when someone rests", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 20 }), (config, roundCount) => {
      for (const round of night(config, roundCount)) {
        if (round.resting.length === 0) {
          expect(round.scorer).toBeNull();
        } else {
          expect(round.resting).toContain(round.scorer);
          expect(onCourt(round)).not.toContain(round.scorer);
        }
      }
    }),
    RUNS
  );
});

it("the scorer is always a rester with the fewest prior scoring duties", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 20 }), (config, roundCount) => {
      const rounds = night(config, roundCount);
      const duties = new Map(config.players.map((p) => [p, 0]));
      for (const round of rounds) {
        if (round.scorer !== null) {
          // independent oracle: recompute the minimum from history
          const minDuties = Math.min(...round.resting.map((p) => duties.get(p) ?? 0));
          expect(duties.get(round.scorer)).toBe(minDuties);
          duties.set(round.scorer, (duties.get(round.scorer) ?? 0) + 1);
        }
      }
    }),
    RUNS
  );
});

it("same seed, same history, same output", () => {
  fc.assert(
    fc.property(configArb, fc.integer({ min: 1, max: 12 }), (config, roundCount) => {
      expect(night(config, roundCount)).toEqual(night(config, roundCount));
    }),
    RUNS
  );
});

it("court capacity is respected and full courts are used", () => {
  fc.assert(
    fc.property(configArb, (config) => {
      const round = americanoRound(config, []);
      const usable = Math.min(config.courts, Math.floor(config.players.length / 4));
      expect(round.courts.length).toBe(usable);
      for (const court of round.courts) {
        expect(court.pairs.length).toBe(2);
        expect(court.pairs[0].length).toBe(2);
        expect(court.pairs[1].length).toBe(2);
      }
    }),
    RUNS
  );
});

it("partner repeats stay low while mixing is possible", () => {
  // 8 players, 2 courts, 7 rounds: 28 pairings drawn from 28 possible pairs.
  // A mixing-first generator should not repeat any partnership more than a
  // few times; random-without-memory would collide far more.
  const config: AmericanoConfig = {
    players: Array.from({ length: 8 }, (_, i) => `p${i}`),
    courts: 2,
    seed: 42,
  };
  const rounds = night(config, 7);
  const partnerCounts = new Map<string, number>();
  for (const round of rounds) {
    for (const court of round.courts) {
      for (const [x, y] of court.pairs) {
        const k = x < y ? `${x}|${y}` : `${y}|${x}`;
        partnerCounts.set(k, (partnerCounts.get(k) ?? 0) + 1);
      }
    }
  }
  expect(Math.max(...partnerCounts.values())).toBeLessThanOrEqual(2);
});

it("refuses bad configs", () => {
  const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  expect(() => americanoRound({ players: players(3), courts: 1, seed: 1 }, [])).toThrow("4-12");
  expect(() => americanoRound({ players: players(13), courts: 1, seed: 1 }, [])).toThrow("4-12");
  expect(() => americanoRound({ players: ["a", "a", "b", "c"], courts: 1, seed: 1 }, [])).toThrow("unique");
  expect(() => americanoRound({ players: players(4), courts: 0, seed: 1 }, [])).toThrow("courts");
  expect(() => americanoRound({ players: players(4), courts: 1, seed: 1.5 }, [])).toThrow("seed");
});
