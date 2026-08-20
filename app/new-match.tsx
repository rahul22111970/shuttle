// The new-match controller: checked-in players first (the hall's roster),
// self pre-picked on side A, then startMatch with everyone seated and
// straight into the live scorer.
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { PickleballPoints } from "@shuttle/score";
import NewMatchView, { sidesReady } from "../components/new-match-view";
import type { PickRow } from "../components/quick-log-view";
import { useAuth } from "../lib/auth";
import { startMatch, type Participant } from "../lib/scoring";
import { pickActive } from "../lib/groups";
import { foley } from "../lib/foley";
import { defaultMatch, rulesLine, seatingLabel, type Sport } from "../lib/sport";
import { groupSport, getRoster, listGroupMembers, listGroups } from "../lib/session";

export default function NewMatch() {
  const { group, session } = useLocalSearchParams<{ group?: string; session?: string }>();
  const { session: authSession } = useAuth();
  const selfId = authSession?.user.id ?? "";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; groupId: string; sport: Sport; players: PickRow[] }
  >({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  // pickleball's real formats (USAP 15.C.1); badminton club play has one
  // answer so it gets no chooser
  const [points, setPoints] = useState<PickleballPoints>(11);
  const [rally, setRally] = useState(false);

  const load = useCallback(async () => {
    try {
      const groupId = group ?? pickActive(await listGroups())?.id;
      if (!groupId) {
        setState({ kind: "error" });
        return;
      }
      const [members, roster, sport] = await Promise.all([
        listGroupMembers(groupId),
        session ? getRoster(session) : Promise.resolve(null),
        groupSport(groupId),
      ]);
      const here = new Set(roster?.checkedIn ?? []);
      const order = (id: string) => (id === selfId ? 0 : here.has(id) ? 1 : 2);
      const players = [...members]
        .sort((x, y) => order(x.id) - order(y.id) || x.name.localeCompare(y.name))
        .map((m) => ({
          id: m.id,
          name: m.name,
          side: m.id === selfId ? ("a" as const) : ("none" as const),
        }));
      foley.use(sport);
      setState({ kind: "ready", groupId, sport, players });
    } catch {
      setState({ kind: "error" });
    }
  }, [group, session, selfId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") return <NewMatchView kind="loading" />;
  if (state.kind === "error") return <NewMatchView kind="error" onRetry={load} />;

  const perSide = state.players.filter((p) => p.side === "a").length;
  const doubles = perSide !== 1;
  const config = defaultMatch(state.sport, doubles, points, rally);

  return (
    <NewMatchView
      kind="ready"
      sport={state.sport}
      seating={sidesReady(state.players) ? seatingLabel(perSide) : null}
      rules={rulesLine(config)}
      points={points}
      onPoints={setPoints}
      rally={rally}
      onRally={setRally}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/groups"))}
      players={state.players}
      busy={busy}
      actionError={actionError}
      startable={sidesReady(state.players)}
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
      onStart={async () => {
        if (busy || !sidesReady(state.players)) return;
        setBusy(true);
        setActionError(false);
        try {
          const participants: Participant[] = state.players
            .filter((p) => p.side !== "none")
            .map((p) => ({ player_id: p.id, side: p.side as "a" | "b" }));
          const live = await startMatch(
            state.groupId,
            defaultMatch(state.sport, participants.length === 4, points, rally),
            participants,
            session || undefined
          );
          router.replace(`/match/${live.matchId}`);
        } catch {
          setActionError(true);
          setBusy(false);
        }
      }}
    />
  );
}
