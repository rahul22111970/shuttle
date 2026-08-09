// The Night section: the group's next night. Plans one when nothing is
// planned, runs RSVPs while it is planned, hands over to LiveNight once it
// starts. The group arrives as a prop from the room; no hidden state.
import { useCallback, useState } from "react";
import { useLive } from "../lib/use-live";
import SessionView from "./session-view";
import LiveNight from "./live-night";
import {
  closeSession,
  createSession,
  getRoster,
  listGroupMembers,
  nextSession,
  rsvpIn,
  rsvpOut,
  startNight,
  type Group,
  type Member,
  type Roster,
  type Session,
} from "../lib/session";

type Data = {
  session: Session | null;
  members: Member[];
  roster: Roster;
};

export default function NightSection({ group, selfId }: { group: Group; selfId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "in" | "out" | "start" | "plan" | "mark" | "cancel" | null
  >(null);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const session = await nextSession(group.id);
      const members = await listGroupMembers(group.id);
      const roster = session
        ? await getRoster(session.id)
        : { attending: [], checkedIn: [] };
      setData({ session, members, roster });
    } catch {
      setFailed(true);
    }
  }, [group.id]);

  // focus, not mount: rounds, arrivals and roster changes land while this
  // section is away (the members list went stale until a hard reload before)
  useLive(load);

  // action failures stay inline: the screen keeps its data and says what
  // failed; the full error state is reserved for load() failures
  const act = (
    which: "in" | "out" | "start" | "plan" | "mark" | "cancel",
    fn: () => Promise<unknown>
  ) => async () => {
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
  if (!data.session) {
    return (
      <SessionView
        kind="no-session"
        busy={busyAction === "plan"}
        actionError={actionError}
        onPlanSession={(iso) => act("plan", () => createSession(group.id, iso))()}
      />
    );
  }
  if (data.session.status === "live") {
    return (
      <LiveNight
        session={data.session}
        groupId={group.id}
        groupName={group.name}
        captainId={group.captain_id}
        members={data.members}
        selfId={selfId}
        onClosed={load}
      />
    );
  }
  return (
    <SessionView
      kind="session"
      session={data.session}
      members={data.members}
      roster={data.roster}
      selfId={selfId}
      captain={group.captain_id === selfId}
      busyAction={busyAction === "plan" ? null : busyAction}
      actionError={actionError}
      onRsvpIn={act("in", () => rsvpIn(data.session!.id))}
      onRsvpOut={act("out", () => rsvpOut(data.session!.id))}
      onToggleMember={(playerId, currentlyIn) =>
        act("mark", () =>
          currentlyIn
            ? rsvpOut(data.session!.id, playerId)
            : rsvpIn(data.session!.id, playerId)
        )()
      }
      onStartNight={act("start", () => startNight(data.session!.id))}
      onCancelNight={act("cancel", () => closeSession(data.session!.id))}
    />
  );
}
