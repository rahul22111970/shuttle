// The game log, presentational and pure: window chips up top, then every
// game in the window grouped by day, written the way players say them.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, size, space, tracking } from "../theme/tokens";
import type { LogWindow } from "../lib/gamelog";
import { BackBar, Card, ErrorNote, Screen, Button } from "./ui";

export type GameRow = {
  id: string;
  line: string;
  score: string;
  when: string;
  self: "w" | "l" | null;
};

export type GamesViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      window: LogWindow;
      onWindow: (w: LogWindow) => void;
      days: readonly { label: string; rows: readonly GameRow[] }[];
      total: number;
      // true when the fetch cap was hit: the log admits what it dropped
      capped: boolean;
      onBack: () => void;
    };

const WINDOWS: { key: LogWindow; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "all", label: "All" },
];

export default function GamesView(props: GamesViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen>
        <Text style={styles.quiet}>Fetching the log…</Text>
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
    <Screen testID="games-screen">
      <BackBar title="Game log" onBack={props.onBack} />
      <Card>
        <View style={styles.chipRow}>
          {WINDOWS.map((w) => (
            <Pressable
              key={w.key}
              accessibilityRole="button"
              accessibilityState={{ selected: props.window === w.key }}
              style={[styles.chip, props.window === w.key && styles.chipOn]}
              onPress={() => props.onWindow(w.key)}
            >
              <Text style={[styles.chipText, props.window === w.key && styles.chipTextOn]}>
                {w.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.quiet}>
          {props.total === 0
            ? "No games in this window."
            : `${props.total} ${props.total === 1 ? "game" : "games"}.`}
        </Text>
      </Card>
      {props.days.map((day) => (
        <Card key={day.label}>
          <Text style={styles.title}>{day.label}</Text>
          {day.rows.map((row) => (
            <View key={row.id} style={styles.feedRow}>
              {row.self ? (
                <View style={[styles.badge, row.self === "w" ? styles.badgeW : styles.badgeL]}>
                  <Text style={row.self === "w" ? styles.badgeTextW : styles.badgeTextL}>
                    {row.self.toUpperCase()}
                  </Text>
                </View>
              ) : (
                <View style={styles.badgeDot} />
              )}
              <View style={styles.feedBody}>
                <Text style={styles.feedTeams}>{row.line}</Text>
                <Text style={styles.quiet}>{row.when}</Text>
              </View>
              <Text style={styles.feedScore}>{row.score}</Text>
            </View>
          ))}
        </Card>
      ))}
      {props.capped ? (
        <Text style={styles.quiet}>Showing the latest 300. Narrow the window for the rest.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  chipRow: { flexDirection: "row", gap: space.sm },
  chip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: color.inkWash,
  },
  chipOn: { backgroundColor: color.courtWash },
  chipText: { fontFamily: font.bold, fontSize: 12.5, color: color.ink2 },
  chipTextOn: { color: color.court },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  badge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  badgeW: { backgroundColor: color.courtWash },
  badgeL: { backgroundColor: color.inkWash },
  badgeTextW: { fontFamily: font.heavy, fontSize: 13, color: color.court },
  badgeTextL: { fontFamily: font.heavy, fontSize: 13, color: color.ink2 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 13, backgroundColor: color.line },
  feedBody: { flex: 1, gap: 2 },
  feedTeams: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  feedScore: {
    fontFamily: font.monoBold,
    fontSize: 12.5,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
});
