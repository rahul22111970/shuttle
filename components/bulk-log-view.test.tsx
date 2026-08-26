import { fireEvent, render, screen } from "@testing-library/react-native";
import BulkLogView, { previewRows, type PreviewRow } from "./bulk-log-view";

const noop = () => {};

const ready = (over: Record<string, unknown> = {}) =>
  ({
    kind: "ready",
    onBack: noop,
    text: "",
    onText: noop,
    suggestions: [],
    onPick: noop,
    rows: [] as PreviewRow[],
    count: 0,
    busy: false,
    progress: 0,
    saved: null,
    partial: null,
    onAdd: noop,
    ...over,
  }) as Parameters<typeof BulkLogView>[0];

it("ready state shows the title, the hint and the grammar by example", async () => {
  await render(<BulkLogView {...ready()} />);
  expect(screen.getByText("Paste scores")).toBeTruthy();
  expect(
    screen.getByText("One game a line. Names, score, names. Or A vs B, score at the end.")
  ).toBeTruthy();
  expect(screen.getByPlaceholderText("Rahul & Sai 21-15 Gautam & Mitrajit")).toBeTruthy();
});

it("the button counts the games and is disabled at zero", async () => {
  await render(<BulkLogView {...ready()} />);
  const button = screen.getByRole("button", { name: "Add 0 games" });
  expect(button.props.accessibilityState.disabled).toBe(true);
});

it("one game reads singular, several read plural", async () => {
  await render(<BulkLogView {...ready({ count: 1 })} />);
  expect(screen.getByText("Add 1 game")).toBeTruthy();
  await render(<BulkLogView {...ready({ count: 3 })} />);
  expect(screen.getByText("Add 3 games")).toBeTruthy();
});

it("preview rows render games and errors by their text", async () => {
  const rows: PreviewRow[] = [
    { kind: "game", line: 1, text: "Rahul Pareek & Sai Kiran d. Gautam & Mitrajit · 21–15" },
    { kind: "error", line: 2, text: "Line 2: 21-21 is a tie. One side has to win." },
  ];
  await render(<BulkLogView {...ready({ rows, count: 1 })} />);
  expect(
    screen.getByText("Rahul Pareek & Sai Kiran d. Gautam & Mitrajit · 21–15")
  ).toBeTruthy();
  expect(screen.getByText("Line 2: 21-21 is a tie. One side has to win.")).toBeTruthy();
});

it("busy counts the saves along", async () => {
  await render(<BulkLogView {...ready({ count: 2, busy: true, progress: 1 })} />);
  expect(screen.getByText("Saving 1 of 2…")).toBeTruthy();
});

it("success says all N are in", async () => {
  await render(<BulkLogView {...ready({ count: 2, saved: 2 })} />);
  expect(screen.getByText("All 2 in. Ratings updated.")).toBeTruthy();
});

it("a partial failure is reported in full", async () => {
  const partial = "Added 1 of 3. Line 2 failed — the rest are untouched.";
  await render(<BulkLogView {...ready({ count: 3, partial })} />);
  expect(screen.getByText(partial)).toBeTruthy();
});

it("loading state says what it is fetching", async () => {
  await render(<BulkLogView kind="loading" />);
  expect(screen.getByText("Fetching the group…")).toBeTruthy();
});

it("error state locates the failure and offers retry", async () => {
  await render(<BulkLogView kind="error" onRetry={noop} />);
  expect(
    screen.getByText("Could not reach the hall. Check your network and try again.")
  ).toBeTruthy();
  expect(screen.getByText("Try again")).toBeTruthy();
});

it("no-group state has copy and a way back", async () => {
  await render(<BulkLogView kind="no-group" onBack={noop} />);
  expect(screen.getByText("No group yet. Start one before logging games.")).toBeTruthy();
  expect(screen.getByText("Back")).toBeTruthy();
});

// the formatting oracle: winner first, full names, en dash score
it("previewRows resolves names, puts the winner first and sorts by line", () => {
  const nameOf = (id: string) =>
    ({ rp: "Rahul Pareek", sk: "Sai Kiran", g: "Gautam", mj: "Mitrajit" })[id] ?? "?";
  const rows = previewRows(
    {
      games: [
        { line: 3, a: ["rp", "sk"], b: ["g", "mj"], score: { a: 21, b: 15 } },
        { line: 1, a: ["g"], b: ["sk"], score: { a: 12, b: 21 } },
      ],
      errors: [{ line: 2, message: "No names before the score." }],
    },
    nameOf
  );
  expect(rows.map((r) => r.text)).toEqual([
    "Sai Kiran d. Gautam · 21–12",
    "Line 2: No names before the score.",
    "Rahul Pareek & Sai Kiran d. Gautam & Mitrajit · 21–15",
  ]);
  expect(rows.map((r) => r.kind)).toEqual(["game", "error", "game"]);
});

it("suggestion chips render and a tap hands back the pick", async () => {
  const onPick = jest.fn();
  const s = { id: "rp", name: "Rahul Pareek", matched: "ra" };
  await render(<BulkLogView {...ready({ suggestions: [s], onPick })} />);
  fireEvent.press(screen.getByText("Rahul Pareek"));
  expect(onPick).toHaveBeenCalledWith(s);
});
