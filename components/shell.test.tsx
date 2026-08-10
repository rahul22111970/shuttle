import { render, screen } from "@testing-library/react-native";
import StatsView from "./stats-view";

// The shell is two tabs now: Groups (home) and Me; every group's sections
// live in the room. This smoke keeps the Stats section honest for a fresh
// group — it teaches, never 404s.

it("Stats greets a fresh group with the teaching empty state", async () => {
  await render(
    <StatsView
      kind="ready"
      board={[]}
      duos={[]}
      highlights={{ mostGames: null, bestDuo: null, hotStreak: null, biggestWin: null }}
      onOpenPlayer={() => {}}
    />
  );
  expect(screen.getByText("Play a night and this page writes itself.")).toBeTruthy();
});
