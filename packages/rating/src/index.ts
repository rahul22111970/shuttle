// @shuttle/rating: margin-aware Elo. Pure functions, no I/O, and every
// numeric constant imported from constants.ts — the module the app also
// renders, so the published math cannot drift from the running math.

import { BASE_K, ELO_SCALE, PROVISIONAL_K, PROVISIONAL_MATCHES } from "./constants";

export * from "./constants";

export type PlayerRating = {
  readonly rating: number;
  // rated matches completed BEFORE this one; decides provisional K
  readonly matchesPlayed: number;
};

export type Deltas = {
  readonly winner: number;
  readonly loser: number;
};

export function expectedScore(own: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - own) / ELO_SCALE));
}

export function kFor(matchesPlayed: number): number {
  if (!Number.isInteger(matchesPlayed) || matchesPlayed < 0) {
    throw new Error(`matchesPlayed must be a non-negative integer, got ${matchesPlayed}`);
  }
  return matchesPlayed < PROVISIONAL_MATCHES ? PROVISIONAL_K : BASE_K;
}

// Saturating margin curve: 1 at margin 0, 2 at the format's maximum. A
// blowout moves ratings about twice a squeaker, never more.
export function marginMultiplier(pointMargin: number, maxMargin: number): number {
  if (!Number.isInteger(maxMargin) || maxMargin < 1) {
    throw new Error(`maxMargin must be a positive integer, got ${maxMargin}`);
  }
  if (!Number.isInteger(pointMargin) || pointMargin < 0 || pointMargin > maxMargin) {
    throw new Error(`pointMargin must be an integer in 0..maxMargin, got ${pointMargin}`);
  }
  return 1 + Math.log(1 + pointMargin) / Math.log(1 + maxMargin);
}

function validRating(p: PlayerRating, who: string): void {
  if (!Number.isFinite(p.rating)) throw new Error(`${who} rating must be finite`);
  kFor(p.matchesPlayed); // reuse the matchesPlayed validation
}

// Singles. pointMargin is the winner's total points minus the loser's,
// clamped by the caller to 0 when a bestOf winner scored fewer points.
export function singlesDeltas(
  winner: PlayerRating,
  loser: PlayerRating,
  pointMargin: number,
  maxMargin: number
): Deltas {
  validRating(winner, "winner");
  validRating(loser, "loser");
  const m = marginMultiplier(pointMargin, maxMargin);
  const expectedWin = expectedScore(winner.rating, loser.rating);
  return {
    winner: kFor(winner.matchesPlayed) * m * (1 - expectedWin),
    loser: kFor(loser.matchesPlayed) * m * (0 - (1 - expectedWin)),
  };
}

export type DoublesDeltas = {
  readonly winners: readonly [number, number];
  readonly losers: readonly [number, number];
};

// Doubles per BACKLOG decision 8: each individual is rated against the
// OPPOSING team's average. Partners with different ratings therefore carry
// different expected scores — the stronger partner gains less from the same
// win. Deltas and K are individual throughout.
export function doublesDeltas(
  winners: readonly [PlayerRating, PlayerRating],
  losers: readonly [PlayerRating, PlayerRating],
  pointMargin: number,
  maxMargin: number
): DoublesDeltas {
  for (const [team, name] of [
    [winners, "winner"],
    [losers, "loser"],
  ] as const) {
    validRating(team[0], name);
    validRating(team[1], name);
  }
  const m = marginMultiplier(pointMargin, maxMargin);
  const winnerAvg = (winners[0].rating + winners[1].rating) / 2;
  const loserAvg = (losers[0].rating + losers[1].rating) / 2;
  const delta = (p: PlayerRating, oppAvg: number, won: boolean) => {
    const expected = expectedScore(p.rating, oppAvg);
    return kFor(p.matchesPlayed) * m * ((won ? 1 : 0) - expected);
  };
  return {
    winners: [delta(winners[0], loserAvg, true), delta(winners[1], loserAvg, true)],
    losers: [delta(losers[0], winnerAvg, false), delta(losers[1], winnerAvg, false)],
  };
}
