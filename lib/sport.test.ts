import { pickleball, PRESETS } from "@shuttle/score";
import { asSport, defaultMatch, rulesLine, seatingLabel } from "./sport";

it("reads any unknown sport as badminton, the column default", () => {
  expect(asSport("pickleball")).toBe("pickleball");
  expect(asSport("badminton")).toBe("badminton");
  expect(asSport(undefined)).toBe("badminton");
  expect(asSport("padel")).toBe("badminton");
});

it("seating decides doubles, and pickleball singles has no second server", () => {
  expect(defaultMatch("badminton", true)).toEqual(PRESETS.bwf1x21);
  expect(defaultMatch("badminton", false)).toEqual(PRESETS.bwf1x21);
  expect(defaultMatch("pickleball", true).serve).toEqual({ mode: "sideout", doubles: true });
  expect(defaultMatch("pickleball", false).serve).toEqual({ mode: "sideout", doubles: false });
  expect(defaultMatch("pickleball", true, 15).game.pointsToWin).toBe(15);
  expect(defaultMatch("pickleball", true, 11, true).serve).toBeUndefined();
});

it("reads the rules back off the config, never off the label", () => {
  expect(rulesLine(PRESETS.bwf1x21)).toBe(
    "One game to 21, win by two from 20-all, and 30 takes it."
  );
  expect(rulesLine(pickleball(11, true))).toBe(
    "One game to 11, win by two. Only the serving side scores."
  );
  expect(rulesLine(pickleball(11, true, true))).toBe("One game to 11, win by two.");
  expect(rulesLine(PRESETS.bwf3x21)).toContain("Best of 3");
});

it("names the seating", () => {
  expect(seatingLabel(1)).toBe("Singles");
  expect(seatingLabel(2)).toBe("Doubles");
});
