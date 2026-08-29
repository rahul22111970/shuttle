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

// Sitting out a week your group played costs this much - about half a
// close loss at BASE_K. A week the group itself was idle costs nothing.
// Values are Claude's defaults from 2026-08-29, awaiting Rahul's sign-off
// like the constants above.
export const WEEKLY_DECAY_POINTS = 8;

// Decay never drags anyone below this; losses still can. Note that
// rebuildRatings replays stored decay rows with the CURRENT constants, so
// changing either number flags every older chain - same convention as K.
export const DECAY_FLOOR = 800;
