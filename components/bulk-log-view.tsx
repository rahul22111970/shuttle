// Bulk log, presentational and pure: one box to paste a night of scores,
// a live preview of what will be written, one button that says how many.
import { StyleSheet, Text, TextInput, View } from "react-native";
import { color, font, layout, radius, size, space, tracking } from "../theme/tokens";
import { BackBar, Button, Card, ErrorNote, GrowingInput, Screen } from "./ui";
import type { BulkResult, ParsedGame } from "../lib/bulk";

export type PreviewRow = { kind: "game" | "error"; line: number; text: string };

// winner first, the feed's own voice: "Rahul Pareek & Sai Kiran d. Gautam · 21–15"
function gameText(g: ParsedGame, nameOf: (id: string) => string): string {
  const aWon = g.score.a > g.score.b;
  const winners = (aWon ? g.a : g.b).map(nameOf).join(" & ");
  const losers = (aWon ? g.b : g.a).map(nameOf).join(" & ");
  const hi = Math.max(g.score.a, g.score.b);
  const lo = Math.min(g.score.a, g.score.b);
  return `${winners} d. ${losers} · ${hi}–${lo}`;
}

export function previewRows(
  result: BulkResult,
  nameOf: (id: string) => string
): PreviewRow[] {
  return [
    ...result.games.map((g) => ({
      kind: "game" as const,
      line: g.line,
      text: gameText(g, nameOf),
    })),
    ...result.errors.map((e) => ({
      kind: "error" as const,
      line: e.line,
      text: `Line ${e.line}: ${e.message}`,
    })),
  ].sort((x, y) => x.line - y.line);
}

export type BulkLogViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "no-group"; onBack: () => void }
  | {
      kind: "ready";
      onBack: () => void;
      text: string;
      onText: (v: string) => void;
      rows: readonly PreviewRow[];
      count: number;
      busy: boolean;
      // while saving: how many are already in, so the button counts along
      progress: number;
      // after saving: "All N in." — shown before the screen leaves
      saved: number | null;
      // "Added X of N. Line Y failed — the rest are untouched." or null
      partial: string | null;
      onAdd: () => void;
    };

export default function BulkLogView(props: BulkLogViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen testID="bulk-log">
        <Text style={styles.quiet}>Fetching the group…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen testID="bulk-log">
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  if (props.kind === "no-group") {
    return (
      <Screen testID="bulk-log">
        <Text style={styles.quiet}>No group yet. Start one before logging games.</Text>
        <Button label="Back" variant="quiet" onPress={props.onBack} />
      </Screen>
    );
  }

  return (
    <Screen testID="bulk-log">
      <BackBar title="Paste scores" onBack={props.onBack} />
      <Card>
        <Text style={styles.title}>The night's games</Text>
        <Text style={styles.quiet}>
          One game a line. Names, score, names. Or A vs B, score at the end.
        </Text>
        <GrowingInput
          label="Scores"
          value={props.text}
          onChange={props.onText}
          placeholder="Rahul & Sai 21-15 Gautam & Mitrajit"
          minHeight={132}
        />
      </Card>
      {props.rows.length > 0 ? (
        <Card>
          {props.rows.map((r) => (
            <Text key={r.line} style={r.kind === "error" ? styles.rowError : styles.row}>
              {r.text}
            </Text>
          ))}
        </Card>
      ) : null}
      <View style={styles.actions}>
        {props.saved !== null ? (
          <Text style={styles.saved}>
            {`All ${props.saved} in. Ratings updated.`}
          </Text>
        ) : (
          <Button
            label={`Add ${props.count} ${props.count === 1 ? "game" : "games"}`}
            busy={props.busy}
            busyLabel={`Saving ${props.progress} of ${props.count}…`}
            disabled={props.count === 0}
            onPress={props.onAdd}
          />
        )}
        {props.partial ? <ErrorNote>{props.partial}</ErrorNote> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: font.medium,
    fontSize: size.label,
    color: color.ink3,
    textTransform: "uppercase",
    letterSpacing: size.label * tracking.label,
  },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  saved: {
    fontFamily: font.bold,
    fontSize: size.body,
    color: color.court,
    textAlign: "center",
    paddingVertical: 12,
  },
  row: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  rowError: { fontFamily: font.body, fontSize: size.body, color: color.cork },
  actions: { width: "100%", maxWidth: layout.column, gap: space.sm },
});
