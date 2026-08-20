import { damp, PULL, rubber } from "./motion";

it("damp lands the same place whatever the frame rate", () => {
  // one 200ms frame vs eight 25ms frames: a fixed-fraction lerp diverges,
  // this must not (pattern 05's whole claim)
  const slow = damp(0, 100, 11, 0.2);
  let fast = 0;
  for (let i = 0; i < 8; i++) fast = damp(fast, 100, 11, 0.025);
  expect(Math.abs(slow - fast)).toBeLessThan(0.01);
});

it("damp never overshoots and always closes the gap", () => {
  let x = 0;
  for (let i = 0; i < 200; i++) x = damp(x, 50, 11, 1 / 60);
  expect(x).toBeGreaterThan(49.99);
  expect(x).toBeLessThanOrEqual(50);
});

it("rubber approaches the height and never passes it", () => {
  expect(rubber(0, 400)).toBe(0);
  expect(rubber(70, 400)).toBeLessThan(70);
  expect(rubber(100000, 400)).toBeLessThan(400);
  // monotonic: pulling further always moves further, just less
  expect(rubber(200, 400)).toBeGreaterThan(rubber(100, 400));
});

it("carries the pull constants unchanged", () => {
  expect(PULL).toEqual({ arm: 70, hold: 54, backtrack: 12 });
});
