import { render, screen } from "@testing-library/react-native";
import GamesView from "./games-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    window: "week",
    onWindow: noop,
    days: [],
    total: 0,
    capped: false,
    removableIds: new Set<string>(),
    removeBusy: false,
    onRemove: noop,
    ...over,
  }) as Parameters<typeof GamesView>[0];

it("an empty window says so, with all four window chips", async () => {
  await render(<GamesView {...ready()} />);
  expect(screen.getByText("No games in this window.")).toBeTruthy();
  for (const w of ["Today", "Week", "Month", "All"]) {
    expect(screen.getByText(w)).toBeTruthy();
  }
});

it("days render as headers over their games, with the count line", async () => {
  await render(
    <GamesView
      {...ready({
        total: 2,
        days: [
          {
            label: "Today",
            rows: [
              { id: "a", line: "Rahul d. Sai", score: "21–15", when: "9:12 pm", self: "w" },
            ],
          },
          {
            label: "Yesterday",
            rows: [
              { id: "b", line: "Deo & Gautam d. Rahul & Sai", score: "21–18", when: "8:01 pm", self: "l" },
            ],
          },
        ],
      })}
    />
  );
  expect(screen.getByText("2 games.")).toBeTruthy();
  expect(screen.getByText("Yesterday")).toBeTruthy();
  expect(screen.getByText("Rahul d. Sai")).toBeTruthy();
  expect(screen.getByText("W")).toBeTruthy();
  expect(screen.getByText("L")).toBeTruthy();
});

it("the active window chip is selected", async () => {
  await render(<GamesView {...ready({ window: "month" })} />);
  const active = screen.getAllByRole("button", { selected: true });
  expect(active).toHaveLength(1);
});

it("a capped list admits what it dropped", async () => {
  await render(<GamesView {...ready({ total: 300, capped: true })} />);
  expect(
    screen.getByText("Showing the latest 300. Narrow the window for the rest.")
  ).toBeTruthy();
});
