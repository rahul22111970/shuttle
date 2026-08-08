import { render, screen } from "@testing-library/react-native";
import TodayView from "./today-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    hasGroup: true,
    sessionLine: null,
    balancePaise: null,
    feed: [],
    busyRsvp: false,
    actionError: false,
    onOpenSession: noop,
    onRsvpIn: noop,
    onLogGame: noop,
    ...over,
  }) as Parameters<typeof TodayView>[0];

// the empty-state strings, pinned exactly (the acceptance's snapshot test)
it("empty states carry the DESIGN copy", async () => {
  await render(<TodayView {...ready({ hasGroup: false })} />);
  expect(screen.getByText("No sessions yet. Your group's nights will land here.")).toBeTruthy();
  expect(screen.getByText("Settled up.")).toBeTruthy();
  expect(screen.getByText("No games yet. Score one tonight.")).toBeTruthy();
  expect(screen.getByText("Start a group")).toBeTruthy();
});

it("nothing-planned state has its copy and the session action", async () => {
  await render(<TodayView {...ready()} />);
  expect(screen.getByText("Nothing planned. Pick a night.")).toBeTruthy();
  expect(screen.getByText("Open the session")).toBeTruthy();
});

it("a planned session you have not joined ends in I'm in", async () => {
  await render(
    <TodayView
      {...ready({
        sessionLine: { dateLabel: "Sat 9 Aug, 7:00 pm", live: false, selfIn: false },
      })}
    />
  );
  expect(screen.getByText("Sat 9 Aug, 7:00 pm")).toBeTruthy();
  expect(screen.getByText("I'm in")).toBeTruthy();
});

it("a live night says so and opens the ledger", async () => {
  await render(
    <TodayView
      {...ready({
        sessionLine: { dateLabel: "x", live: true, selfIn: true },
      })}
    />
  );
  expect(screen.getByText("The night is on.")).toBeTruthy();
  expect(screen.getByText("Open the ledger")).toBeTruthy();
});

it("a live night never offers RSVP, even to someone not in", async () => {
  await render(
    <TodayView
      {...ready({
        sessionLine: { dateLabel: "x", live: true, selfIn: false },
      })}
    />
  );
  expect(screen.queryByText("I'm in")).toBeNull();
});

it("without a live night the ledger stays unoffered", async () => {
  await render(<TodayView {...ready({ balancePaise: 25000 })} />);
  expect(screen.queryByText("Open the ledger")).toBeNull();
});

it("the money card names a debt", async () => {
  await render(<TodayView {...ready({ balancePaise: 25000 })} />);
  expect(screen.getByText("You owe ₹250")).toBeTruthy();
});

it("the money card names a credit", async () => {
  await render(<TodayView {...ready({ balancePaise: -30000 })} />);
  expect(screen.getByText("You are owed ₹300")).toBeTruthy();
});

it("the feed renders rows with score lines", async () => {
  await render(
    <TodayView
      {...ready({
        feed: [
          {
            id: "m1",
            aLabel: "Asha & Bela",
            bLabel: "Chirag & Dev",
            scoreLine: "24–10",
            whenLabel: "Thu 9:12 pm",
          },
        ],
      })}
    />
  );
  expect(screen.getByText("Asha & Bela · Chirag & Dev")).toBeTruthy();
  expect(screen.getByText("24–10")).toBeTruthy();
  expect(screen.getByText("Log a game")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(<TodayView {...ready()} />);
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});
