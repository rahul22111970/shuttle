import { render, screen, within } from "@testing-library/react-native";
import StatsView, { type Highlights, type StatsViewProps } from "./stats-view";

const NO_HIGHLIGHTS: Highlights = { mostGames: null, bestDuo: null, hotStreak: null, biggestWin: null, comeback: null };

const row = (playerId: string, name: string, rating: number, over: Record<string, unknown> = {}) => ({
  playerId,
  name,
  avatar: null,
  rating,
  wins: 0,
  losses: 0,
  winPct: null,
  weekDelta: null,
  form: [],
  ...over,
});

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    board: [],
    duos: [],
    onOpenPlayer: () => {},
    highlights: NO_HIGHLIGHTS,
    sentences: [],
    heat: { weeks: [], max: 0, total: 0 },
    capped: false,
    ...over,
  }) as StatsViewProps;

const season = () =>
  ready({
    board: [
      row("p1", "Sai Kiran", 1290, { wins: 10, losses: 4, winPct: 71, form: ["w", "w", "l", "w", "w"] }),
      row("p2", "Rahul P", 1255, { wins: 8, losses: 6, winPct: 57, form: ["l", "w", "w", "l", "w"] }),
      row("p3", "Gautam", 1231, { wins: 7, losses: 7, winPct: 50, form: ["w", "l", "l", "w", "l"] }),
      row("p4", "Mitrajit", 1198, { wins: 5, losses: 9, winPct: 36, form: ["w", "w", "w", "w", "l"] }),
    ],
    duos: [
      { key: "p1|p2", names: "Rahul P & Gautam", winPct: 71, games: 7 },
      { key: "p3|p4", names: "Sai Kiran & Mitrajit", winPct: 40, games: 5 },
    ],
    highlights: {
      mostGames: { name: "Sai Kiran", n: 14 },
      bestDuo: { names: "Rahul P & Gautam", winPct: 71, games: 7 },
      hotStreak: { name: "Mitrajit", streak: 4 },
      biggestWin: { winners: "Prajwal & Rajat", losers: "Sai Kiran & Gautam", score: "21–5" },
    },
  });

it("no games yet: the page teaches instead of showing zeros", async () => {
  await render(<StatsView {...ready()} />);
  expect(screen.getByText("Play a night and this page writes itself.")).toBeTruthy();
  expect(screen.queryByText("Leaderboard")).toBeNull();
});

it("the podium seats the top three by rating: Gold centre-piece, Silver, Bronze", async () => {
  await render(<StatsView {...season()} />);
  const podium = within(screen.getByTestId("podium-card"));
  expect(podium.getByText("Gold")).toBeTruthy();
  expect(podium.getByText("Silver")).toBeTruthy();
  expect(podium.getByText("Bronze")).toBeTruthy();
  expect(podium.getByText("Sai Kiran")).toBeTruthy();
  expect(podium.getByText("1290")).toBeTruthy();
  // #4 never medals
  expect(podium.queryByText("Mitrajit")).toBeNull();
});

it("a leaderboard row carries rank, name, W-L, win % and rating", async () => {
  await render(<StatsView {...season()} />);
  const r = within(screen.getByTestId("board-row-p2"));
  expect(r.getByText("2")).toBeTruthy();
  expect(r.getByText("Rahul P")).toBeTruthy();
  expect(r.getByText("8-6")).toBeTruthy();
  expect(r.getByText("57%")).toBeTruthy();
  expect(r.getByText("1255")).toBeTruthy();
});

it("an undecided player shows a dash, not 0%", async () => {
  await render(<StatsView {...ready({ board: [row("p1", "Asha", 1200)] })} />);
  const r = within(screen.getByTestId("board-row-p1"));
  // one dash for win %, one for weekly movement
  expect(r.getAllByText("–")).toHaveLength(2);
  expect(r.getByText("0-0")).toBeTruthy();
});

it("best pairs write the chemistry figure", async () => {
  await render(<StatsView {...season()} />);
  const duos = within(screen.getByTestId("duos-card"));
  expect(duos.getByText("Rahul P & Gautam")).toBeTruthy();
  expect(duos.getByText("71% · 7 games")).toBeTruthy();
  expect(duos.getByText("40% · 5 games")).toBeTruthy();
});

it("the highlights speak in full sentences", async () => {
  await render(<StatsView {...season()} />);
  const h = within(screen.getByTestId("highlights-card"));
  expect(h.getByText("Most games: Sai Kiran, 14.")).toBeTruthy();
  expect(h.getByText("Best pair: Rahul P & Gautam, 71% of 7.")).toBeTruthy();
  expect(h.getByText("Hottest streak: W4, Mitrajit.")).toBeTruthy();
  expect(h.getByText("Biggest win: 21–5, Prajwal & Rajat over Sai Kiran & Gautam.")).toBeTruthy();
});

it("a season with games but no eligible pair still explains the pairs card", async () => {
  await render(
    <StatsView {...ready({ board: [row("p1", "Asha", 1210, { wins: 1, winPct: 100, form: ["w"] })] })} />
  );
  expect(screen.getByText("Two games together make a pair. None yet.")).toBeTruthy();
});

it("loading and error states are drawn", async () => {
  await render(<StatsView kind="loading" />);
  // the season now loads as a skeleton the size of the board it becomes
  expect(screen.getByTestId("skeleton")).toBeTruthy();
  await render(<StatsView kind="error" onRetry={() => {}} />);
  expect(
    screen.getByText("Could not reach the hall. Check your network and try again.")
  ).toBeTruthy();
});
