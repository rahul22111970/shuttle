// Match layer over the single-game engine: bestOf, intervals, undo, serve
// rotation, presets. Same rules as the core: pure, deterministic, throws on
// misuse.
//
// Two sports share this engine because only one thing separates them.
// Badminton is RALLY scoring (BWF Law 7.3): every rally is a point to
// whoever won it. Pickleball's standard is SIDE-OUT scoring (USA Pickleball
// 2026 rulebook 4.A): only the serving side can score, and a rally lost by
// the servers passes serve instead of awarding a point. So `points` here is
// the list of RALLY WINNERS, not point scorers — identical under rally
// scoring, and the thing that makes side-out foldable at all.
//
// Americano is deliberately NOT a GameConfig. RESEARCH §7: it is one game to
// a fixed points TOTAL (13-11 ends a 24-point game), a different termination
// rule than first-to-N, and it can tie. PM decision 2026-08-08: it gets its
// own config kind here rather than a distorted GameConfig.

import { applyPoint, createGame, type GameConfig, type Side } from "./index";

// Absent from a config = rally scoring. Present = pickleball side-out.
export type ServeConfig = {
  readonly mode: "sideout";
  // USAP 5.B: both partners serve before a side out, EXCEPT the team that
  // starts a game, which gets only its second server — the "0-0-2" opening.
  // Singles has one server and sides out on the first lost rally (5.A.3).
  readonly doubles: boolean;
};

export type StandardMatchConfig = {
  readonly kind: "standard";
  readonly bestOf: number;
  readonly game: GameConfig;
  // BWF: a breather when the leading score first reaches this, once per game.
  // Pickleball reuses it as the end-change point (USAP 21.B): 6 / 8 / 11.
  readonly midGameIntervalAt: number | null;
  readonly serve?: ServeConfig;
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
  // the surviving RALLY-WINNER list; undo pops it
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
  // who serves the next rally; null once the match is over
  readonly serving: Side | null;
  // side-out doubles only: which of the serving side's two servers is up,
  // the third number in a pickleball score call. null everywhere else.
  readonly serverNumber: 1 | 2 | null;
};

const other = (side: Side): Side => (side === "a" ? "b" : "a");

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
  // the club default: one game under the real BWF ending — 21, win by two
  // from 20-all (Law 7.4), and the 30th point takes it at 29-all (Law 7.5)
  bwf1x21: {
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin: 21, settingAt: 20, cap: 30 },
    midGameIntervalAt: 11,
  },
} as const satisfies Record<string, StandardMatchConfig>;

// USAP 21.B: the end change sits at 6 / 8 / 11 in an 11 / 15 / 21 point game.
const PICKLEBALL_END_CHANGE: Record<number, number> = { 11: 6, 15: 8, 21: 11 };

export type PickleballPoints = 11 | 15 | 21;

// One pickleball game. Win by two with NO cap — 15.C caps nothing, unlike
// badminton's 30. `rally` opts into the provisional rally-scoring variation
// (14.A), where every rally is a point exactly like badminton.
export function pickleball(
  pointsToWin: PickleballPoints,
  doubles: boolean,
  rally = false
): StandardMatchConfig {
  return {
    kind: "standard",
    bestOf: 1,
    game: { pointsToWin, settingAt: pointsToWin - 1, cap: null },
    midGameIntervalAt: PICKLEBALL_END_CHANGE[pointsToWin] ?? null,
    ...(rally ? {} : { serve: { mode: "sideout", doubles } as const }),
  };
}

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
    // a side-out game that can be won without a two-point lead is not a
    // rule any code here implements; refuse it rather than guess
    if (config.serve && config.game.settingAt === null) {
      throw new Error("side-out scoring needs a win-by-two game");
    }
  }
  return fold(config, []);
}

// `side` is the side that WON THE RALLY. Under side-out scoring that is not
// always the side that scores.
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
      serving: finished ? null : points.length === 0 ? "a" : points[points.length - 1],
      serverNumber: null,
    };
  }

  const need = Math.ceil(config.bestOf / 2);
  const sideOut = config.serve ?? null;
  const games: { a: number; b: number }[] = [];
  const gamesWon = { a: 0, b: 0 };
  const events: MatchEvent[] = [];
  let game = createGame(config.game);
  let intervalFired = false;
  let winner: Side | null = null;
  // side A opens the match either way. Under side-out the opening team gets
  // only its second server (USAP 5.B.2); singles has no second server.
  let serving: Side = "a";
  let serverNumber: 1 | 2 = sideOut?.doubles ? 2 : 1;

  for (const rallyWinner of points) {
    if (winner) throw new Error("point applied after the match ended");

    if (sideOut && rallyWinner !== serving) {
      // servers lost the rally: nobody scores, the serve moves on
      if (sideOut.doubles && serverNumber === 1) serverNumber = 2;
      else {
        serving = other(serving);
        serverNumber = 1;
      }
      continue;
    }
    const scorer = sideOut ? serving : rallyWinner;
    if (!sideOut) serving = rallyWinner; // rally scoring: the winner serves next

    game = applyPoint(game, scorer);
    if (
      !intervalFired &&
      config.midGameIntervalAt !== null &&
      game.score[scorer] === config.midGameIntervalAt &&
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
        if (sideOut) {
          // USAP 21.F.2: the initial service changes each game
          serving = games.length % 2 === 0 ? "a" : "b";
          serverNumber = sideOut.doubles ? 2 : 1;
        }
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
    serving: winner ? null : serving,
    serverNumber: winner || !sideOut?.doubles ? null : serverNumber,
  };
}

// The score as pickleball says it out loud: "server–receiver–server number"
// in side-out doubles (USAP 6.B.2), two numbers in singles and under rally
// scoring (14.A.3). Returns null for anything that is not a live side-out
// or rally standard game — badminton reads its own two digits.
export function scoreCall(state: MatchState): string | null {
  if (state.finished || state.serving === null) return null;
  const server = state.score[state.serving];
  const receiver = state.score[other(state.serving)];
  if (state.serverNumber === null) return `${server}–${receiver}`;
  return `${server}–${receiver}–${state.serverNumber}`;
}
