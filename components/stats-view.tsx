// The Stats tab, presentational and pure: the group's season on one page —
// podium, leaderboard, best pairs, highlights. Built to be screenshot
// straight into the group chat, so every row must read at a glance.
import { StyleSheet, Text, View } from "react-native";
import { color, font, size, space, tracking } from "../theme/tokens";
import type { Form } from "../lib/stats";
import { AppBar, Button, Card, Chip, ErrorNote, Screen } from "./ui";

export type BoardRow = {
  playerId: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  winPct: number | null;
  // last 5 results, most recent first
  form: readonly Form[];
};

export type DuoRow = { key: string; names: string; winPct: number | null; games: number };

export type Highlights = {
  mostGames: { name: string; n: number } | null;
  bestDuo: { names: string; winPct: number; games: number } | null;
  hotStreak: { name: string; streak: number } | null;
  biggestWin: { winners: string; losers: string; score: string } | null;
};

export type StatsViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      // null = no group yet; the empty state still teaches
      groupName: string | null;
      board: readonly BoardRow[];
      duos: readonly DuoRow[];
      highlights: Highlights;
      onOpenLog: () => void;
    };

// one sentence per superlative, in the app's voice
export function highlightLines(h: Highlights): { key: string; text: string }[] {
  const lines: { key: string; text: string }[] = [];
  if (h.mostGames) lines.push({ key: "games", text: `Most games: ${h.mostGames.name}, ${h.mostGames.n}.` });
  if (h.bestDuo)
    lines.push({ key: "duo", text: `Best pair: ${h.bestDuo.names}, ${h.bestDuo.winPct}% of ${h.bestDuo.games}.` });
  if (h.hotStreak)
    lines.push({ key: "streak", text: `Hottest streak: W${h.hotStreak.streak}, ${h.hotStreak.name}.` });
  if (h.biggestWin)
    lines.push({
      key: "win",
      text: `Biggest win: ${h.biggestWin.score}, ${h.biggestWin.winners} over ${h.biggestWin.losers}.`,
    });
  return lines;
}

const MEDALS = ["Gold", "Silver", "Bronze"] as const;

function PodiumSpot({ row, place }: { row: BoardRow; place: 1 | 2 | 3 }) {
  const first = place === 1;
  return (
    <View style={[styles.spot, !first && styles.spotSide]}>
      <Chip label={MEDALS[place - 1]} active={first} />
      <Text style={first ? styles.spotNameFirst : styles.spotName} numberOfLines={1}>
        {row.name}
      </Text>
      <Text style={first ? styles.spotRatingFirst : styles.spotRating}>{row.rating}</Text>
    </View>
  );
}

function FormDots({ form }: { form: readonly Form[] }) {
  return (
    <View style={styles.formCell}>
      {form.map((f, i) => (
        <View
          key={i}
          style={[styles.formDot, f === "w" ? styles.dotW : f === "l" ? styles.dotL : styles.dotD]}
        />
      ))}
    </View>
  );
}

