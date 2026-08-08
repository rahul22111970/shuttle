import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import type { MatchState } from "@shuttle/score";
import TodayView, { type FeedRow } from "../../components/today-view";
import { useAuth } from "../../lib/auth";
import { groupBalances } from "../../lib/ledger";
import {
  getRoster,
  listGroupMembers,
  listGroups,
  nextSession,
  rsvpIn,
  type Member,
} from "../../lib/session";
import { supabase } from "../../lib/supabase";

type FeedSource = {
  id: string;
  created_at: string;
  snapshot: MatchState | null;
  match_participants: { player_id: string; side: "a" | "b" }[];
};

function scoreLine(snapshot: MatchState): string {
  return snapshot.games.length > 0
    ? snapshot.games.map((g) => `${g.a}–${g.b}`).join(" · ")
    : `${snapshot.score.a}–${snapshot.score.b}`;
}

function sideLabel(
  rows: FeedSource["match_participants"],
  side: "a" | "b",
  name: (id: string) => string
): string {
  const names = rows.filter((p) => p.side === side).map((p) => name(p.player_id));
  return names.length > 0 ? names.join(" & ") : `Side ${side.toUpperCase()}`;
}

export default function Today() {
  const { session: authSession } = useAuth();
  const selfId = authSession?.user.id ?? "";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        hasGroup: boolean;
        sessionLine: { dateLabel: string; live: boolean; selfIn: boolean } | null;
        sessionId: string | null;
        balancePaise: number | null;
        feed: FeedRow[];
      }
  >({ kind: "loading" });
  const [busyRsvp, setBusyRsvp] = useState(false);
  const [actionError, setActionError] = useState(false);
  // focus and RSVP both trigger loads; only the newest may paint
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const paint = (next: Parameters<typeof setState>[0]) => {
      if (seq === loadSeq.current) setState(next);
    };
    try {
      const groups = await listGroups();
      const group = groups[0] ?? null;
      if (!group) {
        paint({
          kind: "ready",
          hasGroup: false,
          sessionLine: null,
          sessionId: null,
          balancePaise: null,
          feed: [],
        });
        return;
      }
      const [session, members, balances] = await Promise.all([
        nextSession(group.id),
        listGroupMembers(group.id),
        groupBalances(group.id),
      ]);
      const name = (id: string) =>
        members.find((m: Member) => m.id === id)?.name ?? "Player";

      let sessionLine = null;
      if (session) {
        const roster = await getRoster(session.id);
        sessionLine = {
          dateLabel: new Date(session.starts_at).toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
          live: session.status === "live",
          selfIn: roster.attending.includes(selfId),
        };
      }

      const { data, error } = await supabase
        .from("matches")
        .select("id, created_at, snapshot, match_participants(player_id, side)")
        .eq("group_id", group.id)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      const feed: FeedRow[] = ((data ?? []) as unknown as FeedSource[])
        .filter((m) => m.snapshot)
        .map((m) => ({
          id: m.id,
          aLabel: sideLabel(m.match_participants, "a", name),
          bLabel: sideLabel(m.match_participants, "b", name),
          scoreLine: scoreLine(m.snapshot as MatchState),
          whenLabel: new Date(m.created_at).toLocaleString(undefined, {
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
        }));

      paint({
        kind: "ready",
        hasGroup: true,
        sessionLine,
        sessionId: session?.id ?? null,
        balancePaise: balances.perPlayer[selfId] ?? 0,
        feed,
      });
    } catch {
      paint({ kind: "error" });
    }
  }, [selfId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (state.kind === "loading") return <TodayView kind="loading" />;
  if (state.kind === "error") return <TodayView kind="error" onRetry={load} />;

  return (
    <TodayView
      kind="ready"
      hasGroup={state.hasGroup}
      sessionLine={state.sessionLine}
      balancePaise={state.balancePaise}
      feed={state.feed}
      busyRsvp={busyRsvp}
      actionError={actionError}
      onOpenSession={() => router.push("/session")}
      onRsvpIn={async () => {
        if (!state.sessionId) return;
        setBusyRsvp(true);
        setActionError(false);
        try {
          await rsvpIn(state.sessionId);
          await load();
        } catch {
          setActionError(true);
        } finally {
          setBusyRsvp(false);
        }
      }}
      onLogGame={() => router.push("/quick-log")}
    />
  );
}
