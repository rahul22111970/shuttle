// The quick-log controller: members recent-first (self pinned to side A),
// final score, one write via lib/scoring.quickLog, then back to Today where
// the feed shows the game.
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import QuickLogView, { logLabelFor, type PickRow } from "../components/quick-log-view";
import { foley } from "../lib/foley";
import { useAuth } from "../lib/auth";
import { quickLog, type Participant } from "../lib/scoring";
import { pickActive } from "../lib/groups";
import { defaultMatch, type Sport } from "../lib/sport";
import {
  groupSport,
  listGroupMembers,
  listGroups,
  nextSession,
  type Member,
} from "../lib/session";
import { supabase } from "../lib/supabase";

const backToToday = () =>
  router.canGoBack() ? router.back() : router.replace("/groups");

export default function QuickLog() {
  const { group: groupParam, session: sessionParam } = useLocalSearchParams<{
    group?: string;
    session?: string;
  }>();
  const { session: authSession } = useAuth();
  const selfId = authSession?.user.id ?? "";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "no-group" }
    | {
        kind: "ready";
        groupId: string;
        sport: Sport;
        liveSessionId: string | null;
        players: PickRow[];
      }
  >({ kind: "loading" });
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    try {
      const group = groupParam
        ? { id: groupParam }
        : pickActive(await listGroups());
      if (!group) {
        setState({ kind: "no-group" });
        return;
      }
      const [members, recent, sess, sport] = await Promise.all([
        listGroupMembers(group.id),
        supabase
          .from("matches")
          .select("match_participants(player_id)")
          .eq("group_id", group.id)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(10),
        sessionParam ? Promise.resolve(null) : nextSession(group.id),
        groupSport(group.id),
      ]);
      if (recent.error) throw recent.error;
      // recency rank: first appearance across the latest matches wins
      const rank = new Map<string, number>();
      (recent.data ?? [])
        .flatMap((m) => m.match_participants as { player_id: string }[])
        .forEach((p) => {
          if (!rank.has(p.player_id)) rank.set(p.player_id, rank.size);
        });
      const order = (m: Member) =>
        m.id === selfId ? -1 : rank.get(m.id) ?? rank.size + 1;
      const players = [...members]
        .sort((x, y) => order(x) - order(y))
        .map((m) => ({
          id: m.id,
          name: m.name,
          side: m.id === selfId ? ("a" as const) : ("none" as const),
        }));
      foley.use(sport);
      setState({
        kind: "ready",
        groupId: group.id,
        sport,
        liveSessionId: sess && sess.status === "live" ? sess.id : null,
        players,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [selfId, groupParam]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") return <QuickLogView kind="loading" />;
  if (state.kind === "error") return <QuickLogView kind="error" onRetry={load} />;
  if (state.kind === "no-group") return <QuickLogView kind="no-group" onBack={backToToday} />;

  const logLabel = logLabelFor(state.players, scoreA, scoreB);

  return (
    <QuickLogView
      kind="ready"
      onBack={backToToday}
      onBulk={() =>
        router.push(
          groupParam
            ? `/bulk-log?group=${groupParam}${sessionParam ? `&session=${sessionParam}` : ""}`
            : "/bulk-log"
        )
      }
      players={state.players}
      scoreA={scoreA}
      scoreB={scoreB}
      busy={busy}
      actionError={actionError}
      logLabel={logLabel}
      onCycle={(id) =>
        setState({
          ...state,
          players: state.players.map((p) =>
            p.id === id
              ? { ...p, side: p.side === "none" ? "a" : p.side === "a" ? "b" : "none" }
              : p
          ),
        })
      }
      onScoreA={setScoreA}
      onScoreB={setScoreB}
      onLog={async () => {
        if (busy || !logLabel) return;
        setBusy(true);
        setActionError(false);
        try {
          const participants: Participant[] = state.players
            .filter((p) => p.side !== "none")
            .map((p) => ({ player_id: p.id, side: p.side as "a" | "b" }));
          await quickLog(
            state.groupId,
            // the seating decides the format, same rule the live scorer uses
            defaultMatch(state.sport, participants.length === 4),
            participants,
            { a: Number(scoreA), b: Number(scoreB) },
            sessionParam || state.liveSessionId || undefined
          );
          foley.drive();
          // back to the Today scene we came from (its focus effect refetches);
          // replacing minted an orphan scene over the tab navigator
          backToToday();
        } catch {
          setActionError(true);
          setBusy(false);
        }
      }}
    />
  );
}
