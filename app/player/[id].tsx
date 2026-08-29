// A player's card: simple statistics, no match-by-match detail. Everything
// here is computed from games the VIEWER is allowed to see (shared groups),
// which RLS enforces on its own — the page never widens visibility.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { INITIAL_RATING, PROVISIONAL_MATCHES } from "@shuttle/rating";
import {
  chemistry,
  currentStreak,
  fetchPlayedMatches,
  lastTen,
  winPct,
  type Form,
} from "../../lib/stats";
import { deuceRecord, headToHead } from "../../lib/insights";
import { RatingLine, SplitBar, type LinePoint } from "../../components/charts";
import { listGroups } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { color, font, size, space, tracking } from "../../theme/tokens";
import { BackBar, Button, Card, ErrorNote, Screen } from "../../components/ui";

type GroupRating = { groupId: string; name: string; current: number; provisional: boolean };

type Data = {
  name: string;
  games: number;
  winPct: number | null;
  streak: number;
  lastTen: Form[];
  ratings: GroupRating[];
  // their longest ladder, drawn as the line
  line: { groupName: string; series: LinePoint[]; hasDecay: boolean } | null;
  rivalry: { opponentId: string; name: string; wins: number; losses: number }[];
  deuce: { won: number; lost: number };
  bestPartner: { name: string; winPct: number | null; played: number } | null;
};

const streakLabel = (s: number) => (s === 0 ? "–" : s > 0 ? `W${s}` : `L${-s}`);

