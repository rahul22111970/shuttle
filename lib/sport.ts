// One group plays one sport, and the sport decides two things: the words on
// screen and the match config the scorer opens with. Everything else — the
// night, the ladder, the ledger, the op log — is shared, which is the whole
// reason a second sport costs a column and not a second app.
import {
  pickleball,
  PRESETS,
  type MatchConfig,
  type PickleballPoints,
  type StandardMatchConfig,
} from "@shuttle/score";

export type Sport = "badminton" | "pickleball";

export const SPORTS = ["badminton", "pickleball"] as const;

export const SPORT_NAME: Record<Sport, string> = {
  badminton: "Badminton",
  pickleball: "Pickleball",
};

// rows written before 0016 and anything unexpected read as badminton, the
// column default
export function asSport(value: unknown): Sport {
  return value === "pickleball" ? "pickleball" : "badminton";
}

// Pickleball's real formats (USAP 15.C.1). Badminton club play has one
// answer, so it gets no chooser.
export const PICKLEBALL_POINTS: readonly PickleballPoints[] = [11, 15, 21];

// What a fresh game in this group looks like. `doubles` comes from the
// seating, which is what makes singles a mode rather than a setting: two on
// court and pickleball drops its second server (USAP 5.A.3).
export function defaultMatch(
  sport: Sport,
  doubles: boolean,
  pickleballTo: PickleballPoints = 11,
  rally = false
): StandardMatchConfig {
  return sport === "pickleball" ? pickleball(pickleballTo, doubles, rally) : PRESETS.bwf1x21;
}

// The rules, read back off the config so the sentence can never drift from
// what the engine will actually do.
export function rulesLine(config: MatchConfig): string {
  if (config.kind === "americano") return `One game. First to ${config.totalPoints} points in total.`;
  const { game, bestOf } = config;
  const games = bestOf === 1 ? "One game" : `Best of ${bestOf}`;
  const ending =
    game.settingAt === null
      ? `to ${game.pointsToWin}.`
      : game.cap === null
        ? `to ${game.pointsToWin}, win by two.`
        : `to ${game.pointsToWin}, win by two from ${game.settingAt}-all, and ${game.cap} takes it.`;
  return config.serve
    ? `${games} ${ending} Only the serving side scores.`
    : `${games} ${ending}`;
}

// Singles or doubles, from how many are seated on a side.
export const seatingLabel = (perSide: number): string => (perSide === 1 ? "Singles" : "Doubles");
