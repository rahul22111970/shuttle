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
  expect(screen.getByText("Loading the night…")).toBeTruthy();
});

it("renders the error state by name, with a retry action", async () => {
  await render(<SessionView kind="error" onRetry={noop} />);
  expect(screen.getByText("Could not reach the hall. Check your network and try again.")).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("renders the no-session state with the planning presets", async () => {
  await render(
    <SessionView kind="no-session" busy={false} actionError={false} onPlanSession={noop} />
  );
  expect(screen.getByText("Nothing planned. Pick a night.")).toBeTruthy();
  expect(screen.getByText("Tomorrow 7 pm")).toBeTruthy(); // always exists; Tonight filters after 7 pm
  expect(screen.getByText(/^Plan .*\d/)).toBeTruthy();
  expect(screen.getByText("The group sees it and taps I'm in.")).toBeTruthy();
});

it("tapping a suggestion selects it; only the Plan button plans", async () => {
  const onPlanSession = jest.fn();
  await render(
    <SessionView kind="no-session" busy={false} actionError={false} onPlanSession={onPlanSession} />
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
      session={session}
      members={[
        { id: "u1", name: "Asha" },
        { id: "u2", name: "Bela" },
      ]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u2"
      captain={false}
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={noop}
      onCancelNight={noop}
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
      session={session}
      members={[{ id: "u1", name: "Asha" }]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u1"
      captain={false}
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={noop}
      onCancelNight={noop}
    />
  );
  expect(screen.getByText("Can't make it")).toBeTruthy();
  expect(screen.getByText("Start the night")).toBeTruthy();
});

it("draws the inline action error without losing the roster", async () => {
  await render(
    <SessionView
      kind="session"
      session={session}
      members={[{ id: "u1", name: "Asha" }]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u1"
      captain={false}
      busyAction={null}
      actionError={true}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={noop}
      onCancelNight={noop}
    />
  );
  expect(screen.getByText("That did not go through. Try again.")).toBeTruthy();
  expect(screen.getByText("Asha")).toBeTruthy();
});

it("the captain taps names to mark them in or out; members cannot", async () => {
  const onToggleMember = jest.fn();
  await render(
    <SessionView
      kind="session"
      session={session}
      members={[
        { id: "u1", name: "Asha" },
        { id: "u2", name: "Bela" },
      ]}
      roster={{ attending: ["u1"], checkedIn: [] }}
      selfId="u1"
      captain={true}
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={onToggleMember}
      onCancelNight={noop}
    />
  );
  expect(screen.getByText("Tap a name to mark them in.")).toBeTruthy();
  const user = userEvent.setup();
  await user.press(screen.getByLabelText("Mark Bela in"));
  expect(onToggleMember).toHaveBeenCalledWith("u2", false);
  await user.press(screen.getByLabelText("Mark Asha out"));
  expect(onToggleMember).toHaveBeenCalledWith("u1", true);
});

it("cancelling the night arms first and fires only on the second tap", async () => {
  const onCancelNight = jest.fn();
  await render(
    <SessionView
      kind="session"
      session={session}
      members={[{ id: "u1", name: "Asha" }]}
      roster={{ attending: [], checkedIn: [] }}
      selfId="u1"
      captain={true}
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={noop}
      onCancelNight={onCancelNight}
    />
  );
  const user = userEvent.setup();
  await user.press(screen.getByText("Cancel this night"));
  expect(onCancelNight).not.toHaveBeenCalled();
  await user.press(screen.getByText(/it disappears for everyone/));
  expect(onCancelNight).toHaveBeenCalledTimes(1);
});

it("labels are actions, never Submit or OK, in any state", async () => {
  const sessionState = (selfIn: boolean) => (
    <SessionView
      key={selfIn ? "in" : "out"}
      kind="session"
      session={session}
      members={[{ id: "u1", name: "A" }]}
      roster={{ attending: selfIn ? ["u1"] : [], checkedIn: [] }}
      selfId="u1"
      captain={false}
      busyAction={null}
      actionError={false}
      onRsvpIn={noop}
      onRsvpOut={noop}
      onStartNight={noop}
      onToggleMember={noop}
      onCancelNight={noop}
    />
  );
  const states = [
    <SessionView key="1" kind="error" onRetry={noop} />,
    <SessionView key="2" kind="no-session" busy={false} actionError={false} onPlanSession={noop} />,
    sessionState(true),
    sessionState(false),
  ];
  for (const el of states) {
    const r = await render(el);
    expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
    r.unmount();
  }
});
