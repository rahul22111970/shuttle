// The quick log, presentational and pure. One screen: tap players onto
// sides, type the final score, one button that says what it will do.
import { StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import { BackBar, Button, Card, ErrorNote, Screen } from "./ui";

export type PickRow = {
  id: string;
  name: string;
  // none = on the bench; the tap cycle is none -> a -> b -> none
  side: "none" | "a" | "b";
};

export type QuickLogViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "no-group"; onBack: () => void }
  | {
      kind: "ready";
      onBack: () => void;
      players: readonly PickRow[];
      scoreA: string;
      scoreB: string;
      busy: boolean;
      actionError: boolean;
      // null = not loggable yet; a string = the button label, e.g. "Log 21–15"
      logLabel: string | null;
      onCycle: (id: string) => void;
      onScoreA: (v: string) => void;
      onScoreB: (v: string) => void;
      onLog: () => void;
    };

const sideBadge = { a: "A", b: "B" } as const;

// The whole validation, pure so it can be tested by oracle: digits only
// (web number-pad is advisory; minus signs, spaces and paste get through),
// no tie, sides 1v1 or 2v2. Null = not loggable yet.
export function logLabelFor(
  players: readonly PickRow[],
  scoreA: string,
  scoreB: string
): string | null {
  const isScore = (s: string) => /^\d{1,2}$/.test(s);
  if (!isScore(scoreA) || !isScore(scoreB)) return null;
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (a === b) return null;
  const onA = players.filter((p) => p.side === "a").length;
  const onB = players.filter((p) => p.side === "b").length;
  if (onA < 1 || onA > 2 || onA !== onB) return null;
  return `Log ${a}–${b}`;
}

export default function QuickLogView(props: QuickLogViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen>
        <Text style={styles.quiet}>Fetching the group…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen>
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  if (props.kind === "no-group") {
    return (
      <Screen>
        <Text style={styles.quiet}>No group yet. Start one before logging games.</Text>
        <Button label="Back to Today" variant="quiet" onPress={props.onBack} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackBar title="Log a game" onBack={props.onBack} />
      <Card>
        <Text style={styles.title}>Who played</Text>
        <Text style={styles.quiet}>Tap a name for side A, again for side B.</Text>
        <View style={styles.pickWrap}>
          {props.players.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => props.onCycle(p.id)}
              style={[styles.pick, p.side !== "none" && styles.pickOn]}
            >
              <Text style={[styles.pickName, p.side !== "none" && styles.pickNameOn]}>
                {p.side === "none" ? p.name : `${p.name} · ${sideBadge[p.side]}`}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
      <Card>
        <Text style={styles.title}>Final score</Text>
        <View style={styles.scoreRow}>
          <TextInput
            accessibilityLabel="Side A score"
            style={styles.scoreBox}
            value={props.scoreA}
            onChangeText={props.onScoreA}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="21"
            placeholderTextColor={color.ink3}
          />
          <Text style={styles.scoreDash}>–</Text>
          <TextInput
            accessibilityLabel="Side B score"
            style={styles.scoreBox}
            value={props.scoreB}
            onChangeText={props.onScoreB}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="15"
            placeholderTextColor={color.ink3}
          />
        </View>
        <Button
          label={props.logLabel ?? "Log the game"}
          busy={props.busy}
          busyLabel="Logging…"
          disabled={props.logLabel === null}
          onPress={props.onLog}
        />
        {props.actionError ? (
          <ErrorNote>That did not save. Check your network and try again.</ErrorNote>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  pickWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pick: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: color.inkWash,
  },
  pickOn: { backgroundColor: color.courtWash },
  pickName: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  pickNameOn: { color: color.court },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  scoreBox: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    fontFamily: font.mono,
    fontSize: size.display,
    color: color.ink,
    minWidth: 72,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  scoreDash: { fontFamily: font.body, fontSize: size.display, color: color.ink3 },
});
