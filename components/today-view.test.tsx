import { render, screen } from "@testing-library/react-native";
import TodayView, { type FeedRow, type RosterChip } from "./today-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    dateLine: "Saturday 8 August",
    hasGroup: true,
    sessionLine: null,
    roster: [] as RosterChip[],
    balancePaise: null,
    week: { sessions: 0, games: 0, winsPct: null },
    feed: [] as FeedRow[],
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
  expect(screen.getByText("No games yet. Score one tonight.")).toBeTruthy();
  expect(screen.getByText("Start a group")).toBeTruthy();
});

it("the heading names the day", async () => {
  await render(<TodayView {...ready()} />);
  expect(screen.getByText("Today")).toBeTruthy();
  expect(screen.getByText("Saturday 8 August")).toBeTruthy();
});

it("nothing-planned state has its copy and the session action", async () => {
  await render(<TodayView {...ready()} />);
  expect(screen.getByText("Nothing planned. Pick a night.")).toBeTruthy();
  expect(screen.getByText("Plan a night")).toBeTruthy();
});

it("a planned session shows RSVP chips and ends in I'm in", async () => {
  await render(
    <TodayView
      {...ready({
        sessionLine: { dateLabel: "Sat 9 Aug, 7:00 pm", live: false, selfIn: false },
        roster: [
          { id: "u1", name: "Asha", going: true },
          { id: "u2", name: "Bela", going: false },
        ],
      })}
    />
  );
  expect(screen.getByText("Sat 9 Aug, 7:00 pm")).toBeTruthy();
  expect(screen.getByText("Asha ✓")).toBeTruthy();
  expect(screen.getByText("Bela ?")).toBeTruthy();
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

it("a settled group reads Settled up.", async () => {
  await render(<TodayView {...ready({ balancePaise: 0 })} />);
  expect(screen.getByText("Settled up.")).toBeTruthy();
});

it("the money card names a debt", async () => {
  await render(<TodayView {...ready({ balancePaise: 25000 })} />);
  expect(screen.getByText("You owe ₹250")).toBeTruthy();
});

it("the money card names a credit", async () => {
  await render(<TodayView {...ready({ balancePaise: -30000 })} />);
  expect(screen.getByText("You are owed ₹300")).toBeTruthy();
});

it("the week strip shows counts, and dashes wins with no games of yours", async () => {
  await render(<TodayView {...ready({ week: { sessions: 2, games: 11, winsPct: null } })} />);
  expect(screen.getByText("Sessions")).toBeTruthy();
  expect(screen.getByText("11")).toBeTruthy();
  expect(screen.getByText("–")).toBeTruthy();
});

it("the week strip shows a win percentage", async () => {
  await render(<TodayView {...ready({ week: { sessions: 1, games: 4, winsPct: 75 } })} />);
  expect(screen.getByText("75%")).toBeTruthy();
});

it("the feed writes games winners-first with a W badge for the viewer", async () => {
  await render(
    <TodayView
      {...ready({
        feed: [
          {
            id: "m1",
            line: "Asha & Bela d. Chirag & Dev",
            score: "24–10",
            when: "7 Aug, 9:12 pm",
            self: "w",
          },
          {
            id: "m2",
            line: "Side A d. Side B",
            score: "21–15",
            when: "7 Aug, 8:40 pm",
            self: null,
          },
        ],
      })}
    />
  );
  expect(screen.getByText("Asha & Bela d. Chirag & Dev")).toBeTruthy();
  expect(screen.getByText("24–10")).toBeTruthy();
  expect(screen.getByText("W")).toBeTruthy();
  expect(screen.getByText("Side A d. Side B")).toBeTruthy();
  expect(screen.getByText("Log a game")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(<TodayView {...ready()} />);
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});

it("a live night's session action is the one primary: Go to the night", async () => {
  await render(
    <TodayView
      {...ready({ sessionLine: { dateLabel: "x", live: true, selfIn: true } })}
    />
  );
  expect(screen.getByText("Go to the night")).toBeTruthy();
});

it("without a group the money card does not render", async () => {
  await render(<TodayView {...ready({ hasGroup: false })} />);
  expect(screen.queryByText("Money")).toBeNull();
  expect(screen.getByText("Start a group, plan a night, and this page fills itself.")).toBeTruthy();
});
