import { fireEvent, render, screen } from "@testing-library/react-native";
import ElasticTabs from "./elastic-tabs";

const SECTIONS = [
  { key: "night", label: "Night" },
  { key: "games", label: "Games" },
] as const;

const selectedLabels = () =>
  screen
    .getAllByRole("tab")
    .map((n, i) => (n.props.accessibilityState?.selected ? SECTIONS[i].label : null))
    .filter(Boolean);

// two renders rather than rerender(): RNTL's rerender reports the first
// render's props back for this tree, which is a harness quirk, not the
// component — a fresh render of the same element gives the right answer
it("selection is driven by the value prop", async () => {
  await render(<ElasticTabs sections={SECTIONS} value="night" onPick={() => {}} />);
  expect(selectedLabels()).toEqual(["Night"]);
});

it("and only ever one tab is selected", async () => {
  await render(<ElasticTabs sections={SECTIONS} value="games" onPick={() => {}} />);
  expect(selectedLabels()).toEqual(["Games"]);
});

it("a press asks for the tab that was pressed", async () => {
  const onPick = jest.fn();
  await render(<ElasticTabs sections={SECTIONS} value="night" onPick={onPick} />);
  fireEvent.press(screen.getAllByRole("tab")[1]);
  expect(onPick).toHaveBeenCalledWith("games");
});
