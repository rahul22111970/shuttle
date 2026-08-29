// The Stats section, presentational and pure: the group's season on one
// page — podium, leaderboard, best pairs, highlights. Built to be
// screenshot straight into the group chat, so every row must read at a
// glance. Chrome belongs to the group room that mounts this.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, font, size, space, tracking } from "../theme/tokens";
import type { Form } from "../lib/stats";
import Settle from "./settle";
import Avatar from "./avatar";
import { Heatmap, WeekDelta } from "./charts";
import { Button, Card, Chip, ErrorNote, Skeleton, SKEL } from "./ui";

export type BoardRow = {
  playerId: string;
  name: string;
  avatar: string | null;
  rating: number;
  // rating movement over the last 7 days; null before the first rated game
  weekDelta: number | null;
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
  // live-scored games only; the engine replays the rally sequence
  comeback: { names: string; deficit: number; score: string } | null;
};

export type Heat = {
  weeks: readonly (readonly { date: string; count: number }[])[];
  max: number;
  total: number;
};

export type StatsViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "ready";
      board: readonly BoardRow[];
      duos: readonly DuoRow[];
      highlights: Highlights;
      // the 2-3 auto-surfaced lines the section leads with
      sentences: readonly string[];
      heat: Heat;
      // true when the 300-match window is full: older games are not counted
      capped: boolean;
      onOpenPlayer: (playerId: string) => void;
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
  if (h.comeback)
    lines.push({
      key: "comeback",
      text: `Biggest comeback: ${h.comeback.names}, from ${h.comeback.deficit} down, ${h.comeback.score} (live scored).`,
    });
  return lines;
}

const MEDALS = ["Gold", "Silver", "Bronze"] as const;

function PodiumSpot({ row, place }: { row: BoardRow; place: 1 | 2 | 3 }) {
  const first = place === 1;
  return (
    <View style={[styles.spot, !first && styles.spotSide]}>
      <Avatar name={row.name} avatar={row.avatar} size={first ? 44 : 34} />
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
    return <Skeleton bars={SKEL.rows} />;
  }

  if (props.kind === "error") {
    return (
      <>
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </>
    );
  }

  const { board, duos } = props;
  const lines = highlightLines(props.highlights);
  // centre the winner: #2 · #1 · #3
  const podium = [board[1], board[0], board[2]].filter(Boolean) as BoardRow[];

  if (board.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>This season</Text>
        <Text style={styles.copy}>Play a night and this page writes itself.</Text>
      </Card>
    );
  }

  return (
    <>
      {props.sentences.length > 0 ? (
        <Card testID="pulse-card">
          <Text style={styles.title}>This week</Text>
          {props.sentences.map((s) => (
            <Text key={s} style={styles.copy}>
              {s}
            </Text>
          ))}
        </Card>
      ) : null}
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
          <View style={styles.avatarCell} />
          <Text style={[styles.headLabel, styles.nameCell]}>Player</Text>
          <View style={styles.formCell} />
          <Text style={[styles.headLabel, styles.wlCell]}>W-L</Text>
          <Text style={[styles.headLabel, styles.pctCell]}>Win</Text>
          <Text style={[styles.headLabel, styles.ratingCell]}>Rtg</Text>
        </View>
        {board.map((r, i) => (
          <Settle key={r.playerId} index={i}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${r.name}`}
            style={[styles.boardRow, styles.boardRowLine]}
            testID={`board-row-${r.playerId}`}
            onPress={() => props.onOpenPlayer(r.playerId)}
          >
            <Text style={[styles.rank, styles.rankCell]}>{i + 1}</Text>
            <Avatar name={r.name} avatar={r.avatar} size={22} decorative />
            <Text style={[styles.playerName, styles.nameCell]} numberOfLines={1}>
              {r.name}
            </Text>
            <FormDots form={r.form} />
            <Text style={[styles.wl, styles.wlCell]}>{`${r.wins}-${r.losses}`}</Text>
            <Text style={[styles.pct, styles.pctCell]}>
              {r.winPct === null ? "–" : `${r.winPct}%`}
            </Text>
            <View style={styles.ratingCol}>
              <Text style={styles.ratingFig}>{r.rating}</Text>
              <WeekDelta delta={r.weekDelta} />
            </View>
          </Pressable>
          </Settle>
        ))}
        <Text style={styles.quiet}>
          Movement is the last 7 days. Tap a row for the player's card.
        </Text>
        {props.capped ? (
          <Text style={styles.quiet}>Counting the latest 300 games.</Text>
        ) : null}
      </Card>
      <Card testID="rhythm-card">
        <Text style={styles.title}>Rhythm</Text>
        <Heatmap weeks={props.heat.weeks} max={props.heat.max} />
        <Text style={styles.quiet}>
          {`${props.heat.total} ${props.heat.total === 1 ? "game" : "games"} in the last ${props.heat.weeks.length} weeks.`}
        </Text>
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
    </>
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
  avatarCell: { width: 22 },
  nameCell: { flex: 1, flexShrink: 1 },
  wlCell: { width: 34, textAlign: "right" },
  pctCell: { width: 36, textAlign: "right" },
  ratingCell: { width: 44, textAlign: "right" },
  ratingCol: { width: 44, alignItems: "flex-end", gap: 1 },
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
