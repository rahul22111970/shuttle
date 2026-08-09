// The game-log controller: the active group's completed games in a chosen
// window, grouped by day, newest first. Reached from Stats.
import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import type { MatchState } from "@shuttle/score";
import GamesView, { type GameRow } from "../components/games-view";
import { useAuth } from "../lib/auth";
import { cutoffFor, groupByDay, type LogWindow } from "../lib/gamelog";
import { pickActive } from "../lib/groups";
import { listGroupMembers, listGroups, type Member } from "../lib/session";
import { supabase } from "../lib/supabase";

const CAP = 300;

type Fetched = {
  id: string;
  created_at: string;
  snapshot: MatchState | null;
  match_participants: { player_id: string; side: "a" | "b" }[];
};

export default function Games() {
  const { session } = useAuth();
  const selfId = session?.user.id ?? "";
  const [window, setWindow] = useState<LogWindow>("week");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; days: { label: string; rows: GameRow[] }[]; total: number; capped: boolean }
  >({ kind: "loading" });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/compete"));

  const load = useCallback(async () => {
    try {
      const group = pickActive(await listGroups());
      if (!group) {
        setState({ kind: "ready", days: [], total: 0, capped: false });
        return;
      }
      const members = await listGroupMembers(group.id);
      const name = (id: string) => members.find((m: Member) => m.id === id)?.name ?? "Player";
      let query = supabase
        .from("matches")
        .select("id, created_at, snapshot, match_participants(player_id, side)")
        .eq("group_id", group.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(CAP);
      const cutoff = cutoffFor(window, new Date());
      if (cutoff) query = query.gte("created_at", cutoff.toISOString());
      const res = await query;
      if (res.error) throw res.error;
      const rows = ((res.data ?? []) as unknown as Fetched[])
        .filter((m) => m.snapshot)
        .map((m) => {
          const snap = m.snapshot as MatchState;
          const sideNames = (side: "a" | "b") => {
            const list = m.match_participants
              .filter((p) => p.side === side)
              .map((p) => name(p.player_id));
            return list.length > 0 ? list.join(" & ") : `Side ${side.toUpperCase()}`;
          };
          const a = sideNames("a");
          const b = sideNames("b");
          const winner = snap.winner;
          const games = snap.games.length > 0 ? snap.games : [snap.score];
          const score = (winner === "b" ? games.map((g) => `${g.b}–${g.a}`) : games.map((g) => `${g.a}–${g.b}`)).join(" · ");
          const selfSide = m.match_participants.find((p) => p.player_id === selfId)?.side ?? null;
          return {
            id: m.id,
            created_at: m.created_at,
            line: winner === null ? `${a} · ${b}` : winner === "a" ? `${a} d. ${b}` : `${b} d. ${a}`,
            score,
            when: new Date(m.created_at).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            }),
            self: selfSide === null || winner === null ? null : selfSide === winner ? ("w" as const) : ("l" as const),
          };
        });
      setState({
        kind: "ready",
        days: groupByDay(rows, new Date()),
        total: rows.length,
        capped: rows.length === CAP,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [selfId, window]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") return <GamesView kind="loading" />;
  if (state.kind === "error") return <GamesView kind="error" onRetry={load} />;

  return (
    <GamesView
      kind="ready"
      window={window}
      onWindow={setWindow}
      days={state.days}
      total={state.total}
      capped={state.capped}
      onBack={back}
    />
  );
}
