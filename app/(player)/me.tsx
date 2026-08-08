// The Me controller: fetch every match the player took part in across
// groups, resolve names in one profiles query, aggregate with lib/stats.
import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import MeView, {
  type ChemistryRow,
  type MeFeedRow,
  type RatingLine,
} from "../../components/me-view";
import { INITIAL_RATING, PROVISIONAL_MATCHES } from "@shuttle/rating";
import { useAuth } from "../../lib/auth";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../../lib/theme";
import {
  chemistry,
  currentStreak,
  fetchPlayedMatches,
  lastTen,
  winPct,
  type Form,
  type PlayedMatch,
} from "../../lib/stats";
import { supabase } from "../../lib/supabase";

function feedRow(m: PlayedMatch, name: (id: string) => string, selfName: string): MeFeedRow {
  const us = [selfName, ...m.partnerIds.map(name)].join(" & ");
  const them =
    m.opponentIds.length > 0
      ? m.opponentIds.map(name).join(" & ")
      : `Side ${m.side === "a" ? "B" : "A"}`;
  const won = m.winner === m.side;
  const ours = m.games.map((g) => (m.side === "a" ? `${g.a}–${g.b}` : `${g.b}–${g.a}`));
  return {
    id: m.id,
    line: m.winner === null ? `${us} · ${them}` : won ? `${us} d. ${them}` : `${them} d. ${us}`,
    // winner-first scores, so flip ours when they beat us
    score: (won || m.winner === null
      ? ours
      : m.games.map((g) => (m.side === "a" ? `${g.b}–${g.a}` : `${g.a}–${g.b}`))
    ).join(" · "),
    when: new Date(m.createdAt).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    self: m.winner === null ? null : won ? "w" : "l",
  };
}

export default function Me() {
  const { profile, session } = useAuth();
  const selfId = session?.user.id ?? "";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        winPct: number | null;
        streak: number;
        lastTen: Form[];
        chemistry: ChemistryRow[];
        recent: MeFeedRow[];
        rating: RatingLine;
      }
  >({ kind: "loading" });
  const [themeChoice, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const paint = (next: Parameters<typeof setState>[0]) => {
      if (seq === loadSeq.current) setState(next);
    };
    try {
      const [played, ratingRes] = await Promise.all([
        fetchPlayedMatches(selfId),
        supabase
          .from("rating_history")
          .select("rating_after, created_at")
          .eq("player_id", selfId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
      ]);
      if (ratingRes.error) throw ratingRes.error;
      const series = ratingRes.data.map((r) => r.rating_after);
      const ids = [
        ...new Set(played.flatMap((m) => [...m.partnerIds, ...m.opponentIds])),
      ];
      let names = new Map<string, string>();
      if (ids.length > 0) {
        const res = await supabase.from("profiles").select("id, display_name").in("id", ids);
        if (res.error) throw res.error;
        names = new Map(res.data.map((r) => [r.id, r.display_name]));
      }
      const name = (id: string) => names.get(id) ?? "Player";
      paint({
        kind: "ready",
        rating: {
          current: series.length > 0 ? series[series.length - 1] : INITIAL_RATING,
          provisional: series.length < PROVISIONAL_MATCHES,
          series,
        },
        winPct: winPct(played),
        streak: currentStreak(played),
        lastTen: lastTen(played),
        chemistry: chemistry(played).map((c) => ({
          partnerId: c.partnerId,
          name: name(c.partnerId),
          played: c.played,
          winPct: c.winPct,
        })),
        recent: played
          .slice(0, 5)
          .map((m) => feedRow(m, name, profile?.display_name ?? "You")),
      });
    } catch {
      paint({ kind: "error" });
    }
  }, [selfId, profile?.display_name]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!profile) return null; // the layout guard has already redirected
  const heading = profile.display_name;
  const detail = `Player · ${profile.phone ?? "no phone"}`;

  if (state.kind === "loading") return <MeView kind="loading" name={heading} />;
  if (state.kind === "error") return <MeView kind="error" name={heading} onRetry={load} />;

  return (
    <MeView
      kind="ready"
      name={heading}
      detail={detail}
      rating={state.rating}
      winPct={state.winPct}
      streak={state.streak}
      lastTen={state.lastTen}
      chemistry={state.chemistry}
      recent={state.recent}
      themeChoice={themeChoice}
      onTheme={(c) => {
        setThemeChoice(c);
        setTheme(c);
      }}
      onSignOut={() => supabase.auth.signOut()}
      onOpenMath={() => router.push("/rating-math")}
    />
  );
}