export default function StatsView(props: StatsViewProps) {
  if (props.kind === "loading") {
    return (
      <Screen testID="stats-screen">
        <AppBar title="Stats" />
        <Text style={styles.quiet}>Fetching the season…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen testID="stats-screen">
        <AppBar title="Stats" />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  const { board, duos } = props;
  const lines = highlightLines(props.highlights);
  // centre the winner: #2 · #1 · #3
  const podium = [board[1], board[0], board[2]].filter(Boolean) as BoardRow[];

  if (board.length === 0) {
    return (
      <Screen testID="stats-screen">
        <AppBar title="Stats" sub={props.groupName ?? undefined} />
        <Card>
          <Text style={styles.title}>This season</Text>
          <Text style={styles.copy}>Play a night and this page writes itself.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen testID="stats-screen">
      <AppBar title="Stats" sub={props.groupName ?? undefined} />
      <Card testID="podium-card">
        <Text style={styles.title}>Podium</Text>
        <View style={styles.podium}>
          {podium.map((row) => (
            <PodiumSpot key={row.playerId} row={row} place={(board.indexOf(row) + 1) as 1 | 2 | 3} />
          ))}
        </View>
      </Card>
      <Card testID="leaderboard-card">
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.boardRow}>
          <Text style={[styles.headLabel, styles.rankCell]}>#</Text>
          <Text style={[styles.headLabel, styles.nameCell]}>Player</Text>
          <View style={styles.formCell} />
          <Text style={[styles.headLabel, styles.wlCell]}>W-L</Text>
          <Text style={[styles.headLabel, styles.pctCell]}>Win</Text>
          <Text style={[styles.headLabel, styles.ratingCell]}>Rtg</Text>
        </View>
        {board.map((r, i) => (
          <View key={r.playerId} style={[styles.boardRow, styles.boardRowLine]} testID={`board-row-${r.playerId}`}>
            <Text style={[styles.rank, styles.rankCell]}>{i + 1}</Text>
            <Text style={[styles.playerName, styles.nameCell]} numberOfLines={1}>
              {r.name}
            </Text>
            <FormDots form={r.form} />
            <Text style={[styles.wl, styles.wlCell]}>{`${r.wins}-${r.losses}`}</Text>
            <Text style={[styles.pct, styles.pctCell]}>
              {r.winPct === null ? "–" : `${r.winPct}%`}
            </Text>
            <Text style={[styles.ratingFig, styles.ratingCell]}>{r.rating}</Text>
          </View>
        ))}
      </Card>
      <Card testID="duos-card">
        <Text style={styles.title}>Best pairs</Text>
        {duos.length === 0 ? (
          <Text style={styles.copy}>Two games together make a pair. None yet.</Text>
        ) : (
          duos.slice(0, 5).map((d) => (
            <View key={d.key} style={styles.duoRow}>
              <View style={styles.duoHead}>
                <Text style={styles.duoNames} numberOfLines={1}>
                  {d.names}
                </Text>
                <Text style={styles.duoFigure}>
                  {d.winPct === null ? "–" : `${d.winPct}%`} · {d.games} games
                </Text>
              </View>
              <View style={styles.duoTrack}>
                <View style={[styles.duoBar, { width: `${d.winPct ?? 0}%` }]} />
              </View>
            </View>
          ))
        )}
      </Card>
      {lines.length > 0 ? (
        <Card testID="highlights-card">
          <Text style={styles.title}>Highlights</Text>
          {lines.map((l) => (
            <Text key={l.key} style={styles.copy}>
              {l.text}
            </Text>
          ))}
        </Card>
      ) : null}
      <Button label="Open the game log" variant="quiet" onPress={props.onOpenLog} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingTop: space.sm,
  },
  spot: { alignItems: "center", gap: space.xs, flexShrink: 1 },
  spotSide: { paddingBottom: 2 },
  spotNameFirst: {
    fontFamily: font.display,
    fontSize: 15,
    color: color.ink,
    letterSpacing: 15 * tracking.display,
    marginTop: space.xs,
  },
  spotName: { fontFamily: font.bold, fontSize: 13, color: color.ink2, marginTop: space.xs },
  spotRatingFirst: {
    fontFamily: font.monoBold,
    fontSize: 30,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  spotRating: {
    fontFamily: font.monoBold,
    fontSize: 19,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  boardRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  boardRowLine: { borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.sm },
  headLabel: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  rankCell: { width: 16 },
  nameCell: { flex: 1, flexShrink: 1 },
  wlCell: { width: 34, textAlign: "right" },
  pctCell: { width: 36, textAlign: "right" },
  ratingCell: { width: 38, textAlign: "right" },
  rank: { fontFamily: font.mono, fontSize: 12.5, color: color.ink3, fontVariant: ["tabular-nums"] },
  playerName: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  formCell: { flexDirection: "row", gap: 2, width: 43 },
  formDot: { width: 7, height: 7, borderRadius: 2 },
  dotW: { backgroundColor: color.court },
  dotL: { backgroundColor: color.inkWash2 },
  dotD: { backgroundColor: color.line },
  wl: { fontFamily: font.mono, fontSize: 12.5, color: color.ink2, fontVariant: ["tabular-nums"] },
  pct: { fontFamily: font.monoBold, fontSize: 12.5, color: color.ink, fontVariant: ["tabular-nums"] },
  ratingFig: { fontFamily: font.monoBold, fontSize: 13, color: color.ink, fontVariant: ["tabular-nums"] },
  duoRow: { gap: space.xs },
  duoHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  duoNames: { flex: 1, fontFamily: font.bold, fontSize: 13.5, color: color.ink },
  duoFigure: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  duoTrack: { height: 5, borderRadius: 3, backgroundColor: color.courtWash, overflow: "hidden" },
  duoBar: { height: 5, borderRadius: 3, backgroundColor: color.court },
});
