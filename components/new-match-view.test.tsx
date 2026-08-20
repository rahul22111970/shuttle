import { render, screen } from "@testing-library/react-native";
import NewMatchView, { sidesReady } from "./new-match-view";
import type { PickRow } from "./quick-log-view";

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
    busy: false,
    actionError: false,
    startable: false,
    sport: "badminton",
    seating: null,
    rules: "One game to 21, win by two from 20-all, and 30 takes it.",
    points: 11,
    onPoints: noop,
    rally: false,
    onRally: noop,
    onBack: noop,
    onCycle: noop,
    onStart: noop,
    ...over,
  }) as Parameters<typeof NewMatchView>[0];

it("sidesReady is the 1v1-or-2v2 oracle", () => {
  const p = (sides: PickRow["side"][]) =>
    sides.map((side, i) => ({ id: `p${i}`, name: `P${i}`, side }));
  expect(sidesReady(p(["a", "b"]))).toBe(true);
  expect(sidesReady(p(["a", "a", "b", "b"]))).toBe(true);
  expect(sidesReady(p(["a", "a", "b"]))).toBe(false);
  expect(sidesReady(p(["a", "none"]))).toBe(false);
  expect(sidesReady(p(["a", "a", "a", "b", "b", "b"]))).toBe(false);
  expect(sidesReady(p([]))).toBe(false);
});

it("the picker carries its title, hint and side badges", async () => {
  await render(<NewMatchView {...ready()} />);
  expect(screen.getByText("Who plays")).toBeTruthy();
  expect(
    screen.getByText(
      "Tap a name for side A, again for side B. One each side is singles, two is doubles."
    )
  ).toBeTruthy();
  expect(screen.getByText("Asha · A")).toBeTruthy();
  expect(screen.getByText("Bela · B")).toBeTruthy();
  expect(screen.getByText("Chirag")).toBeTruthy();
});

it("the button stays disabled and honest until the sides are ready", async () => {
  await render(<NewMatchView {...ready()} />);
  expect(
    screen.getByRole("button", { name: "Pick the players" }).props.accessibilityState.disabled
  ).toBe(true);
});

it("ready sides earn Start scoring", async () => {
  await render(<NewMatchView {...ready({ startable: true })} />);
  expect(screen.getByText("Start scoring")).toBeTruthy();
});

it("error state locates the failure and offers retry", async () => {
  await render(<NewMatchView kind="error" onRetry={noop} />);
  expect(
    screen.getByText("Could not reach the hall. Check your network and try again.")
  ).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("says the rules and the seating, and hides pickleball's formats from badminton", async () => {
  await render(<NewMatchView {...ready({ seating: "Singles", startable: true })} />);
  expect(screen.getByText("Singles")).toBeTruthy();
  expect(
    screen.getByText("One game to 21, win by two from 20-all, and 30 takes it.")
  ).toBeTruthy();
  expect(screen.queryByText("Format")).toBeNull();
});

it("pickleball picks its points and its scoring rule", async () => {
  await render(
    <NewMatchView
      {...ready({
        sport: "pickleball",
        seating: "Doubles",
        rules: "One game to 11, win by two. Only the serving side scores.",
      })}
    />
  );
  expect(screen.getByText("Format")).toBeTruthy();
  expect(screen.getByText("to 11")).toBeTruthy();
  expect(screen.getByText("to 15")).toBeTruthy();
  expect(screen.getByText("to 21")).toBeTruthy();
  expect(screen.getByText("Traditional")).toBeTruthy();
  expect(screen.getByText("Rally")).toBeTruthy();
});
