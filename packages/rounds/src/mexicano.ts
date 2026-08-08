// Mexicano: the standings pair the courts. Round 1 has no tallies, so the
// seeded shuffle IS the standings; from round 2 the running tally sorts
// players and adjacent fours share a court, 1&3 vs 2&4, so the night
// self-balances by skill (RESEARCH §7).
//
// Open question 2 (BACKLOG): round 1 seeded-random ships here; seeding by
// global rating instead is Rahul's call once ratings exist.

import {
  mulberry32,
  shuffled,
  splitByRestDuty,
  validateNight,
  type CourtAssignment,
  type NightConfig,
  type Round,
} from "./index";

export type Tallies = Readonly<Record<string, number>>;

export function mexicanoRound(
  config: NightConfig,
  previous: readonly Round[],
  tallies: Tallies
): Round {
  validateNight(config);
  for (const name of Object.keys(tallies)) {
    if (!config.players.includes(name)) {
      throw new Error(`tally for unknown player ${name}`);
    }
  }
  for (const p of config.players) {
    const t = tallies[p] ?? 0;
    if (!Number.isFinite(t)) throw new Error(`tally for ${p} must be a finite number`);
  }

  // distinct stream constant from americano so the two formats never share
  // a shuffle for the same seed and round index
  const rand = mulberry32((config.seed ^ Math.imul(previous.length + 1, 0x85ebca6b)) >>> 0);
  const order = shuffled(config.players, rand);
  const seededIndex = new Map(order.map((p, i) => [p, i]));

  const { resting, playing, scorer } = splitByRestDuty(config, previous, order);

  // standings: tally desc, seeded order breaking ties — which makes round 1
  // (all tallies equal) exactly the seeded shuffle the spec asks for
  const standings = [...playing].sort(
    (a, b) =>
      (tallies[b] ?? 0) - (tallies[a] ?? 0) ||
      (seededIndex.get(a) ?? 0) - (seededIndex.get(b) ?? 0)
  );

  const courts: CourtAssignment[] = [];
  for (let i = 0; i < standings.length; i += 4) {
    const [first, second, third, fourth] = standings.slice(i, i + 4);
    courts.push({ pairs: [[first, third], [second, fourth]] });
  }

  return { courts, resting, scorer };
}
