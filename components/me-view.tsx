// The Me tab, presentational and pure. The player's name up top, the
// form card (win % hero, streak, last-10 dots), partner chemistry bars,
// recent games in the feed idiom, sign out at the bottom.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { INITIAL_RATING } from "@shuttle/rating";
import { color, font, layout, size, space, tracking } from "../theme/tokens";
import type { Form } from "../lib/stats";
import type { ThemeChoice } from "../lib/theme";
import { AppBar, Button, Card, Chip, ErrorNote, Screen } from "./ui";
import Avatar from "./avatar";
import { AVATAR_PRESETS } from "../lib/avatar";

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

export type GroupRating = {
  groupId: string;
  name: string;
  current: number;
  provisional: boolean;
  // rating_after series, oldest first
  series: readonly number[];
};

// Me is GLOBAL: every group's ladder, plus one blended headline
// (games-weighted mean) when there is more than one
export type RatingLine = {
  blended: number;
  groups: readonly GroupRating[];
};

export type AdminGroupRow = {
  id: string;
  name: string;
  captain: string;
  players: number;
  roster: string;
  games: number;
  lastGame: string | null;
};

export type MeViewProps =
  | { kind: "loading"; name: string }
  | { kind: "error"; name: string; onRetry: () => void }
  | {
      kind: "ready";
      name: string;
      detail: string;
      // 'preset:<key>' | 'photo:<path>' | null
      avatar: string | null;
      avatarBusy: boolean;
      avatarError: string | null;
      onPickPreset: (key: string) => void;
      onUploadPhoto: () => void;
      rating: RatingLine;
      winPct: number | null;
      streak: number;
      lastTen: readonly Form[];
      chemistry: readonly ChemistryRow[];
      recent: readonly MeFeedRow[];
      // the choice only changes web today; native ships light until EAS dark
      themeChoice: ThemeChoice;
      onTheme: (c: ThemeChoice) => void;
      onSignOut: () => void;
      onOpenMath: () => void;
      // pilot-only captain tools; empty hides the card entirely. Only
      // groups the player OWNS: co-captains never see the wipe.
      captainGroups: readonly { id: string; name: string }[];
      // pilot-only app-wide oversight; null hides the card entirely
      adminGroups: readonly AdminGroupRow[] | null;
      wiping: boolean;
      wipeDone: boolean;
      wipeError: boolean;
      onWipe: (groupId: string) => void;
    };

// the sparkline as pure Views: one thin bar per rated game, height
// normalised to the series range, most recent bar in full court green
function Spark({ series }: { series: readonly number[] }) {
  const shown = series.slice(-20);
  const lo = Math.min(...shown);
  const hi = Math.max(...shown);
  const span = Math.max(1, hi - lo);
  return (
    <View style={styles.spark} testID="rating-spark">
      {shown.map((r, i) => (
        <View
          key={i}
          style={[
            styles.sparkBar,
            { height: 8 + Math.round(((r - lo) / span) * 32) },
            i === shown.length - 1 && styles.sparkBarNow,
          ]}
        />
      ))}
    </View>
  );
}

const streakLabel = (streak: number) =>
  streak === 0 ? null : streak > 0 ? `W${streak}` : `L${-streak}`;

