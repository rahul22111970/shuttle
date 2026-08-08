import { render, screen } from "@testing-library/react-native";
import QuickLogView, { logLabelFor, type PickRow } from "./quick-log-view";

const noop = () => {};

const players: PickRow[] = [
  { id: "u1", name: "Asha", side: "a" },
  { id: "u2", name: "Bela", side: "b" },
  { id: "u3", name: "Chirag", side: "none" },
];

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    players,
    scoreA: "",
    scoreB: "",
    busy: false,
    actionError: false,
    logLabel: null,
    onCycle: noop,
    onScoreA: noop,
    onScoreB: noop,
    onLog: noop,
    ...over,
  }) as Parameters<typeof QuickLogView>[0];

it("ready state carries the two card titles and the tap hint", async () => {
  await render(<QuickLogView {...ready()} />);
  expect(screen.getByText("Who played")).toBeTruthy();
  expect(screen.getByText("Final score")).toBeTruthy();
  expect(screen.getByText("Tap a name for side A, again for side B.")).toBeTruthy();
});

it("picked players wear their side badge, benched players stay plain", async () => {
  await render(<QuickLogView {...ready()} />);
  expect(screen.getByText("Asha · A")).toBeTruthy();
  expect(screen.getByText("Bela · B")).toBeTruthy();
  expect(screen.getByText("Chirag")).toBeTruthy();
});

it("the button is disabled and generic until the log is valid", async () => {
  await render(<QuickLogView {...ready()} />);
  const button = screen.getByText("Log the game");
  expect(button).toBeTruthy();
  expect(screen.getByRole("button", { name: "Log the game" }).props.accessibilityState.disabled).toBe(
    true
  );
});

it("a valid log names the score it will write", async () => {
  await render(<QuickLogView {...ready({ logLabel: "Log 21–15", scoreA: "21", scoreB: "15" })} />);
  expect(screen.getByText("Log 21–15")).toBeTruthy();
});

it("no-group state has copy and a way back", async () => {
  await render(<QuickLogView kind="no-group" onBack={noop} />);
  expect(screen.getByText("No group yet. Start one before logging games.")).toBeTruthy();
  expect(screen.getByText("Back to Today")).toBeTruthy();
});

it("loading state says what it is fetching", async () => {
  await render(<QuickLogView kind="loading" />);
  expect(screen.getByText("Fetching the group…")).toBeTruthy();
});

// the validation oracle: shapes the sport cannot produce never earn a label
it("logLabelFor blocks bad shapes and names good ones", () => {
  const side = (s: PickRow["side"], id: string): PickRow => ({ id, name: id, side: s });
  const oneVone = [side("a", "p1"), side("b", "p2")];
  const twoVone = [side("a", "p1"), side("a", "p2"), side("b", "p3")];
  const twoVtwo = [...twoVone, side("b", "p4")];
  expect(logLabelFor(oneVone, "21", "15")).toBe("Log 21–15");
  expect(logLabelFor(twoVtwo, "25", "23")).toBe("Log 25–23");
  expect(logLabelFor(twoVone, "21", "15")).toBeNull();
  expect(logLabelFor([side("a", "p1")], "21", "15")).toBeNull();
  expect(logLabelFor(oneVone, "21", "21")).toBeNull();
  expect(logLabelFor(oneVone, "-5", "15")).toBeNull();
  expect(logLabelFor(oneVone, " ", "21")).toBeNull();
  expect(logLabelFor(oneVone, "1.", "21")).toBeNull();
  expect(logLabelFor(oneVone, "", "21")).toBeNull();
  expect(logLabelFor(oneVone, "021", "15")).toBeNull();
});

it("error state locates the failure and offers retry", async () => {
  await render(<QuickLogView kind="error" onRetry={noop} />);
  expect(
    screen.getByText("Could not reach the hall. Check your network and try again.")
  ).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});
