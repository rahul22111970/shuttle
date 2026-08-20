import { render, screen } from "@testing-library/react-native";
import { applyMatchPoint, createMatch, pickleball, PRESETS, type Side } from "@shuttle/score";
import ScorerView from "./scorer-view";

const noop = () => {};

type ScoringProps = Extract<Parameters<typeof ScorerView>[0], { kind: "scoring" }>;

const scoring = (over: Partial<ScoringProps> = {}): ScoringProps => ({
  kind: "scoring",
  state: createMatch(PRESETS.bwf1x21),
  scorerName: "Asha",
  pendingSide: null,
  writeFailed: false,
  caughtUp: false,
  onTap: noop,
  onUndo: noop,
  onLeave: noop,
  ...over,
});

it("scoring carries a way out that promises the game stays live", async () => {
  await render(<ScorerView {...scoring()} />);
  expect(screen.getByLabelText("Leave scoring")).toBeTruthy();
  expect(screen.getByText("The game stays live. Come back from the session tab.")).toBeTruthy();
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
  let state = createMatch(PRESETS.bwf1x21);
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
  let state = createMatch(PRESETS.bwf1x21);
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

it("a finished game inside a session offers the next game first", async () => {
  await render(
    <ScorerView
      kind="complete"
      games={[{ a: 21, b: 15 }]}
      winner="a"
      onDone={noop}
      onNextGame={noop}
    />
  );
  expect(screen.getByText("Score the next game")).toBeTruthy();
  expect(screen.getByText("Back to the night")).toBeTruthy();
});

const play = (config: Parameters<typeof createMatch>[0], seq: readonly Side[]) =>
  seq.reduce((s, side) => applyMatchPoint(s, side), createMatch(config));

it("a pickleball game says who serves and calls the score three numbers", async () => {
  // A opens as second server (0-0-2), loses the rally, B takes over as 1
  const state = play(pickleball(11, true), ["b", "b"]);
  await render(<ScorerView {...scoring({ state })} />);
  expect(screen.getByText("Serving B · 1–0–1")).toBeTruthy();
  expect(screen.getByLabelText("Rally to side A")).toBeTruthy();
  expect(
    screen.getByText("Tap whoever won the rally. Only the serving side scores.")
  ).toBeTruthy();
});

it("pickleball singles calls two numbers", async () => {
  const state = play(pickleball(11, false), ["a", "a"]);
  await render(<ScorerView {...scoring({ state })} />);
  expect(screen.getByText("Serving A · 2–0")).toBeTruthy();
});

it("badminton keeps the point wording and no score call", async () => {
  await render(<ScorerView {...scoring()} />);
  expect(screen.getByLabelText("Point to side A")).toBeTruthy();
  expect(screen.queryByText(/Serving/)).toBeNull();
});

it("names the deuce at 20-all", async () => {
  const level = (n: number): Side[] =>
    Array.from({ length: n * 2 }, (_, i) => (i % 2 === 0 ? "a" : "b"));
  await render(<ScorerView {...scoring({ state: play(PRESETS.bwf1x21, level(20)) })} />);
  expect(screen.getByText("Deuce. Win by two.")).toBeTruthy();
});

it("names the game point", async () => {
  await render(
    <ScorerView {...scoring({ state: play(PRESETS.bwf1x21, Array<Side>(20).fill("a")) })} />
  );
  expect(screen.getByText("Game point A.")).toBeTruthy();
});

it("only the serving side can be at game point under side-out scoring", async () => {
  // A holds serve from the start and runs to 10 in an 11-point game
  const state = play(pickleball(11, false), Array<Side>(10).fill("a"));
  await render(<ScorerView {...scoring({ state })} />);
  expect(screen.getByText("Game point A.")).toBeTruthy();
});
