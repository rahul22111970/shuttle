// The who-plays picker, presentational and pure. Same tap cycle as the
// quick log (none -> A -> B -> none); ends in one button that starts the
// live scorer with everyone seated, so the game earns names, stats and
// ratings instead of "Side A".
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PickleballPoints } from "@shuttle/score";
import { PICKLEBALL_POINTS, type Sport } from "../lib/sport";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import type { PickRow } from "./quick-log-view";
import { BackBar, Button, Card, ErrorNote, Screen } from "./ui";

export type NewMatchViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      onBack: () => void;
      players: readonly PickRow[];
      busy: boolean;
      actionError: boolean;
      // false until the sides are 1v1 or 2v2
      startable: boolean;
      sport: Sport;
      // "Singles" / "Doubles" once the sides are ready, null before
      seating: string | null;
      // what the engine will actually do, read off the config
      rules: string;
      // pickleball's format choices; ignored for badminton
      points: PickleballPoints;
      onPoints: (points: PickleballPoints) => void;
      rally: boolean;
      onRally: (rally: boolean) => void;
      onCycle: (id: string) => void;
      onStart: () => void;
    };

const sideBadge = { a: "A", b: "B" } as const;

function Segment({
  options,
  value,
  onPick,
}: {
  options: readonly { key: string; label: string }[];
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          accessibilityRole="button"
          accessibilityState={{ selected: value === o.key }}
          style={[styles.segItem, value === o.key && styles.segItemOn]}
          onPress={() => onPick(o.key)}
        >
          <Text style={[styles.segText, value === o.key && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// 1v1 or 2v2, nothing else steps on court
export function sidesReady(players: readonly PickRow[]): boolean {
  const a = players.filter((p) => p.side === "a").length;
  const b = players.filter((p) => p.side === "b").length;
  return a === b && (a === 1 || a === 2);
}

export default function NewMatchView(props: NewMatchViewProps) {
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

  return (
    <Screen testID="new-match">
      <BackBar title="New game" onBack={props.onBack} />
      <Card>
        <Text style={styles.title}>Who plays</Text>
        <Text style={styles.quiet}>
          Tap a name for side A, again for side B. One each side is singles, two is doubles.
        </Text>
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
        {props.seating ? <Text style={styles.seating}>{props.seating}</Text> : null}
        <Text style={styles.quiet}>{props.rules}</Text>
        <Button
          label={props.startable ? "Start scoring" : "Pick the players"}
          busy={props.busy}
          busyLabel="Setting up…"
          disabled={!props.startable}
          onPress={props.onStart}
        />
        {props.actionError ? (
          <ErrorNote>That did not start. Check your network and try again.</ErrorNote>
        ) : null}
      </Card>
      {props.sport === "pickleball" ? (
        <Card>
          <Text style={styles.title}>Format</Text>
          <Segment
            options={PICKLEBALL_POINTS.map((p) => ({ key: String(p), label: `to ${p}` }))}
            value={String(props.points)}
            onPick={(k) => props.onPoints(Number(k) as PickleballPoints)}
          />
          <Segment
            options={[
              { key: "sideout", label: "Traditional" },
              { key: "rally", label: "Rally" },
            ]}
            value={props.rally ? "rally" : "sideout"}
            onPick={(k) => props.onRally(k === "rally")}
          />
          <Text style={styles.quiet}>
            Traditional is the standard rule. Only the serving side scores, and the app tracks
            who serves. Rally gives a point to whoever wins the rally.
          </Text>
        </Card>
      ) : null}
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
  seating: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  segment: { flexDirection: "row", gap: space.sm },
  segItem: {
    flex: 1,
    alignItems: "center",
    borderRadius: radius.control,
    paddingVertical: 9,
    backgroundColor: color.inkWash,
  },
  segItemOn: { backgroundColor: color.ink },
  segText: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  segTextOn: { color: color.fog0 },
  pickNameOn: { color: color.court },
});
