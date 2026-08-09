import { render, screen, userEvent } from "@testing-library/react-native";
import SessionView from "./session-view";
import type { Session } from "../lib/session";

const noop = () => {};

const session: Session = {
  id: "s1",
  group_id: "g1",
  starts_at: "2026-08-09T13:30:00.000Z",
  status: "planned",
  created_at: "2026-08-08T00:00:00.000Z",
};

it("renders the loading state by name", async () => {
  await render(<SessionView kind="loading" />);
  expect(screen.getByText("Loading your group…")).toBeTruthy();
});

it("renders the error state by name, with a retry action", async () => {
  await render(<SessionView kind="error" onRetry={noop} />);
  expect(screen.getByText("Could not reach the hall. Check your network and try again.")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("renders the empty (no-group) state by name", async () => {
  await render(<SessionView kind="no-group" busy={false} actionError={false} onCreateGroup={noop} onOpenGroups={noop} />);
  expect(screen.getByText("No group yet")).toBeTruthy();
  expect(screen.getByText("Start the group")).toBeTruthy();
});

it("renders the no-session state with the planning presets", async () => {
  await render(
    <SessionView kind="no-session" groupName="Tuesday Gang" busy={false} actionError={false} onPlanSession={noop} onOpenGroups={noop} />
  );
  expect(screen.getByText("Nothing planned. Pick a night.")).toBeTruthy();
  expect(screen.getByText("Tomorrow 7 pm")).toBeTruthy(); // always exists; Tonight filters after 7 pm
  expect(screen.getByText(/^Plan .*\d/)).toBeTruthy();
  expect(screen.getByText("The group sees it on Today and taps I'm in.")).toBeTruthy();
});

it("tapping a suggestion selects it; only the Plan button plans", async () => {
  const onPlanSession = jest.fn();
  await render(
    <SessionView kind="no-session" groupName="Tuesday Gang" busy={false} actionError={false} onPlanSession={onPlanSession} onOpenGroups={noop} />
  );
  const user = userEvent.setup();
  await user.press(screen.getByText("Tomorrow 7 am"));
  expect(onPlanSession).not.toHaveBeenCalled();
  await user.press(screen.getByText(/^Plan .*\d/));
  expect(onPlanSession).toHaveBeenCalledTimes(1);
  const iso = onPlanSession.mock.calls[0][0];
  expect(new Date(iso).getHours()).toBe(7);
});

it("renders the roster with attending chips and the right call to action", async () => {
  await render(
    <SessionView
      kind="session"
      groupName="Tuesday Gang"
      session={session}
      members={[
        { id: "u1", name: "Asha" },
        { id: "u2", name: "Bela" },
      ]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u2"
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop} onOpenGroups={noop}
    />
  );
  expect(screen.getByText("Asha")).toBeTruthy();
  expect(screen.getByText("Bela")).toBeTruthy();
  expect(screen.getByText("1 in · 2 in the group")).toBeTruthy();
  expect(screen.getByText("I'm in")).toBeTruthy(); // u2 not yet in
});

it("offers the out and start-night actions once you are in", async () => {
  await render(
    <SessionView
      kind="session"
      groupName="Tuesday Gang"
      session={session}
      members={[{ id: "u1", name: "Asha" }]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u1"
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop} onOpenGroups={noop}
    />
  );
  expect(screen.getByText("Can't make it")).toBeTruthy();
  expect(screen.getByText("Start the night")).toBeTruthy();
});

it("draws the create-group failure inline", async () => {
  await render(
    <SessionView kind="no-group" busy={false} actionError={true} onCreateGroup={noop} onOpenGroups={noop} />
  );
  expect(screen.getByText("That did not go through. Try again.")).toBeTruthy();
  expect(screen.getByText("No group yet")).toBeTruthy();
});

it("draws the inline action error without losing the roster", async () => {
  await render(
    <SessionView
      kind="session"
      groupName="Tuesday Gang"
      session={session}
      members={[{ id: "u1", name: "Asha" }]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u1"
      busyAction={null}
      actionError={true}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop} onOpenGroups={noop}
    />
  );
  expect(screen.getByText("That did not go through. Try again.")).toBeTruthy();
  expect(screen.getByText("Asha")).toBeTruthy();
});

it("labels are actions, never Submit or OK, in any state", async () => {
  const sessionState = (selfIn: boolean) => (
    <SessionView
      key={selfIn ? "in" : "out"}
      kind="session"
      groupName="G"
      session={session}
      members={[{ id: "u1", name: "A" }]}
      roster={{ attending: selfIn ? ["u1"] : [], checkedIn: [] }}
      selfId="u1"
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop} onOpenGroups={noop}
    />
  );
  const states = [
    <SessionView key="1" kind="error" onRetry={noop} />,
    <SessionView key="2" kind="no-group" busy={false} actionError={false} onCreateGroup={noop} onOpenGroups={noop} />,
    <SessionView key="3" kind="no-session" groupName="G" busy={false} actionError={false} onPlanSession={noop} onOpenGroups={noop} />,
    sessionState(true),
    sessionState(false),
  ];
  for (const el of states) {
    const r = await render(el);
    expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
    r.unmount();
  }
});
