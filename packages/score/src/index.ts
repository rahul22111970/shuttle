// @shuttle/score core: one badminton game as a pure state machine.
// No I/O, no clock, no randomness. State in, state out.

export type Side = "a" | "b";

export type GameConfig = {
  readonly pointsToWin: number;
  // null = golden point: first to pointsToWin wins regardless of margin.
  // Otherwise deuce: from settingAt-all the game extends until a 2-point
  // lead. settingAt is always pointsToWin - 1; createGame enforces it so
  // the number stays honest instead of decorative.
  readonly settingAt: number | null;
  // Hard ceiling: first to cap wins outright (30 in the 21-point game).
  readonly cap: number | null;
};

export type Score = { readonly a: number; readonly b: number };

export type GameState = {
  readonly config: GameConfig;
  readonly score: Score;
  readonly winner: Side | null;
};

export function createGame(config: GameConfig): GameState {
  const { pointsToWin, settingAt, cap } = config;
  if (!Number.isInteger(pointsToWin) || pointsToWin < 1) {
    throw new Error(`pointsToWin must be a positive integer, got ${pointsToWin}`);
  }
  if (settingAt !== null && settingAt !== pointsToWin - 1) {
    throw new Error(`settingAt must be null or pointsToWin - 1, got ${settingAt}`);
  }
  if (cap !== null && (!Number.isInteger(cap) || cap < pointsToWin)) {
    throw new Error(`cap must be null or an integer >= pointsToWin, got ${cap}`);
  }
  if (cap !== null && settingAt !== null && cap <= pointsToWin) {
    // a deuce game whose cap equals pointsToWin makes the deuce clause
    // unreachable, which is a decorative config; refuse it
    throw new Error(`a deuce game needs cap > pointsToWin, got cap ${cap}`);
  }
  return { config, score: { a: 0, b: 0 }, winner: null };
}

const other = (side: Side): Side => (side === "a" ? "b" : "a");

export function applyPoint(state: GameState, side: Side): GameState {
  if (state.winner) throw new Error("point applied after the game ended");
  const score: Score = { ...state.score, [side]: state.score[side] + 1 };
  return { config: state.config, score, winner: winnerOf(state.config, score, side) };
}

// Answers whether lastPoint's side just won. It does not validate arbitrary
// snapshots; an impossible score pair still returns null. Snapshot validation
// is replay-equality's job (S1-13).
export function winnerOf(config: GameConfig, score: Score, lastPoint: Side): Side | null {
  const own = score[lastPoint];
  const opp = score[other(lastPoint)];
  if (config.cap !== null && own >= config.cap) return lastPoint;
  if (own >= config.pointsToWin && (config.settingAt === null || own - opp >= 2)) {
    return lastPoint;
  }
  return null;
}
export * from "./match";
