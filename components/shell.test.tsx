import { render, screen } from "@testing-library/react-native";
import StatsView from "./stats-view";

// The tab shell's screens are real now: Session at S1-10, Today at S1-21,
// Stats here. Their states live in their own *-view.test.tsx files; this
// smoke keeps the last tab honest — a fresh user's Stats teaches, never 404s.

it("Stats greets a fresh user with the teaching empty state", async () => {
  await render(
    <StatsView
      kind="ready"
      groupName={null}
      board={[]}
      duos={[]}
      highlights={{ mostGames: null, bestDuo: null, hotStreak: null, biggestWin: null }}
      onOpenLog={() => {}}
    />
  );
  expect(screen.getByText("Stats")).toBeTruthy();
  expect(screen.getByText("Play a night and this page writes itself.")).toBeTruthy();
});
