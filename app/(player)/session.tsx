import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import SessionView from "../../components/session-view";
import { useAuth } from "../../lib/auth";
import {
  createGroup,
  createSession,
  getRoster,
  listGroupMembers,
  listGroups,
  nextSession,
  rsvpIn,
  rsvpOut,
  startNight,
  type Group,
  type Member,
  type Roster,
  type Session,
} from "../../lib/session";
import LiveNight from "../../components/live-night";

type Data = {
  group: Group | null;
  session: Session | null;
  members: Member[];
  roster: Roster;
};

export default function SessionTab() {
  const { session: authSession } = useAuth();
  const selfId = authSession?.user.id ?? "";
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "in" | "out" | "start" | "create" | "plan" | null
  >(null);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const groups = await listGroups();
      const group = groups[0] ?? null;
      if (!group) {
        setData({ group: null, session: null, members: [], roster: { attending: [], checkedIn: [] } });
        return;
      }
      const session = await nextSession(group.id);
      const members = await listGroupMembers(group.id);
      const roster = session
        ? await getRoster(session.id)
        : { attending: [], checkedIn: [] };
      setData({ group, session, members, roster });
    } catch {
      setFailed(true);
    }
  }, []);

  // focus, not mount: rounds, arrivals and roster changes land while this
  // tab is away (the members list went stale until a hard reload before)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // action failures stay inline: the screen keeps its data and says what
  // failed; the full error screen is reserved for load() failures
  const act = (which: "in" | "out" | "start" | "create" | "plan", fn: () => Promise<unknown>) => async () => {
    setBusyAction(which);
    setActionError(false);
    try {
      await fn();
      await load();
    } catch {
      setActionError(true);
    } finally {
      setBusyAction(null);
    }
  };

  if (failed) return <SessionView kind="error" onRetry={load} />;
  if (!data) return <SessionView kind="loading" />;
  if (!data.group) {
    return (
      <SessionView
        kind="no-group"
        busy={busyAction === "create"}
        actionError={actionError}
        onCreateGroup={(name) => act("create", () => createGroup(name))()}
      />
    );
  }
  if (!data.session) {
    return (
      <SessionView
        kind="no-session"
        groupName={data.group.name}
        busy={busyAction === "plan"}
        actionError={actionError}
        onPlanSession={(iso) => act("plan", () => createSession(data.group!.id, iso))()}
      />
    );
  }
  if (data.session.status === "live") {
    return (
      <LiveNight
        session={data.session}
        groupId={data.group.id}
        groupName={data.group.name}
        captainId={data.group.captain_id}
        members={data.members}
        selfId={selfId}
      />
    );
  }
  return (
    <SessionView
      kind="session"
      groupName={data.group.name}
      session={data.session}
      members={data.members}
      roster={data.roster}
      selfId={selfId}
      busyAction={busyAction === "create" || busyAction === "plan" ? null : busyAction}
      actionError={actionError}
      onRsvpIn={act("in", () => rsvpIn(data.session!.id))}
      onRsvpOut={act("out", () => rsvpOut(data.session!.id))}
      onStartNight={act("start", () => startNight(data.session!.id))}
    />
  );
}
