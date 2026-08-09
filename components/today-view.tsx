// The Today home, presentational and pure. A dated heading, then three
// cards, each ending in an action: the next session with the roster's
// RSVP state, the money position, and recent games written the way
// players say them ("A d. B") under a this-week stat strip.
import { StyleSheet, Text, View } from "react-native";
import { color, font, layout, size, space, tracking } from "../theme/tokens";
import { rupees } from "./ledger-view";
import { AppBar, Button, Card, ErrorNote, Screen } from "./ui";

export type FeedRow = {
  id: string;
  // "Asha & Bela d. Chirag & Dev" — winners first, or "A · B" when drawn
  line: string;
  score: string;
  when: string;
  // W/L from the viewer's seat; null when they sat this one out
  self: "w" | "l" | null;
};

export type RosterChip = { id: string; name: string; going: boolean };

export type WeekStrip = { sessions: number; games: number; winsPct: number | null };

export type TodayViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      dateLine: string;
      // null session = nothing planned; null group = not even a group yet
      hasGroup: boolean;
      sessionLine: { dateLabel: string; live: boolean; selfIn: boolean } | null;
      roster: readonly RosterChip[];
      // signed paise: positive owes, negative owed, null = no ledger yet
      balancePaise: number | null;
      week: WeekStrip;
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

  const { sessionLine, balancePaise, feed, roster, week } = props;
  const rsvpOpen = sessionLine !== null && !sessionLine.live && !sessionLine.selfIn;
  // the ledger only exists inside a live night; offering it otherwise dead-ends
  const ledgerReachable = props.hasGroup && sessionLine?.live === true;

  return (
    <Screen>
      <AppBar title="Today" sub={props.dateLine} onAction={props.onLogGame} actionLabel="Log a game" />
      <Card>
        <Text style={styles.title}>Next session</Text>
        {!props.hasGroup ? (
          <>
            <Text style={styles.copy}>No sessions yet. Your group's nights will land here.</Text>
            <Text style={styles.quiet}>Start a group, plan a night, and this page fills itself.</Text>
          </>
        ) : sessionLine ? (
          <Text style={styles.sessionWhen}>
            {sessionLine.live ? "The night is on." : sessionLine.dateLabel}
          </Text>
        ) : (
          <Text style={styles.copy}>Nothing planned. Pick a night.</Text>
        )}
        {sessionLine && roster.length > 0 ? (
          <View style={styles.chipWrap}>
            {roster.map((r) => (
              <View key={r.id} style={[styles.chip, r.going && styles.chipGoing]}>
                <Text style={[styles.chipText, r.going && styles.chipTextGoing]}>
                  {r.going ? `${r.name} ✓` : `${r.name} ?`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {rsvpOpen ? (
          <Button
            label="I'm in"
            busy={props.busyRsvp}
            busyLabel="Joining…"
            onPress={props.onRsvpIn}
          />
        ) : (
          <Button
            label={
              !props.hasGroup
                ? "Start a group"
                : sessionLine?.live
                  ? "Go to the night"
                  : sessionLine
                    ? "Open the session"
                    : "Plan a night"
            }
            variant={sessionLine?.live ? undefined : "quiet"}
            onPress={props.onOpenSession}
          />
        )}
      </Card>
      {props.hasGroup ? (
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
      ) : null}
      <Card>
        <Text style={styles.title}>This week</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Sessions</Text>
            <Text style={styles.statNumber}>{week.sessions}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Games</Text>
            <Text style={styles.statNumber}>{week.games}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Wins</Text>
            <Text style={styles.statNumber}>
              {week.winsPct === null ? "–" : `${week.winsPct}%`}
            </Text>
          </View>
        </View>
        {feed.length === 0 ? (
          <Text style={styles.copy}>No games yet. Score one tonight.</Text>
        ) : (
          feed.map((row) => (
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
          ))
        )}
        <Button
          label="Log a game"
          variant={rsvpOpen || sessionLine?.live ? "quiet" : undefined}
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
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  sessionWhen: { fontFamily: font.bold, fontSize: 15.5, color: color.ink },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: color.inkWash,
  },
  chipGoing: { backgroundColor: color.courtWash },
  chipText: { fontFamily: font.bold, fontSize: 12.5, color: color.ink2 },
  chipTextGoing: { color: color.court },
  owe: { fontFamily: font.monoBold, fontSize: 21, color: color.cork, fontVariant: ["tabular-nums"] },
  owed: { fontFamily: font.monoBold, fontSize: 21, color: color.court, fontVariant: ["tabular-nums"] },
  statRow: {
    flexDirection: "row",
    gap: 22,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  stat: { gap: 2 },
  statNumber: {
    fontFamily: font.monoBold,
    fontSize: 21,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeW: { backgroundColor: color.courtWash },
  badgeL: { backgroundColor: color.inkWash },
  badgeTextW: { fontFamily: font.heavy, fontSize: 13, color: color.court },
  badgeTextL: { fontFamily: font.heavy, fontSize: 13, color: color.ink2 },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 9,
    backgroundColor: color.line,
  },
  feedBody: { flex: 1, gap: 2 },
  feedTeams: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  feedScore: {
    fontFamily: font.monoBold,
    fontSize: 12.5,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
});
