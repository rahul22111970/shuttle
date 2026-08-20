import { render, screen } from "@testing-library/react-native";
import SevenSegment from "./seven-segment";
import { color } from "../theme/tokens";

it("keeps the number readable even though the digits are Views", async () => {
  // seven segments made of Views say nothing to a screen reader or a test;
  // the real value stays in the tree, clipped to a pixel
  await render(<SevenSegment value={13} size={40} ink={color.ink} />);
  expect(screen.getByText("13")).toBeTruthy();
});

it("pads with a blank digit, never a zero", async () => {
  // a scoreboard reading 05 is lying about the score; an unlit digit is not
  const { toJSON } = await render(<SevenSegment value={7} size={40} ink={color.ink} />);
  expect(screen.getByText("7")).toBeTruthy();
  // two digit boxes are drawn: one blank, one lit
  const json = JSON.stringify(toJSON());
  expect(json.split('"width":24').length - 1).toBe(2); // 40 * 0.6
});

it("refuses to draw a negative score", async () => {
  await render(<SevenSegment value={-4} size={40} ink={color.ink} />);
  expect(screen.getByText("0")).toBeTruthy();
});
