// Every rating constant lives here and nowhere else. Approved by Rahul
// 2026-08-08 (BACKLOG open question 3). S1-27 renders these same exports
// in-app: the math players see is the math that runs.

export const INITIAL_RATING = 1200;

// Established players move at BASE_K; a player's first PROVISIONAL_MATCHES
// rated matches move at PROVISIONAL_K so newcomers find their level fast.
export const BASE_K = 32;
export const PROVISIONAL_K = 64;
export const PROVISIONAL_MATCHES = 10;

// The classic Elo logistic scale: a rating gap of this many points means
// roughly 10:1 expected odds.
export const ELO_SCALE = 400;
