// The Today home, presentational and pure. Three cards, each ending in an
// action: the next session, the money position, the recent games feed with
// the quick-log door.
import { StyleSheet, Text, View } from "react-native";
import { color, layout, size, space } from "../theme/tokens";
import { rupees } from "./ledger-view";
import { Button, Card, ErrorNote, Screen } from "./ui";

export type FeedRow = {
  id: string;
  aLabel: string;
  bLabel: string;
  scoreLine: string;
  whenLabel: string;
};

export type TodayViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      // null session = nothing planned; null group = not even a group yet
      hasGroup: boolean;
      sessionLine: { dateLabel: string; live: boolean; selfIn: boolean } | null;
      // signed paise: positive owes, negative owed, null = no ledger yet
      balancePaise: number | null;
      feed: readonly FeedRow[];
      busyRsvp: boolean;
      actionError: boolean;
      onOpenSession: () => void;
      onRsvpIn: () => void;
      onLogGame: () => void;
    };

export default function TodayView(props: TodayViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen>
        <Text style={styles.quiet}>Fetching today…</Text>
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

  const { sessionLine, balancePaise, feed } = props;
  const rsvpOpen = sessionLine !== null && !sessionLine.live && !sessionLine.selfIn;
  // the ledger only exists inside a live night; offering it otherwise dead-ends
  const ledgerReachable = props.hasGroup && sessionLine?.live === true;

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>Next session</Text>
        {!props.hasGroup ? (
          <Text style={styles.copy}>No sessions yet. Your group's nights will land here.</Text>
        ) : sessionLine ? (
          <Text style={styles.copy}>
            {sessionLine.live ? "The night is on." : sessionLine.dateLabel}
            {sessionLine.selfIn && !sessionLine.live ? " · You're in." : ""}
          </Text>
        ) : (
          <Text style={styles.copy}>Nothing planned. Pick a night.</Text>
        )}
        {rsvpOpen ? (
          <Button
            label="I'm in"
            busy={props.busyRsvp}
            busyLabel="Joining…"
            onPress={props.onRsvpIn}
          />
        ) : (
          <Button
            label={props.hasGroup ? "Open the session" : "Start a group"}
            variant="quiet"
            onPress={props.onOpenSession}
          />
        )}
      </Card>
      <Card>
        <Text style={styles.title}>Money</Text>
        {balancePaise === null || balancePaise === 0 ? (
          <Text style={styles.copy}>Settled up.</Text>
        ) : balancePaise > 0 ? (
          <Text style={styles.owe}>You owe {rupees(balancePaise)}</Text>
        ) : (
          <Text style={styles.owed}>You are owed {rupees(-balancePaise)}</Text>
        )}
        {ledgerReachable ? (
          <Button label="Open the ledger" variant="quiet" onPress={props.onOpenSession} />
        ) : null}
      </Card>
      <Card>
        <Text style={styles.title}>Recent games</Text>
        {feed.length === 0 ? (
          <Text style={styles.copy}>No games yet. Score one tonight.</Text>
        ) : (
          feed.map((row) => (
            <View key={row.id} style={styles.feedRow}>
              <Text style={styles.feedTeams} numberOfLines={1}>
                {`${row.aLabel} · ${row.bLabel}`}
              </Text>
              <Text style={styles.feedScore}>{row.scoreLine}</Text>
              <Text style={styles.quiet}>{row.whenLabel}</Text>
            </View>
          ))
        )}
        <Button
          label="Log a game"
          variant={rsvpOpen ? "quiet" : undefined}
          onPress={props.onLogGame}
        />
      </Card>
      {props.actionError ? (
        <ErrorNote>That did not go through. Try again.</ErrorNote>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: size.lead, color: color.ink },
  copy: { fontSize: size.body, color: color.ink2 },
  quiet: { fontSize: size.label, color: color.ink3 },
  owe: { fontSize: size.lead, color: color.cork },
  owed: { fontSize: size.lead, color: color.court },
  feedRow: {
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
    maxWidth: layout.column,
  },
  feedTeams: { fontSize: size.body, color: color.ink2 },
  feedScore: { fontSize: size.body, color: color.ink, fontVariant: ["tabular-nums"] },
});