export default function PlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: Data }
  >({ kind: "loading" });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/groups"));

  const load = useCallback(async () => {
    try {
      const [prof, played, groups] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", id).single(),
        fetchPlayedMatches(id),
        listGroups(),
      ]);
      if (prof.error) throw prof.error;
      // ponytail: rides the 1000-row PostgREST cap ascending, which would
      // drop the NEWEST rows at ~1000 rated games for one player - page
      // like api/rating-decay.ts if anyone ever gets there
      const ratingRes = await supabase
        .from("rating_history")
        .select("group_id, rating_after, created_at, match_id")
        .eq("player_id", id)
        .in("group_id", groups.map((g) => g.id))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (ratingRes.error) throw ratingRes.error;
      // decay rows move the number but only match rows count as played
      const perGroup = new Map<string, { series: LinePoint[]; played: number }>();
      for (const r of ratingRes.data) {
        const g = perGroup.get(r.group_id) ?? { series: [], played: 0 };
        g.series.push({ value: r.rating_after, decay: r.match_id === null });
        if (r.match_id !== null) g.played += 1;
        perGroup.set(r.group_id, g);
      }
      const ratings: GroupRating[] = groups
        .filter((g) => perGroup.has(g.id))
        .map((g) => {
          const { series, played } = perGroup.get(g.id)!;
          return {
            groupId: g.id,
            name: g.name,
            current: series[series.length - 1].value,
            provisional: played < PROVISIONAL_MATCHES,
          };
        });
      // the line: their longest ladder, decay weeks as hollow dots
      const primary = [...perGroup.entries()].sort(
        (x, y) => y[1].series.length - x[1].series.length
      )[0];
      const line = primary
        ? {
            groupName: groups.find((g) => g.id === primary[0])?.name ?? "Their ladder",
            series: primary[1].series,
            hasDecay: primary[1].series.some((p) => p.decay),
          }
        : null;

      const chem = chemistry(played);
      const rivalry = headToHead(played).slice(0, 6);
      const deuce = deuceRecord(played);
      // every name this card mentions, one query
      const nameIds = [
        ...new Set([...rivalry.map((r) => r.opponentId), ...chem.slice(0, 1).map((c) => c.partnerId)]),
      ];
      let names = new Map<string, string>();
      if (nameIds.length > 0) {
        const res = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", nameIds);
        if (res.error) throw res.error;
        names = new Map(res.data.map((r) => [r.id, r.display_name]));
      }
      const bestPartner: Data["bestPartner"] =
        chem.length > 0
          ? {
              name: names.get(chem[0].partnerId) ?? "Player",
              winPct: chem[0].winPct,
              played: chem[0].played,
            }
          : null;
      setState({
        kind: "ready",
        data: {
          name: prof.data.display_name,
          games: played.length,
          winPct: winPct(played),
          streak: currentStreak(played),
          lastTen: lastTen(played),
          ratings,
          line,
          rivalry: rivalry.map((r) => ({ ...r, name: names.get(r.opponentId) ?? "Player" })),
          deuce,
          bestPartner,
        },
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <Screen testID="player-card">
        <BackBar title="Player" onBack={back} />
        <Text style={styles.quiet}>Fetching their games…</Text>
      </Screen>
    );
  }
  if (state.kind === "error") {
    return (
      <Screen testID="player-card">
        <BackBar title="Player" onBack={back} />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }

  const d = state.data;
  return (
    <Screen testID="player-card">
      <BackBar title={d.name} onBack={back} />
      <Card>
        <Text style={styles.title}>Form</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.figure}>{d.games}</Text>
            <Text style={styles.statLabel}>Games</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.figure}>{d.winPct === null ? "–" : `${d.winPct}%`}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.figure}>{streakLabel(d.streak)}</Text>
            <Text style={styles.statLabel}>Streak</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.figure}>
              {d.deuce.won + d.deuce.lost === 0
                ? "–"
                : `${Math.round((d.deuce.won / (d.deuce.won + d.deuce.lost)) * 100)}%`}
            </Text>
            <Text style={styles.statLabel}>Deuce</Text>
          </View>
        </View>
        {d.deuce.won + d.deuce.lost > 0 ? (
          <Text style={styles.quiet}>
            {`Deuce: ${d.deuce.won}-${d.deuce.lost} in games that got there.`}
          </Text>
        ) : null}
        {d.lastTen.length > 0 ? (
          <View style={styles.dots}>
            {d.lastTen.map((f, i) => (
              <View
                key={i}
                style={[styles.dot, f === "w" ? styles.dotW : f === "l" ? styles.dotL : styles.dotD]}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.quiet}>No games in your shared groups yet.</Text>
        )}
        <Text style={styles.quiet}>Counted from the groups you share.</Text>
      </Card>
      <Card>
        <Text style={styles.title}>Rating</Text>
        {d.line && d.line.series.length >= 2 ? (
          <>
            <RatingLine series={d.line.series} />
            <Text style={styles.quiet}>
              {`${d.line.groupName}, every rated game.${d.line.hasDecay ? " Hollow dots are idle weeks." : ""}`}
            </Text>
          </>
        ) : null}
        {d.ratings.length === 0 ? (
          <Text style={styles.copy}>{`Unrated so far. Everyone starts at ${INITIAL_RATING}.`}</Text>
        ) : (
          d.ratings.map((r) => (
            <View key={r.groupId} style={styles.ratingRow}>
              <Text style={styles.ratingGroup} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.quiet}>
                {r.provisional ? "Finding their level" : "Established"}
              </Text>
              <Text style={styles.ratingFig}>{r.current}</Text>
            </View>
          ))
        )}
      </Card>
      {d.rivalry.length > 0 ? (
        <Card>
          <Text style={styles.title}>Head to head</Text>
          {d.rivalry.map((r) => (
            <View key={r.opponentId} style={styles.h2hRow}>
              <View style={styles.h2hHead}>
                <Text style={styles.ratingGroup} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={styles.h2hRecord}>{`${r.wins}-${r.losses}`}</Text>
              </View>
              <SplitBar wins={r.wins} losses={r.losses} />
            </View>
          ))}
          <Text style={styles.quiet}>Their record against each rival, wins first.</Text>
        </Card>
      ) : null}
      {d.bestPartner ? (
        <Card>
          <Text style={styles.title}>Best partner</Text>
          <View style={styles.ratingRow}>
            <Text style={styles.ratingGroup} numberOfLines={1}>
              {d.bestPartner.name}
            </Text>
            <Text style={styles.quiet}>
              {`${d.bestPartner.winPct === null ? "–" : `${d.bestPartner.winPct}%`} · ${d.bestPartner.played} games`}
            </Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  statRow: { flexDirection: "row", gap: space.xl },
  stat: { gap: 2, flexShrink: 1 },
  figure: {
    fontFamily: font.monoBold,
    fontSize: 28,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  dots: { flexDirection: "row", gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  dotW: { backgroundColor: color.court },
  dotL: { backgroundColor: color.inkWash2 },
  dotD: { backgroundColor: color.line },
  h2hRow: { gap: space.xs },
  h2hHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  h2hRecord: {
    fontFamily: font.monoBold,
    fontSize: 13,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ratingGroup: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  ratingFig: {
    fontFamily: font.monoBold,
    fontSize: 16,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
});
