// The Me tab, presentational and pure. The player's name up top, the
// form card (win % hero, streak, last-10 dots), partner chemistry bars,
// recent games in the feed idiom, sign out at the bottom.
import { StyleSheet, Text, View } from "react-native";
import { color, font, layout, size, space, tracking } from "../theme/tokens";
import type { Form } from "../lib/stats";
import { Button, Card, ErrorNote, Screen } from "./ui";

export type MeFeedRow = {
  id: string;
  line: string;
  score: string;
  when: string;
  self: "w" | "l" | null;
};

export type ChemistryRow = {
  partnerId: string;
  name: string;
  played: number;
  winPct: number | null;
};

export type MeViewProps =
  | { kind: "loading"; name: string }
  | { kind: "error"; name: string; onRetry: () => void }
  | {
      kind: "ready";
      name: string;
      detail: string;
      winPct: number | null;
      streak: number;
      lastTen: readonly Form[];
      chemistry: readonly ChemistryRow[];
      recent: readonly MeFeedRow[];
      onSignOut: () => void;
    };

const streakLabel = (streak: number) =>
  streak === 0 ? null : streak > 0 ? `W${streak}` : `L${-streak}`;

export default function MeView(props: MeViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen>
        <Text style={styles.headingWord}>{props.name}</Text>
        <Text style={styles.quiet}>Fetching your games…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen>
        <Text style={styles.headingWord}>{props.name}</Text>
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  const streak = streakLabel(props.streak);

  return (
    <Screen testID="me-screen">
      <View style={styles.heading}>
        <Text style={styles.headingWord}>{props.name}</Text>
        <Text style={styles.headingDate}>{props.detail}</Text>
      </View>
      <Card>
        <Text style={styles.title}>Form</Text>
        {props.lastTen.length === 0 ? (
          <Text style={styles.copy}>No games yet. Score one tonight.</Text>
        ) : (
          <>
            <View style={styles.formRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{props.winPct === null ? "–" : `${props.winPct}%`}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
              {streak ? (
                <View style={styles.stat}>
                  <Text
                    style={[
                      styles.statNumber,
                      props.streak > 0 ? styles.streakW : styles.streakL,
                    ]}
                  >
                    {streak}
                  </Text>
                  <Text style={styles.statLabel}>Streak</Text>
                </View>
              ) : null}
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{props.lastTen.length}</Text>
                <Text style={styles.statLabel}>Recent</Text>
              </View>
            </View>
            <View style={styles.dotRow}>
              {props.lastTen.map((f, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    f === "w" ? styles.dotW : f === "l" ? styles.dotL : styles.dotD,
                  ]}
                />
              ))}
            </View>
          </>
        )}
      </Card>
      <Card>
        <Text style={styles.title}>Partners</Text>
        {props.chemistry.length === 0 ? (
          <Text style={styles.copy}>Play 3 games with someone to see your chemistry.</Text>
        ) : (
          props.chemistry.map((c) => (
            <View key={c.partnerId} style={styles.chemRow}>
              <View style={styles.chemHead}>
                <Text style={styles.chemName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.chemFigure}>
                  {c.winPct === null ? "–" : `${c.winPct}%`} · {c.played} games
                </Text>
              </View>
              <View style={styles.chemTrack}>
                <View style={[styles.chemBar, { width: `${c.winPct ?? 0}%` }]} />
              </View>
            </View>
          ))
        )}
      </Card>
      <Card>
        <Text style={styles.title}>Recent games</Text>
        {props.recent.length === 0 ? (
          <Text style={styles.copy}>Your games will land here.</Text>
        ) : (
          props.recent.map((row) => (
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
      </Card>
      <Button label="Sign out" variant="quiet" onPress={props.onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { width: "100%", maxWidth: layout.column, gap: space.xs },
  headingWord: {
    fontFamily: font.display,
    fontSize: size.hero,
    color: color.ink,
    letterSpacing: size.hero * tracking.display,
  },
  headingDate: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  formRow: { flexDirection: "row", gap: space.xl },
  stat: { gap: 2 },
  statNumber: {
    fontFamily: font.mono,
    fontSize: size.display,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  streakW: { color: color.court },
  streakL: { color: color.cork },
  dotRow: { flexDirection: "row", gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotW: { backgroundColor: color.court },
  dotL: { backgroundColor: color.fog2, borderWidth: 1, borderColor: color.lineStrong },
  dotD: { backgroundColor: color.line },
  chemRow: { gap: space.xs },
  chemHead: { flexDirection: "row", justifyContent: "space-between" },
  chemName: { flex: 1, fontFamily: font.medium, fontSize: size.body, color: color.ink },
  chemFigure: {
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  chemTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.fog2,
    overflow: "hidden",
  },
  chemBar: { height: 6, borderRadius: 3, backgroundColor: color.court },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeW: { backgroundColor: color.courtWash },
  badgeL: { backgroundColor: color.fog2 },
  badgeTextW: { fontFamily: font.medium, fontSize: size.label, color: color.courtDeep },
  badgeTextL: { fontFamily: font.medium, fontSize: size.label, color: color.ink3 },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 9,
    backgroundColor: color.line,
  },
  feedBody: { flex: 1, gap: 2 },
  feedTeams: { fontFamily: font.body, fontSize: size.body, color: color.ink },
  feedScore: {
    fontFamily: font.mono,
    fontSize: size.body,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
});
