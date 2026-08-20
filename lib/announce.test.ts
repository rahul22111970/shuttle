/**
 * @jest-environment jsdom
 */
// jest-expo runs .ts specs under node, and this one is entirely about the DOM
import { announce, resetAnnouncer } from "./announce";

afterEach(resetAnnouncer);

const nodes = (mode: string) =>
  [...document.querySelectorAll(`[data-mode="${mode}"] > div`)].map((n) => n.textContent);

it("builds both regions once and appends, never swaps", () => {
  announce("A 1, B 0");
  announce("A 2, B 0");
  expect(nodes("polite")).toEqual(["A 1, B 0", "A 2, B 0"]);
  // two messages in the same tick both survive; a swap would have lost one
  expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  expect(document.querySelectorAll('[aria-live="assertive"]')).toHaveLength(1);
});

it("keeps assertive out of the polite queue", () => {
  announce("that point did not save", true);
  expect(nodes("assertive")).toEqual(["that point did not save"]);
  expect(nodes("polite")).toEqual([]);
});

it("says nothing when there is nothing to say", () => {
  announce("");
  expect(document.querySelector("[data-mode]")).toBeNull();
});
