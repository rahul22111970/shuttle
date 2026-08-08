import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import type { MatchState } from "@shuttle/score";
import TodayView, {
  type FeedRow,
  type RosterChip,
  type WeekStrip,
} from "../../components/today-view";
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function sideNames(
  rows: FeedSource["match_participants"],
  side: "a" | "b",
  name: (id: string) => string
): string {
  const names = rows.filter((p) => p.side === side).map((p) => name(p.player_id));
  return names.length > 0 ? names.join(" & ") : `Side ${side.toUpperCase()}`;
}

// winners first, the way players say it; scores flip to winner-first too
function feedRowFrom(m: FeedSource, selfId: string, name: (id: string) => string): FeedRow {
  const snap = m.snapshot as MatchState;
  const winner = snap.winner;
  const a = sideNames(m.match_participants, "a", name);
  const b = sideNames(m.match_participants, "b", name);
  const games = snap.games.length > 0 ? snap.games : [snap.score];
  const score =
    winner === "b"
      ? games.map((g) => `${g.b}–${g.a}`).join(" · ")
      : games.map((g) => `${g.a}–${g.b}`).join(" · ");
  const selfSide = m.match_participants.find((p) => p.player_id === selfId)?.side ?? null;
  return {
    id: m.id,
    line: winner === null ? `${a} · ${b}` : winner === "a" ? `${a} d. ${b}` : `${b} d. ${a}`,
    score,
    when: new Date(m.created_at).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    self: selfSide === null || winner === null ? null : selfSide === winner ? "w" : "l",
  };
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
        roster: RosterChip[];
        balancePaise: number | null;
        week: WeekStrip;
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
    const emptyWeek: WeekStrip = { sessions: 0, games: 0, winsPct: null };
    try {
      const groups = await listGroups();
      const group = groups[0] ?? null;
      if (!group) {
        paint({
          kind: "ready",
          hasGroup: false,
          sessionLine: null,
          sessionId: null,
          roster: [],
          balancePaise: null,
          week: emptyWeek,
          feed: [],
        });
        return;
      }
      const weekStart = new Date(Date.now() - WEEK_MS).toISOString();
      const [session, members, balances, matchRes, sessionCount] = await Promise.all([
        nextSession(group.id),
        listGroupMembers(group.id),
        groupBalances(group.id),
        supabase
          .from("matches")
          .select("id, created_at, snapshot, match_participants(player_id, side)")
          .eq("group_id", group.id)
          .eq("status", "complete")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("group_id", group.id)
          .neq("status", "planned")
          .gte("starts_at", weekStart),
      ]);
      if (matchRes.error) throw matchRes.error;
      if (sessionCount.error) throw sessionCount.error;
      const name = (id: string) =>
        members.find((m: Member) => m.id === id)?.name ?? "Player";

      let sessionLine = null;
      let roster: RosterChip[] = [];
      if (session) {
        const r = await getRoster(session.id);
        const going = new Set(r.attending);
        sessionLine = {
          dateLabel: new Date(session.starts_at).toLocaleString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
          live: session.status === "live",
          selfIn: going.has(selfId),
        };
        roster = members.map((m: Member) => ({ id: m.id, name: m.name, going: going.has(m.id) }));
      }

      const complete = ((matchRes.data ?? []) as unknown as FeedSource[]).filter(
        (m) => m.snapshot
      );
      const thisWeek = complete.filter((m) => new Date(m.created_at).getTime() >= Date.now() - WEEK_MS);
      const mine = thisWeek.filter((m) =>
        m.match_participants.some((p) => p.player_id === selfId)
      );
      const wins = mine.filter((m) => {
        const side = m.match_participants.find((p) => p.player_id === selfId)?.side;
        return side && (m.snapshot as MatchState).winner === side;
      }).length;
      const week: WeekStrip = {
        sessions: sessionCount.count ?? 0,
        games: thisWeek.length,
        winsPct: mine.length === 0 ? null : Math.round((wins / mine.length) * 100),
      };

      paint({
        kind: "ready",
        hasGroup: true,
        sessionLine,
        sessionId: session?.id ?? null,
        roster,
        balancePaise: balances.perPlayer[selfId] ?? 0,
        week,
        feed: complete.slice(0, 5).map((m) => feedRowFrom(m, selfId, name)),
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
      dateLine={new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
      hasGroup={state.hasGroup}
      sessionLine={state.sessionLine}
      roster={state.roster}
      balancePaise={state.balancePaise}
      week={state.week}
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
