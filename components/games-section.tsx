// The Games section controller: say a result any time, then the group's
// completed games in a chosen window, grouped by day, newest first. Recent
// games can be removed (voice makes mistakes) by whoever logged them or a
// captain; the players' ladders rebuild on the spot.
import { useCallback, useRef, useState } from "react";
import { router } from "expo-router";
import type { MatchState } from "@shuttle/score";
import GamesView, { type GameRow } from "./games-view";
import VoiceLog from "./voice-log";
import { cutoffFor, groupByDay, type LogWindow } from "../lib/gamelog";
import { deleteMatch } from "../lib/scoring";
import { canCaptain, listGroupMembers, type Group, type Member } from "../lib/session";
import { supabase } from "../lib/supabase";
import { useLive } from "../lib/use-live";
import { Button } from "./ui";

const CAP = 300;
const UNDO_HOURS = 48;

type Fetched = {
  id: string;
  created_at: string;
  created_by: string;
  snapshot: MatchState | null;
  match_participants: { player_id: string; side: "a" | "b" }[];
};

export default function GamesSection({ group, selfId }: { group: Group; selfId: string }) {
  const [window, setWindow] = useState<LogWindow>("week");
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        days: { label: string; rows: GameRow[] }[];
        total: number;
        capped: boolean;
        members: Member[];
        removable: Map<string, string[]>;
      }
  >({ kind: "loading" });
  const [removeBusy, setRemoveBusy] = useState(false);
  // polls and the undo's reload overlap; only the newest fetch may paint,
  // or a pre-delete fetch resurrects the removed row
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const members = await listGroupMembers(group.id);
      const name = (id: string) => members.find((m: Member) => m.id === id)?.name ?? "Player";
      const captain = canCaptain(group, selfId, members);
      let query = supabase
        .from("matches")
        .select("id, created_at, created_by, snapshot, match_participants(player_id, side)")
        .eq("group_id", group.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(CAP);
      const cutoff = cutoffFor(window, new Date());
      if (cutoff) query = query.gte("created_at", cutoff.toISOString());
      const res = await query;
      if (res.error) throw res.error;
      const removable = new Map<string, string[]>();
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
          const fresh =
            Date.now() - new Date(m.created_at).getTime() < UNDO_HOURS * 3600 * 1000;
          if (fresh && (captain || m.created_by === selfId)) {
            removable.set(m.id, m.match_participants.map((p) => p.player_id));
          }
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
      if (seq !== loadSeq.current) return;
      setState({
        kind: "ready",
        days: groupByDay(rows, new Date()),
        total: rows.length,
        capped: rows.length === CAP,
        members,
        removable,
      });
    } catch {
      if (seq === loadSeq.current) setState({ kind: "error" });
    }
  }, [group, selfId, window]);

  // focus, not mount: a result logged through the pushed quick-log screen
  // must appear the moment the section regains focus
  useLive(load);

  if (state.kind === "loading") return <GamesView kind="loading" />;
  if (state.kind === "error") return <GamesView kind="error" onRetry={load} />;

  return (
    <>
      <VoiceLog members={state.members} groupId={group.id} onLogged={load} />
      <Button
        label="Enter a result"
        variant="quiet"
        onPress={() => router.push(`/quick-log?group=${group.id}`)}
      />
      <Button
        label="Paste a whole night"
        variant="quiet"
        onPress={() => router.push(`/bulk-log?group=${group.id}`)}
      />
      <GamesView
        kind="ready"
        window={window}
        onWindow={setWindow}
        days={state.days}
        total={state.total}
        capped={state.capped}
        removableIds={new Set(state.removable.keys())}
        removeBusy={removeBusy}
        onRemove={async (matchId) => {
          const participants = state.removable.get(matchId);
          if (!participants) return;
          setRemoveBusy(true);
          try {
            await deleteMatch(matchId, group.id, participants);
            await load();
          } catch {
            // load() shows the error surface on the next paint; the row
            // simply stays if the delete was refused
            await load();
          } finally {
            setRemoveBusy(false);
          }
        }}
      />
    </>
  );
}
