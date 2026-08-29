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
      const ratingRes = await supabase
        .from("rating_history")
        .select("group_id, rating_after, created_at, match_id")
        .eq("player_id", id)
        .in("group_id", groups.map((g) => g.id))
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (ratingRes.error) throw ratingRes.error;
      // decay rows move the number but only match rows count as played
      const perGroup = new Map<string, { series: number[]; played: number }>();
      for (const r of ratingRes.data) {
        const g = perGroup.get(r.group_id) ?? { series: [], played: 0 };
        g.series.push(r.rating_after);
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
            current: series[series.length - 1],
            provisional: played < PROVISIONAL_MATCHES,
          };
        });
      const chem = chemistry(played);
      let bestPartner: Data["bestPartner"] = null;
      if (chem.length > 0) {
        const namesRes = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", chem[0].partnerId)
          .single();
        bestPartner = {
          name: namesRes.data?.display_name ?? "Player",
          winPct: chem[0].winPct,
          played: chem[0].played,
        };
      }
      setState({
        kind: "ready",
        data: {
          name: prof.data.display_name,
          games: played.length,
          winPct: winPct(played),
          streak: currentStreak(played),
          lastTen: lastTen(played),
          ratings,
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
        </View>
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
  stat: { gap: 2 },
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
  ratingRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  ratingGroup: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  ratingFig: {
    fontFamily: font.monoBold,
    fontSize: 16,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
});
