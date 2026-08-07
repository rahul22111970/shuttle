// Match layer over the single-game engine: bestOf, intervals, undo, presets.
// Same rules as the core: pure, deterministic, throws on misuse.
//
// Americano is deliberately NOT a GameConfig. RESEARCH §7: it is one game to
// a fixed points TOTAL (13-11 ends a 24-point game), a different termination
// rule than first-to-N, and it can tie. PM decision 2026-08-08: it gets its
// own config kind here rather than a distorted GameConfig.

import { applyPoint, createGame, type GameConfig, type Side } from "./index";

export type StandardMatchConfig = {
  readonly kind: "standard";
  readonly bestOf: number;
  readonly game: GameConfig;
  // BWF: a breather when the leading score first reaches this, once per game.
  readonly midGameIntervalAt: number | null;
};

export type AmericanoConfig = {
  readonly kind: "americano";
  readonly totalPoints: number;
};

export type MatchConfig = StandardMatchConfig | AmericanoConfig;

export type MatchEvent =
  | { readonly type: "interval"; readonly game: number }
  | { readonly type: "game_break"; readonly game: number };

export type MatchState = {
  readonly config: MatchConfig;
  // the surviving point list; undo pops it
  readonly points: readonly Side[];
  // completed game scores, in order
  readonly games: readonly { readonly a: number; readonly b: number }[];
  readonly gamesWon: { readonly a: number; readonly b: number };
  // current game score (standard) or the running tally (americano)
  readonly score: { readonly a: number; readonly b: number };
  readonly finished: boolean;
  // null while playing; also null on a finished americano tie
  readonly winner: Side | null;
  readonly events: readonly MatchEvent[];
};

// BACKLOG presets, constants per RESEARCH §5.
export const PRESETS = {
  // 3×21 rally point, setting at 20, cap 30, breather at 11
  bwf3x21: {
    kind: "standard",
    bestOf: 3,
    game: { pointsToWin: 21, settingAt: 20, cap: 30 },
    midGameIntervalAt: 11,
  },
  // the 2027 law: 3×15, setting at 14, cap 21, breather at 8
  bwf3x15: {
    kind: "standard",
    bestOf: 3,
    game: { pointsToWin: 15, settingAt: 14, cap: 21 },
    midGameIntervalAt: 8,
  },
  // the casual default: one game, first to 21, golden point
  casual1x21: {
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin: 21, settingAt: null, cap: null },
    midGameIntervalAt: null,
  },
} as const satisfies Record<string, StandardMatchConfig>;

export function americano(totalPoints: number): AmericanoConfig {
  return { kind: "americano", totalPoints };
}

export function createMatch(config: MatchConfig): MatchState {
  if (config.kind === "americano") {
    if (!Number.isInteger(config.totalPoints) || config.totalPoints < 1) {
      throw new Error(`totalPoints must be a positive integer, got ${config.totalPoints}`);
    }
  } else {
    if (!Number.isInteger(config.bestOf) || config.bestOf < 1 || config.bestOf % 2 === 0) {
      throw new Error(`bestOf must be a positive odd integer, got ${config.bestOf}`);
    }
    createGame(config.game); // reuse the game-config validation
    const t = config.midGameIntervalAt;
    if (t !== null && (!Number.isInteger(t) || t < 1 || t >= config.game.pointsToWin)) {
      throw new Error(`midGameIntervalAt must be null or in 1..pointsToWin-1, got ${t}`);
    }
  }
  return fold(config, []);
}

export function applyMatchPoint(state: MatchState, side: Side): MatchState {
  if (state.finished) throw new Error("point applied after the match ended");
  return fold(state.config, [...state.points, side]);
}

export function undo(state: MatchState): MatchState {
  if (state.points.length === 0) throw new Error("nothing to undo");
  return fold(state.config, state.points.slice(0, -1));
}

// ponytail: full refold on every point is O(n) per op, O(n²) per match; a
// match tops out around 180 points, so this stays. Incremental state if a
// profiler ever disagrees.
function fold(config: MatchConfig, points: readonly Side[]): MatchState {
  if (config.kind === "americano") {
    let a = 0;
    let b = 0;
    for (const p of points) {
      if (a + b >= config.totalPoints) throw new Error("point applied after the match ended");
      if (p === "a") a++;
      else b++;
    }
    const finished = a + b >= config.totalPoints;
    return {
      config,
      points,
      games: [],
      gamesWon: { a: 0, b: 0 },
      score: { a, b },
      finished,
      winner: finished && a !== b ? (a > b ? "a" : "b") : null,
      events: [],
    };
  }

  const need = Math.ceil(config.bestOf / 2);
  const games: { a: number; b: number }[] = [];
  const gamesWon = { a: 0, b: 0 };
  const events: MatchEvent[] = [];
  let game = createGame(config.game);
  let intervalFired = false;
  let winner: Side | null = null;

  for (const p of points) {
    if (winner) throw new Error("point applied after the match ended");
    game = applyPoint(game, p);
    if (
      !intervalFired &&
      config.midGameIntervalAt !== null &&
      game.score[p] === config.midGameIntervalAt &&
      !game.winner
    ) {
      intervalFired = true;
      events.push({ type: "interval", game: games.length });
    }
    if (game.winner) {
      games.push(game.score);
      gamesWon[game.winner]++;
      if (gamesWon[game.winner] === need) {
        winner = game.winner;
      } else {
        events.push({ type: "game_break", game: games.length - 1 });
        game = createGame(config.game);
        intervalFired = false;
      }
    }
  }

  return {
    config,
    points,
    games,
    gamesWon: { ...gamesWon },
    score: winner ? { a: 0, b: 0 } : game.score,
    finished: winner !== null,
    winner,
    events,
  };
}
