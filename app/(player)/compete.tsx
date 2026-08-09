// The Stats controller (the file keeps the compete route name so the tab
// survives): the active group's completed matches, members and rating rows
// in one load; lib/analytics turns them into the season, stats-view draws it.
import { useCallback, useRef, useState } from "react";
import type { MatchState } from "@shuttle/score";
import { router } from "expo-router";
import StatsView, {
  type BoardRow,
  type DuoRow,
  type Highlights,
} from "../../components/stats-view";
import { groupAnalytics, type StatsMatch } from "../../lib/analytics";
import { pickActive } from "../../lib/groups";
import { listGroupMembers, listGroups, type Member } from "../../lib/session";
import { supabase } from "../../lib/supabase";
import { useLive } from "../../lib/use-live";

const NO_HIGHLIGHTS: Highlights = { mostGames: null, bestDuo: null, hotStreak: null, biggestWin: null };

export default function Stats() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; groupName: string | null; board: BoardRow[]; duos: DuoRow[]; highlights: Highlights }
  >({ kind: "loading" });
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const paint = (next: Parameters<typeof setState>[0]) => {
      if (seq === loadSeq.current) setState(next);
    };
    try {
      const group = pickActive(await listGroups());
      if (!group) {
        paint({ kind: "ready", groupName: null, board: [], duos: [], highlights: NO_HIGHLIGHTS });
        return;
      }
      const [members, matchRes] = await Promise.all([
        listGroupMembers(group.id),
        supabase
          .from("matches")
          .select("created_at, snapshot, match_participants(player_id, side)")
          .eq("group_id", group.id)
          .eq("status", "complete")
          .order("created_at", { ascending: false }),
      ]);
      if (matchRes.error) throw matchRes.error;
      const ratingRes = await supabase
        .from("rating_history")
        .select("player_id, rating_after, created_at")
        .eq("group_id", group.id)
        .in("player_id", members.map((m: Member) => m.id));
      if (ratingRes.error) throw ratingRes.error;

      const matches: StatsMatch[] = ((matchRes.data ?? []) as unknown as {
        created_at: string;
        snapshot: MatchState | null;
        match_participants: { player_id: string; side: "a" | "b" }[];
      }[]).map((m) => ({
        created_at: m.created_at,
        snapshot: m.snapshot,
        participants: m.match_participants,
      }));

      const { leaderboard, duos, superlatives } = groupAnalytics(matches, ratingRes.data);
      const name = (id: string) => members.find((m: Member) => m.id === id)?.name ?? "Player";
      const join = (ids: readonly string[]) => ids.map(name).join(" & ");

      paint({
        kind: "ready",
        groupName: group.name,
        board: leaderboard.map((r) => ({
          playerId: r.playerId,
          name: name(r.playerId),
          rating: r.rating,
          wins: r.wins,
          losses: r.losses,
          winPct: r.winPct,
          form: r.form,
        })),
        duos: duos.map((d) => ({
          key: d.ids.join("|"),
          names: join(d.ids),
          winPct: d.winPct,
          games: d.games,
        })),
        highlights: {
          mostGames: superlatives.mostGames
            ? { name: name(superlatives.mostGames.playerId), n: superlatives.mostGames.n }
            : null,
          bestDuo: superlatives.bestDuo
            ? { names: join(superlatives.bestDuo.ids), winPct: superlatives.bestDuo.winPct, games: superlatives.bestDuo.games }
            : null,
          hotStreak: superlatives.hotStreak
            ? { name: name(superlatives.hotStreak.playerId), streak: superlatives.hotStreak.streak }
            : null,
          biggestWin: superlatives.biggestWin
            ? {
                winners: join(superlatives.biggestWin.winnerIds),
                losers: join(superlatives.biggestWin.loserIds),
                score: superlatives.biggestWin.score,
              }
            : null,
        },
      });
    } catch {
      paint({ kind: "error" });
    }
  }, []);

  useLive(load);

  if (state.kind === "loading") return <StatsView kind="loading" />;
  if (state.kind === "error") return <StatsView kind="error" onRetry={load} />;
  return (
    <StatsView
      kind="ready"
      groupName={state.groupName}
      board={state.board}
      duos={state.duos}
      highlights={state.highlights}
      onOpenLog={() => router.push("/games")}
    />
  );
}
