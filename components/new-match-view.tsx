// The who-plays picker, presentational and pure. Same tap cycle as the
// quick log (none -> A -> B -> none); ends in one button that starts the
// live scorer with everyone seated, so the game earns names, stats and
// ratings instead of "Side A".
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import type { PickRow } from "./quick-log-view";
import { Button, Card, ErrorNote, Screen } from "./ui";

export type NewMatchViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      players: readonly PickRow[];
      busy: boolean;
      actionError: boolean;
      // false until the sides are 1v1 or 2v2
      startable: boolean;
      onCycle: (id: string) => void;
      onStart: () => void;
    };

const sideBadge = { a: "A", b: "B" } as const;

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
      <Card>
        <Text style={styles.title}>Who plays</Text>
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
});
