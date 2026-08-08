import { render, screen, userEvent } from "@testing-library/react-native";
import MeView from "./me-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    name: "Rahul Pareek",
    detail: "Player · +917018654784",
    rating: { current: 1200, provisional: true, series: [] },
    winPct: null,
    streak: 0,
    lastTen: [],
    chemistry: [],
    recent: [],
    onSignOut: noop,
    onOpenMath: noop,
    captainGroup: null,
    wiping: false,
    wipeDone: false,
    wipeError: false,
    onWipe: noop,
    ...over,
  }) as Parameters<typeof MeView>[0];

it("a new player sees name, detail and every empty state", async () => {
  await render(<MeView {...ready()} />);
  expect(screen.getByText("Rahul Pareek")).toBeTruthy();
  expect(screen.getByText("Player · +917018654784")).toBeTruthy();
  expect(screen.getByText("No games yet. Score one tonight.")).toBeTruthy();
  expect(screen.getByText("Play 3 games with someone to see your chemistry.")).toBeTruthy();
  expect(screen.getByText("Your games will land here.")).toBeTruthy();
  expect(screen.getByText("Sign out")).toBeTruthy();
});

it("the rating hero shows the current number and its state", async () => {
  await render(
    <MeView {...ready({ rating: { current: 1252, provisional: true, series: [1232, 1252] } })} />
  );
  expect(screen.getByText("1252")).toBeTruthy();
  expect(screen.getByText("Finding your level")).toBeTruthy();
  expect(screen.getByTestId("rating-spark")).toBeTruthy();
  expect(screen.getByText("How the rating works")).toBeTruthy();
});

it("an unrated player sees 1200 and the first-game line, no spark", async () => {
  await render(<MeView {...ready()} />);
  expect(screen.getByText("1200")).toBeTruthy();
  expect(
    screen.getByText("Every player starts at 1200. Your line begins with your first game.")
  ).toBeTruthy();
  expect(screen.queryByTestId("rating-spark")).toBeNull();
});

it("an established player reads Established", async () => {
  await render(
    <MeView
      {...ready({
        rating: { current: 1301, provisional: false, series: Array(12).fill(1300) },
      })}
    />
  );
  expect(screen.getByText("Established")).toBeTruthy();
});

it("the form card shows win %, a W streak in court green, and the dots", async () => {
  await render(
    <MeView {...ready({ winPct: 75, streak: 3, lastTen: ["w", "w", "w", "l"] })} />
  );
  expect(screen.getByText("75%")).toBeTruthy();
  expect(screen.getByText("W3")).toBeTruthy();
});

it("a losing streak reads L2", async () => {
  await render(<MeView {...ready({ winPct: 20, streak: -2, lastTen: ["l", "l"] })} />);
  expect(screen.getByText("L2")).toBeTruthy();
});

it("chemistry rows carry name, percentage and games", async () => {
  await render(
    <MeView
      {...ready({
        winPct: 60,
        lastTen: ["w"],
        chemistry: [{ partnerId: "p1", name: "Sai Kiran", played: 4, winPct: 75 }],
      })}
    />
  );
  expect(screen.getByText("Sai Kiran")).toBeTruthy();
  expect(screen.getByText("75% · 4 games")).toBeTruthy();
});

it("recent games use the winners-first idiom with a badge", async () => {
  await render(
    <MeView
      {...ready({
        winPct: 100,
        lastTen: ["w"],
        recent: [
          {
            id: "m1",
            line: "Rahul & Sai d. Gautam & Dev",
            score: "21–17",
            when: "8 Aug, 9:12 pm",
            self: "w",
          },
        ],
      })}
    />
  );
  expect(screen.getByText("Rahul & Sai d. Gautam & Dev")).toBeTruthy();
  expect(screen.getByText("21–17")).toBeTruthy();
  expect(screen.getByText("W")).toBeTruthy();
});

it("the captain sees the pilot wipe tool", async () => {
  await render(
    <MeView {...ready({ captainGroup: { id: "g1", name: "Tuesday Smashers" } })} />
  );
  expect(screen.getByText("Captain tools")).toBeTruthy();
  expect(screen.getByText("Pilot-only. This tool leaves before the app store.")).toBeTruthy();
  expect(screen.getByText("Wipe Tuesday Smashers's games and money")).toBeTruthy();
});

it("a non-captain never sees the wipe tool", async () => {
  await render(<MeView {...ready()} />);
  expect(screen.queryByText("Captain tools")).toBeNull();
  expect(screen.queryByText(/Wipe .*games and money/)).toBeNull();
});

it("the wipe arms on the first tap and fires on the second", async () => {
  const onWipe = jest.fn();
  const user = userEvent.setup();
  await render(
    <MeView {...ready({ captainGroup: { id: "g1", name: "Tuesday Smashers" }, onWipe })} />
  );
  await user.press(screen.getByText("Wipe Tuesday Smashers's games and money"));
  expect(onWipe).not.toHaveBeenCalled();
  const armed = screen.getByText("Wipe Tuesday Smashers's games and money · tap again");
  await user.press(armed);
  expect(onWipe).toHaveBeenCalledTimes(1);
});

it("the wipe outcomes read as promised", async () => {
  const group = { captainGroup: { id: "g1", name: "Tuesday Smashers" } };
  await render(<MeView {...ready({ ...group, wipeDone: true })} />);
  expect(screen.getByText("Wiped. Fresh night.")).toBeTruthy();
  await render(<MeView {...ready({ ...group, wipeError: true })} />);
  expect(screen.getByText("The wipe failed partway. Tell the builder.")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(<MeView {...ready()} />);
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});
