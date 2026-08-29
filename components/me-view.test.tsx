import { render, screen, userEvent, within } from "@testing-library/react-native";
import MeView from "./me-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    name: "Rahul Pareek",
    detail: "Player · +917018654784",
    avatar: null,
    avatarBusy: false,
    avatarError: null,
    onPickPreset: noop,
    onUploadPhoto: noop,
    rating: { blended: 1200, groups: [] },
    winPct: null,
    streak: 0,
    lastTen: [],
    chemistry: [],
    recent: [],
    themeChoice: "auto",
    onTheme: noop,
    onSignOut: noop,
    onOpenMath: noop,
    captainGroups: [],
    adminGroups: null,
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
    <MeView {...ready({ rating: { blended: 1252, groups: [{ groupId: "g1", name: "Tuesday Gang", current: 1252, provisional: true, series: [1232, 1252] }] } })} />
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
        rating: { blended: 1301, groups: [{ groupId: "g1", name: "Tuesday Gang", current: 1301, provisional: false, series: Array(12).fill(1300) }] },
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
    <MeView {...ready({ captainGroups: [{ id: "g1", name: "Tuesday Smashers" }] })} />
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
    <MeView {...ready({ captainGroups: [{ id: "g1", name: "Tuesday Smashers" }], onWipe })} />
  );
  await user.press(screen.getByText("Wipe Tuesday Smashers's games and money"));
  expect(onWipe).not.toHaveBeenCalled();
  const armed = screen.getByText("Wipe Tuesday Smashers's games and money · tap again");
  await user.press(armed);
  expect(onWipe).toHaveBeenCalledWith("g1");
});

it("two group ladders blend into one headline with a row each", async () => {
  await render(
    <MeView
      {...ready({
        rating: {
          blended: 1300,
          groups: [
            { groupId: "g1", name: "Bad-minton", current: 1390, provisional: false, series: Array(11).fill(1390) },
            { groupId: "g2", name: "Week Day Group", current: 1210, provisional: true, series: [1200, 1210] },
          ],
        },
      })}
    />
  );
  expect(screen.getByText("1300")).toBeTruthy();
  expect(screen.getByText("Blended · 2 groups")).toBeTruthy();
  expect(screen.getByText("Bad-minton")).toBeTruthy();
  expect(screen.getByText("1390")).toBeTruthy();
  expect(screen.getByText("Week Day Group")).toBeTruthy();
  expect(screen.getByText("1210")).toBeTruthy();
});

it("the wipe outcomes read as promised", async () => {
  const group = { captainGroups: [{ id: "g1", name: "Tuesday Smashers" }] };
  await render(<MeView {...ready({ ...group, wipeDone: true })} />);
  expect(screen.getByText("Wiped. Fresh night.")).toBeTruthy();
  await render(<MeView {...ready({ ...group, wipeError: true })} />);
  expect(screen.getByText("The wipe failed partway. Tell the builder.")).toBeTruthy();
});

it("the appearance chips render and the active one matches the choice", async () => {
  await render(<MeView {...ready({ themeChoice: "dark" })} />);
  expect(screen.getByText("Appearance")).toBeTruthy();
  expect(screen.getByText("Auto")).toBeTruthy();
  expect(screen.getByText("Light")).toBeTruthy();
  const active = screen.getByRole("button", { selected: true });
  expect(within(active).getByText("Dark")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(<MeView {...ready()} />);
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});

it("the admin card lists every group only when adminGroups is set", async () => {
  const r = await render(<MeView {...ready()} />);
  expect(screen.queryByText("Every group · admin")).toBeNull();
  r.unmount();
  await render(
    <MeView
      {...ready({
        adminGroups: [
          { id: "g1", name: "Bad-minton", captain: "Rahul Pareek", players: 8, roster: "Baibhab, Gautam", games: 13, lastGame: "2026-08-09T04:00:00Z" },
          { id: "g2", name: "Week Day Group", captain: "Rahul Pareek", players: 3, roster: "Sai Kiran", games: 0, lastGame: null },
        ],
      })}
    />
  );
  expect(screen.getByText("Every group · admin")).toBeTruthy();
  expect(screen.getByText("Bad-minton")).toBeTruthy();
  expect(screen.getByText("8 players · 13 games")).toBeTruthy();
  expect(screen.getByText("3 players · 0 games")).toBeTruthy();
});
