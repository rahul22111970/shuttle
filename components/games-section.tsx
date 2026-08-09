// The Games section controller: log a result any time, then the group's
// completed games in a chosen window, grouped by day, newest first. The
// group arrives as a prop.
import { useCallback, useState } from "react";
import { router } from "expo-router";
import type { MatchState } from "@shuttle/score";
import GamesView, { type GameRow } from "./games-view";
import { cutoffFor, groupByDay, type LogWindow } from "../lib/gamelog";
import { listGroupMembers, type Member } from "../lib/session";
import { supabase } from "../lib/supabase";
import { useLive } from "../lib/use-live";
import { Button } from "./ui";

const CAP = 300;

type Fetched = {
  id: string;
  created_at: string;
  snapshot: MatchState | null;
  match_participants: { player_id: string; side: "a" | "b" }[];
};

export default function GamesSection({ groupId, selfId }: { groupId: string; selfId: string }) {
  const [window, setWindow] = useState<LogWindow>("week");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; days: { label: string; rows: GameRow[] }[]; total: number; capped: boolean }
  >({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const members = await listGroupMembers(groupId);
      const name = (id: string) => members.find((m: Member) => m.id === id)?.name ?? "Player";
      let query = supabase
        .from("matches")
        .select("id, created_at, snapshot, match_participants(player_id, side)")
        .eq("group_id", groupId)
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
  }, [groupId, selfId, window]);

  // focus, not mount: a result logged through the pushed quick-log screen
  // must appear the moment the section regains focus
  useLive(load);

  // the doors stay above every state: a finished game gets logged even
  // while the list is still fetching
  const doors = (
    <>
      <Button
        label="Enter a result"
        onPress={() => router.push(`/quick-log?group=${groupId}`)}
      />
      <Button
        label="Paste a whole night"
        variant="quiet"
        onPress={() => router.push(`/bulk-log?group=${groupId}`)}
      />
    </>
  );

  if (state.kind === "loading")
    return (
      <>
        {doors}
        <GamesView kind="loading" />
      </>
    );
  if (state.kind === "error")
    return (
      <>
        {doors}
        <GamesView kind="error" onRetry={load} />
      </>
    );

  return (
    <>
      {doors}
      <GamesView
        kind="ready"
        window={window}
        onWindow={setWindow}
        days={state.days}
        total={state.total}
        capped={state.capped}
      />
    </>
  );
}
