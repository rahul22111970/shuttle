// The round area of a live night, presentational and pure. Court cards
// carry the pairings and open the scorer; complete cards show their
// result; a live card says resume (S1-15 carry). Standings are the night's
// running tally, tallest first.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, layout, radius, shadow, size, space, tracking } from "../theme/tokens";
import { Button, Card, ErrorNote } from "./ui";

export type CourtCard = {
  matchId: string;
  status: "live" | "complete";
  aNames: readonly string[];
  bNames: readonly string[];
  score: { a: number; b: number } | null;
};

export type StandingRow = { id: string; name: string; points: number };

export type RoundsViewProps =
  | { kind: "no-checkins"; checkedInCount: number }
  | {
      kind: "empty";
      busy: boolean;
      actionError: boolean;
      // one primary per screen: while the viewer still needs to check in,
      // round actions step back
      demoted: boolean;
      onFirstRound: (format: "americano" | "mexicano") => void;
    }
  | {
      kind: "round";
      roundNumber: number;
      courts: readonly CourtCard[];
      restingNames: readonly string[];
      scorerName: string | null;
      standings: readonly StandingRow[];
      busy: boolean;
      actionError: boolean;
      demoted: boolean;
      onOpenMatch: (matchId: string) => void;
      onNextRound: () => void;
    };

export default function RoundsView(props: RoundsViewProps) {
  if (props.kind === "no-checkins") {
    return (
      <Card>
        <Text style={styles.title}>Rounds</Text>
        <Text style={styles.copy}>
          Check people in, then deal fair games. {props.checkedInCount} checked in.
        </Text>
      </Card>
    );
  }

  if (props.kind === "empty") {
    return (
      <Card>
        <Text style={styles.title}>Rounds</Text>
        <Text style={styles.copy}>Everyone in? Pick tonight's format.</Text>
        <Button
          label="Americano"
          variant={props.demoted ? "quiet" : "primary"}
          busy={props.busy}
          busyLabel="Dealing…"
          disabled={props.demoted}
          onPress={() => props.onFirstRound("americano")}
        />
        <Button
          label="Mexicano"
          variant="quiet"
          busy={false}
          disabled={props.busy || props.demoted}
          onPress={() => props.onFirstRound("mexicano")}
        />
        {props.actionError ? (
          <ErrorNote>That did not go through. Try again.</ErrorNote>
        ) : null}
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Text style={styles.title}>Round {props.roundNumber}</Text>
        {props.courts.map((court, i) => (
          <Pressable
            key={court.matchId}
            accessibilityRole="button"
            accessibilityLabel={`Court ${i + 1}`}
            style={styles.court}
            onPress={() => props.onOpenMatch(court.matchId)}
          >
            <Text style={styles.courtLabel}>COURT {i + 1}</Text>
            <View style={styles.courtSides}>
              <Text style={styles.pair}>{court.aNames.join(" & ")}</Text>
              {court.status === "complete" && court.score ? (
                <Text style={styles.finalScore}>
                  {court.score.a}–{court.score.b}
                </Text>
              ) : (
                <Text style={styles.vs}>vs</Text>
              )}
              <Text style={[styles.pair, styles.pairRight]}>{court.bNames.join(" & ")}</Text>
            </View>
            <Text style={styles.courtNote}>
              {court.status === "complete" ? "Done" : "Resume scoring"}
            </Text>
          </Pressable>
        ))}
        {props.restingNames.length > 0 ? (
          <Text style={styles.copy}>Resting: {props.restingNames.join(", ")}</Text>
        ) : null}
        {props.scorerName ? (
          <Text style={styles.scorer}>{props.scorerName} holds the phone</Text>
        ) : null}
        <Button
          label="Next round"
          variant={props.demoted ? "quiet" : "primary"}
          busy={props.busy}
          busyLabel="Dealing…"
          disabled={props.demoted}
          onPress={props.onNextRound}
        />
        {props.actionError ? (
          <ErrorNote>That did not go through. Try again.</ErrorNote>
        ) : null}
      </Card>
      {props.standings.length > 0 ? (
        <Card testID="round-standings">
          <Text style={styles.title}>Tonight</Text>
          {props.standings.map((row) => (
            <View key={row.id} style={styles.standingRow}>
              <Text style={styles.standingName}>{row.name}</Text>
              <Text style={styles.standingPoints}>{row.points}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  court: {
    boxShadow: [...shadow.ring],
    borderRadius: radius.control,
    padding: space.md,
    gap: space.xs,
    backgroundColor: color.fog1,
  },
  courtSides: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  pair: { fontFamily: font.body, fontSize: size.body, color: color.ink, flexShrink: 1 },
  pairRight: { textAlign: "right" },
  vs: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  // the score is the hero wherever it appears
  finalScore: { fontFamily: font.body, fontSize: size.body, color: color.ink, fontVariant: ["tabular-nums"] },
  courtLabel: { fontFamily: font.body, fontSize: size.label, color: color.ink3, letterSpacing: 2 },
  courtNote: { fontFamily: font.body, fontSize: size.label, color: color.court },
  scorer: {
    fontSize: size.label,
    color: color.courtDeep,
    backgroundColor: color.courtWash,
    borderRadius: radius.control,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  standingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    maxWidth: layout.column,
  },
  standingName: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  standingPoints: { fontFamily: font.body, fontSize: size.body, color: color.ink, fontVariant: ["tabular-nums"] },
});
