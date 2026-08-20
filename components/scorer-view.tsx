// The casual scorer, presentational and pure. Two giant tap zones, tabular
// digits, the service dot on whoever serves, the scorer chip naming who
// holds the phone. Match-complete reads GAMES, never score — a finished
// standard match zeroes its score field (S1-02).
//
// A tap always means "this side won the rally". Under badminton's rally
// scoring that is the same as a point. Under pickleball's side-out scoring
// it often is not, so the zones say rally, the serve indicator is the
// engine's own, and the pickleball score call sits above the digits.
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { applyMatchPoint, scoreCall, type MatchState, type Side } from "@shuttle/score";
import { color, font, radius, shadow, size, space, tracking } from "../theme/tokens";
import { Button, Card, ErrorNote, Screen, Wordmark } from "./ui";

export type ScorerViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "gone" }
  | {
      kind: "scoring";
      state: MatchState;
      onLeave: () => void;
      scorerName: string;
      pendingSide: Side | null;
      // the offline-write-failed state: the tap did not land, the handle
      // did not advance, the score on screen is still the truth
      writeFailed: boolean;
      caughtUp: boolean;
      onTap: (side: Side) => void;
      onUndo: () => void;
    }
  | {
      kind: "complete";
      games: readonly { readonly a: number; readonly b: number }[];
      winner: Side | null;
      onDone: () => void;
      onNextGame?: () => void;
    };

// The engine already knows who serves; this only covers a finished state,
// which the scoring screen never renders.
function servingSide(state: MatchState): Side {
  return state.serving ?? (state.points[state.points.length - 1] ?? "a");
}

// What is at stake, asked of the engine rather than re-derived: play the
// next rally for each side and see what it would end. Exact for side-out
// scoring too, where a rally won by the receivers ends nothing.
function tension(state: MatchState): string | null {
  // the row said live but the log replayed as finished: nothing is at stake
  // and applyMatchPoint would throw
  if (state.finished) return null;
  const ends = (side: Side) => {
    const next = applyMatchPoint(state, side);
    return next.finished ? "match" : next.games.length > state.games.length ? "game" : null;
  };
  const a = ends("a");
  const b = ends("b");
  const word = (kind: "match" | "game") =>
    kind === "match" && state.config.kind === "standard" && state.config.bestOf > 1
      ? "Match point"
      : "Game point";
  if (a && b) return "Next rally takes it.";
  if (a) return `${word(a)} A.`;
  if (b) return `${word(b)} B.`;
  if (state.config.kind === "standard") {
    const { settingAt } = state.config.game;
    if (settingAt !== null && state.score.a >= settingAt && state.score.a === state.score.b) {
      return "Deuce. Win by two.";
    }
  }
  return null;
}

