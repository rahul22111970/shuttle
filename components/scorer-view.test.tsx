import { render, screen } from "@testing-library/react-native";
import { applyMatchPoint, createMatch, PRESETS } from "@shuttle/score";
import ScorerView from "./scorer-view";

const noop = () => {};

type ScoringProps = Extract<Parameters<typeof ScorerView>[0], { kind: "scoring" }>;

const scoring = (over: Partial<ScoringProps> = {}): ScoringProps => ({
  kind: "scoring",
  state: createMatch(PRESETS.casual1x21),
  scorerName: "Asha",
  pendingSide: null,
  writeFailed: false,
  caughtUp: false,
  onTap: noop,
  onUndo: noop,
  ...over,
});

it("renders the loading state by name", async () => {
  await render(<ScorerView kind="loading" />);
  expect(screen.getByText("Fetching the match…")).toBeTruthy();
});

it("renders the error state by name", async () => {
  await render(<ScorerView kind="error" onRetry={noop} />);
  expect(screen.getByText("Could not reach the hall. Check your network and try again.")).toBeTruthy();
});

it("renders the offline-write-failed state by name, keeping the score", async () => {
  let state = createMatch(PRESETS.casual1x21);
  state = applyMatchPoint(state, "a");
  await render(<ScorerView {...scoring({ state, writeFailed: true })} />);
  expect(
    screen.getByText("That point did not save. Check your network and tap again.")
  ).toBeTruthy();
  expect(screen.getByText("1")).toBeTruthy(); // the un-saved-nothing truth stays drawn
});

it("shows the scorer chip with the attributed name", async () => {
  await render(<ScorerView {...scoring()} />);
  expect(screen.getByText("Asha is scoring")).toBeTruthy();
});

it("puts the service dot with the side that won the last rally", async () => {
  let state = createMatch(PRESETS.casual1x21);
  state = applyMatchPoint(state, "b");
  await render(<ScorerView {...scoring({ state })} />);
  // b serves now; both zones exist and undo is available
  expect(screen.getByLabelText("Point to side B")).toBeTruthy();
  expect(screen.getByText("Undo")).toBeTruthy();
});

it("match-complete reads games, not the zeroed score", async () => {
  await render(
    <ScorerView
      kind="complete"
      games={[
        { a: 21, b: 15 },
        { a: 18, b: 21 },
        { a: 21, b: 19 },
      ]}
      winner="a"
      onDone={noop}
    />
  );
  expect(screen.getByText("Side A takes it.")).toBeTruthy();
  expect(screen.getByText("21–15 · 18–21 · 21–19")).toBeTruthy();
});
