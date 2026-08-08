// @shuttle/rounds: group-night round generation. Pure and deterministic:
// the seed is part of the config, the PRNG lives here, and the same seed
// with the same history always emits the same round.

export type Pair = readonly [string, string];

export type CourtAssignment = {
  readonly pairs: readonly [Pair, Pair];
};

export type Round = {
  readonly courts: readonly CourtAssignment[];
  readonly resting: readonly string[];
  // a resting player when one exists, null when everyone is on court
  readonly scorer: string | null;
};

export type AmericanoConfig = {
  readonly players: readonly string[];
  readonly courts: number;
  readonly seed: number;
};

// mulberry32: tiny, seedable, good enough for shuffling a dozen names.
// Injected by construction: the seed arrives in the config, never from a
// clock or an ambient random source.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function validate(config: AmericanoConfig): void {
  const { players, courts } = config;
  if (players.length < 4 || players.length > 12) {
    throw new Error(`americano needs 4-12 players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) {
    throw new Error("player names must be unique");
  }
  if (!Number.isInteger(courts) || courts < 1) {
    throw new Error(`courts must be a positive integer, got ${courts}`);
  }
  if (!Number.isInteger(config.seed)) {
    throw new Error(`seed must be an integer, got ${config.seed}`);
  }
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

// One americano round, given everything that has happened tonight.
// Fairness first (who rests, who scores), then mixing (who partners whom):
// resters are those who have rested least, the scorer is the rester who has
// scored least, and partners are chosen greedily to minimise repeats.
export function americanoRound(
  config: AmericanoConfig,
  previous: readonly Round[]
): Round {
  validate(config);
  const { players, courts, seed } = config;

  // per-round PRNG stream: same seed + same round index = same output
  const rand = mulberry32((seed ^ Math.imul(previous.length + 1, 0x9e3779b9)) >>> 0);

  const rests = new Map<string, number>(players.map((p) => [p, 0]));
  const scores = new Map<string, number>(players.map((p) => [p, 0]));
  const partners = new Map<string, number>();
  for (const round of previous) {
    for (const p of round.resting) rests.set(p, (rests.get(p) ?? 0) + 1);
    if (round.scorer) scores.set(round.scorer, (scores.get(round.scorer) ?? 0) + 1);
    for (const court of round.courts) {
      for (const [x, y] of court.pairs) {
        const k = pairKey(x, y);
        partners.set(k, (partners.get(k) ?? 0) + 1);
      }
    }
  }

  const order = shuffled(players, rand);
  const usableCourts = Math.min(courts, Math.floor(players.length / 4));
  const restCount = players.length - usableCourts * 4;

  // rest duty rotates: fewest rests so far rest now, seeded order breaks ties
  const byRestNeed = [...order].sort((a, b) => (rests.get(a) ?? 0) - (rests.get(b) ?? 0));
  const resting = byRestNeed.slice(0, restCount);
  const restingSet = new Set(resting);
  const playing = order.filter((p) => !restingSet.has(p));

  // partner choice: walk the shuffled playing list, give each unpaired
  // player the least-repeated available partner
  const unpaired = [...playing];
  const pairs: Pair[] = [];
  while (unpaired.length > 0) {
    const p = unpaired.shift() as string;
    let bestIdx = 0;
    let bestCount = Infinity;
    for (let i = 0; i < unpaired.length; i++) {
      const count = partners.get(pairKey(p, unpaired[i])) ?? 0;
      if (count < bestCount) {
        bestCount = count;
        bestIdx = i;
      }
    }
    const q = unpaired.splice(bestIdx, 1)[0];
    pairs.push([p, q]);
  }

  // ponytail: courts filled sequentially, opponents unoptimized; add an
  // opponent-repeat penalty if a group ever complains about rematches
  const courtAssignments: CourtAssignment[] = [];
  for (let i = 0; i < pairs.length; i += 2) {
    courtAssignments.push({ pairs: [pairs[i], pairs[i + 1]] });
  }

  // scoring duty rotates through the resters the same way rest duty does
  const scorer =
    resting.length === 0
      ? null
      : [...resting].sort((a, b) => (scores.get(a) ?? 0) - (scores.get(b) ?? 0))[0];

  return { courts: courtAssignments, resting, scorer };
}