export default function MeView(props: MeViewProps) {
  // two-tap confirm for the captain wipe; the second label restates the
  // destruction. Armed per group id, since an owner can hold several.
  const [wipeArmed, setWipeArmed] = useState<string | null>(null);

  if (props.kind === "loading") {
    return (
      <Screen>
        <AppBar title={props.name} />
        <Text style={styles.quiet}>Fetching your games…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen>
        <AppBar title={props.name} />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  const streak = streakLabel(props.streak);

  return (
    <Screen testID="me-screen">
      <AppBar title={props.name} sub={props.detail} />
      <Card testID="look-card">
        <Text style={styles.title}>Your look</Text>
        <View style={styles.lookRow}>
          <Avatar name={props.name} avatar={props.avatar} size={56} />
          <Text style={[styles.quiet, styles.lookHint]}>How the group sees you. Pick one, or use a photo.</Text>
        </View>
        <View style={styles.presetWrap}>
          {AVATAR_PRESETS.map((p) => {
            const active = props.avatar === `preset:${p.key}`;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="button"
                accessibilityLabel={`Avatar ${p.key}`}
                accessibilityState={{ selected: active }}
                disabled={props.avatarBusy}
                onPress={() => props.onPickPreset(p.key)}
                style={[styles.presetRing, active && styles.presetRingOn]}
              >
                <Avatar name={props.name} avatar={`preset:${p.key}`} size={40} decorative />
              </Pressable>
            );
          })}
        </View>
        <Button
          label="Upload a photo"
          variant="quiet"
          busy={props.avatarBusy}
          busyLabel="Saving…"
          onPress={props.onUploadPhoto}
        />
        {props.avatarError ? <ErrorNote>{props.avatarError}</ErrorNote> : null}
      </Card>
      <Card testID="rating-card">
        <Text style={styles.title}>Rating</Text>
        <View style={styles.formRow}>
          <View style={styles.stat}>
            <Text style={styles.ratingHero}>{props.rating.blended}</Text>
            <Text style={styles.statLabel}>
              {props.rating.groups.length > 1
                ? `Blended · ${props.rating.groups.length} groups`
                : props.rating.groups.length === 1 && !props.rating.groups[0].provisional
                  ? "Established"
                  : "Finding your level"}
            </Text>
          </View>
          {props.rating.groups.length === 1 && props.rating.groups[0].series.length >= 2 ? (
            <Spark series={props.rating.groups[0].series} />
          ) : props.rating.groups.length === 0 ? (
            <Text style={styles.quiet}>
              {`Every player starts at ${INITIAL_RATING}. Your line begins with your first game.`}
            </Text>
          ) : null}
        </View>
        {props.rating.groups.length > 1
          ? props.rating.groups.map((g) => (
              <View key={g.groupId} style={styles.groupRatingRow}>
                <Text style={styles.groupRatingName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.quiet}>
                  {g.provisional ? "Finding your level" : "Established"}
                </Text>
                <Text style={styles.groupRatingFig}>{g.current}</Text>
              </View>
            ))
          : null}
        <Button label="How the rating works" variant="quiet" onPress={props.onOpenMath} />
      </Card>
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
      {props.captainGroups.length > 0 ? (
        <Card testID="captain-tools">
          <Text style={styles.title}>Captain tools</Text>
          <Text style={styles.quiet}>Pilot-only. This tool leaves before the app store.</Text>
          {props.captainGroups.map((g) => (
            <Button
              key={g.id}
              label={
                wipeArmed === g.id
                  ? `Wipe ${g.name}'s games and money · tap again`
                  : `Wipe ${g.name}'s games and money`
              }
              variant="quiet"
              tone="cork"
              busy={props.wiping}
              busyLabel="Wiping…"
              onPress={() => {
                if (wipeArmed === g.id) {
                  setWipeArmed(null);
                  props.onWipe(g.id);
                } else {
                  setWipeArmed(g.id);
                }
              }}
            />
          ))}
          {props.wipeDone ? <Text style={styles.wipeDone}>Wiped. Fresh night.</Text> : null}
          {props.wipeError ? (
            <ErrorNote>The wipe failed partway. Tell the builder.</ErrorNote>
          ) : null}
        </Card>
      ) : null}
      {props.adminGroups ? (
        <Card testID="admin-overview">
          <Text style={styles.title}>Every group · admin</Text>
          <Text style={styles.quiet}>Pilot-only. Only you see this.</Text>
          {props.adminGroups.map((g) => (
            <View key={g.id} style={styles.adminRow}>
              <View style={styles.adminHead}>
                <Text style={styles.adminName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={styles.adminFigure}>
                  {g.players} {g.players === 1 ? "player" : "players"} · {g.games}{" "}
                  {g.games === 1 ? "game" : "games"}
                </Text>
              </View>
              <Text style={styles.quiet} numberOfLines={2}>
                {`${g.captain} runs it · ${g.roster}`}
              </Text>
              {g.lastGame ? (
                <Text style={styles.quiet}>
                  {`Last game ${new Date(g.lastGame).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}`}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <Text style={styles.title}>Appearance</Text>
        <View style={styles.themeRow}>
          {(["auto", "light", "dark"] as const).map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityState={{ selected: props.themeChoice === c }}
              onPress={() => props.onTheme(c)}
            >
              <Chip
                label={c.charAt(0).toUpperCase() + c.slice(1)}
                active={props.themeChoice === c}
              />
            </Pressable>
          ))}
        </View>
      </Card>
      <Button label="Sign out" variant="quiet" onPress={props.onSignOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  wipeDone: { fontFamily: font.body, fontSize: size.body, color: color.court, textAlign: "center" },
  groupRatingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  groupRatingName: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  groupRatingFig: {
    fontFamily: font.monoBold,
    fontSize: 16,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  adminRow: { gap: 2, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.sm },
  adminHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  adminName: { flex: 1, fontFamily: font.bold, fontSize: 13.5, color: color.ink },
  adminFigure: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  formRow: { flexDirection: "row", gap: space.xl },
  stat: { gap: 2 },
  statNumber: {
    fontFamily: font.monoBold,
    fontSize: 34,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  ratingHero: {
    fontFamily: font.monoBold,
    fontSize: 30,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  spark: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 3, minHeight: 40 },
  sparkBar: { width: 6, flexShrink: 1, borderRadius: 2, backgroundColor: color.courtWash },
  sparkBarNow: { backgroundColor: color.court },
  streakW: { color: color.court },
  streakL: { color: color.cork },
  dotRow: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 13, height: 13, borderRadius: 4 },
  dotW: { backgroundColor: color.court },
  dotL: { backgroundColor: color.inkWash2 },
  dotD: { backgroundColor: color.line },
  lookRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  lookHint: { flex: 1 },
  presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  presetRing: { padding: 2, borderRadius: 24, borderWidth: 2, borderColor: color.card },
  presetRingOn: { borderColor: color.court },
  themeRow: { flexDirection: "row", gap: space.sm },
  chemRow: { gap: space.xs },
  chemHead: { flexDirection: "row", justifyContent: "space-between" },
  chemName: { flex: 1, fontFamily: font.bold, fontSize: 13.5, color: color.ink },
  chemFigure: {
    fontFamily: font.mono,
    fontSize: 12.5,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  chemTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: color.inkWash,
    overflow: "hidden",
  },
  chemBar: { height: 5, borderRadius: 3, backgroundColor: color.court },
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