export default function ScorerView(props: ScorerViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen>
        <Wordmark />
        <Text style={styles.quiet}>Fetching the match…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen>
        <Wordmark />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  if (props.kind === "gone") {
    return (
      <Screen>
        <Wordmark />
        <Text style={styles.quiet}>That match is gone.</Text>
      </Screen>
    );
  }

  if (props.kind === "complete") {
    const gamesLine = props.games.map((g) => `${g.a}–${g.b}`).join(" · ");
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>
            {props.winner === null ? "Drawn." : `Side ${props.winner.toUpperCase()} takes it.`}
          </Text>
          <Text style={styles.gamesLine}>{gamesLine}</Text>
        </Card>
        {props.onNextGame ? (
          <Button label="Score the next game" onPress={props.onNextGame} />
        ) : null}
        <Button
          label="Back to the night"
          variant={props.onNextGame ? "quiet" : "primary"}
          onPress={props.onDone}
        />
      </Screen>
    );
  }

  const { state, scorerName, pendingSide, onTap, onUndo, onLeave } = props;
  const serving = servingSide(state);
  const sideOut = state.config.kind === "standard" && state.config.serve !== undefined;
  const call = sideOut ? scoreCall(state) : null;
  const stake = tension(state);
  const gamesNote =
    state.games.length > 0 ? state.games.map((g) => `${g.a}–${g.b}`).join(" · ") : null;

  return (
    <View style={styles.root}>
      <View style={styles.scoreHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave scoring"
          style={({ pressed }) => [styles.backb, pressed && { opacity: 0.6 }]}
          onPress={onLeave}
        >
          <Text style={styles.backbText}>‹</Text>
        </Pressable>
        <Text style={styles.headNote}>
          {sideOut
            ? "Tap whoever won the rally. Only the serving side scores."
            : "The game stays live. Come back from the session tab."}
        </Text>
      </View>
      {call ? (
        <Text style={styles.call}>{`Serving ${serving.toUpperCase()} · ${call}`}</Text>
      ) : null}
      {stake ? <Text style={styles.stake}>{stake}</Text> : null}
      <View style={styles.zones}>
        {(["a", "b"] as const).map((side) => (
          <Pressable
            key={side}
            accessibilityRole="button"
            accessibilityLabel={`${sideOut ? "Rally" : "Point"} to side ${side.toUpperCase()}`}
            accessibilityState={{ disabled: pendingSide !== null }}
            disabled={pendingSide !== null}
            style={({ pressed }) => [
              styles.zone,
              serving === side && styles.zoneServing,
              pressed && styles.zonePressed,
            ]}
            onPress={() => onTap(side)}
          >
            <View style={styles.serviceRow}>
              {serving === side ? <View style={styles.serviceDot} /> : null}
              <Text style={[styles.sideLabel, serving === side && styles.sideLabelServing]}>
                {side.toUpperCase()}
              </Text>
            </View>
            <Text
              style={[
                styles.digits,
                serving === side && styles.digitsServing,
                pendingSide === side && styles.digitsPending,
              ]}
            >
              {state.score[side]}
            </Text>
          </Pressable>
        ))}
      </View>
      {gamesNote ? <Text style={styles.games}>{gamesNote}</Text> : null}
      {props.writeFailed ? (
        <ErrorNote>That point did not save. Check your network and tap again.</ErrorNote>
      ) : null}
      {props.caughtUp ? (
        <ErrorNote>Another phone scored too. Your tap did not count. Check the score.</ErrorNote>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.chip}>{scorerName ? `${scorerName} is scoring` : "You\u2019re scoring"}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: state.points.length === 0 || pendingSide !== null }}
          disabled={state.points.length === 0 || pendingSide !== null}
          style={[
            styles.undo,
            (state.points.length === 0 || pendingSide !== null) && styles.undoOff,
          ]}
          onPress={onUndo}
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Platform.OS === "web" ? "transparent" : color.fog0, padding: space.md, gap: space.md },
  scoreHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  backb: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: color.inkWash,
    alignItems: "center",
    justifyContent: "center",
  },
  backbText: { fontFamily: font.bold, fontSize: 22, lineHeight: 24, color: color.ink },
  headNote: { flex: 1, fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  zones: { flex: 1, flexDirection: "row", gap: space.md },
  zone: {
    flex: 1,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: color.card,
    boxShadow: [...shadow.ring],
  },
  // the serving side IS the green surface (mockup .pad.srv)
  zoneServing: { backgroundColor: color.court },
  zonePressed: { transform: [{ scale: 0.98 }] },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  serviceDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: space.sm / 2,
    backgroundColor: color.chalk,
  },
  sideLabel: { fontFamily: font.bold, fontSize: size.label, color: color.ink3, letterSpacing: 2 },
  sideLabelServing: { color: color.chalk },
  digits: {
    fontFamily: font.monoBold,
    fontSize: 104,
    fontVariant: ["tabular-nums"],
    color: color.ink,
    letterSpacing: -2,
  },
  digitsServing: { color: color.chalk },
  digitsPending: { opacity: 0.45 },
  games: { fontFamily: font.body, fontSize: size.body, color: color.ink2, textAlign: "center" },
  call: {
    fontFamily: font.monoBold,
    fontSize: size.lead,
    color: color.courtDeep,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  stake: {
    fontFamily: font.semibold,
    fontSize: size.body,
    color: color.ink2,
    textAlign: "center",
  },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3, textAlign: "center" },
  title: { fontFamily: font.display, fontSize: size.display, color: color.ink, letterSpacing: size.display * tracking.display },
  gamesLine: { fontFamily: font.mono, fontSize: size.lead, color: color.ink2, fontVariant: ["tabular-nums"] },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.sm,
  },
  chip: {
    fontSize: size.label,
    color: color.courtDeep,
    backgroundColor: color.courtWash,
    borderRadius: radius.control,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    overflow: "hidden",
  },
  undo: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  undoOff: { opacity: 0.4 },
  undoText: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
});
