// The decay job's pure halves: the IST week window and the plan.
import { DECAY_FLOOR, WEEKLY_DECAY_POINTS } from "@shuttle/rating";
import { decayPlan, lastWeekWindow } from "./rating-decay";

it("lastWeekWindow names the IST Monday and brackets the full week", () => {
  // Mon 02:00 IST on 2026-08-31 = Sun 20:30 UTC 2026-08-30 (the cron hour)
  const w = lastWeekWindow(new Date("2026-08-30T20:30:00Z"));
  expect(w.week).toBe("2026-08-24");
  // IST midnight Monday is 18:30 UTC the previous day
  expect(w.startUtc).toBe("2026-08-23T18:30:00.000Z");
  expect(w.endUtc).toBe("2026-08-30T18:30:00.000Z");
});

it("a late or manual run mid-week still decays the same finished week", () => {
  const w = lastWeekWindow(new Date("2026-09-02T10:00:00Z"));
  expect(w.week).toBe("2026-08-24");
});

const group = (over: Partial<Parameters<typeof decayPlan>[1][number]>) => ({
  groupId: "g1",
  memberIds: ["a", "b", "c"],
  playedIds: ["a"],
  ladder: new Map([
    ["a", 1240],
    ["b", 1180],
    ["c", 1150],
  ]),
  ...over,
});

it("sit-outs on the ladder decay; players who played do not", () => {
  const rows = decayPlan("2026-08-24", [group({})]);
  expect(rows.map((r) => r.player_id).sort()).toEqual(["b", "c"]);
  expect(rows[0]).toMatchObject({
    group_id: "g1",
    rating_before: 1180,
    rating_after: 1180 - WEEKLY_DECAY_POINTS,
    kind: "decay",
    week: "2026-08-24",
  });
});

it("never-rated members and floor-sitters are left alone", () => {
  const rows = decayPlan("2026-08-24", [
    group({
      memberIds: ["a", "b", "new", "low"],
      ladder: new Map([
        ["a", 1240],
        ["b", 1180],
        ["low", DECAY_FLOOR],
      ]),
    }),
  ]);
  expect(rows.map((r) => r.player_id)).toEqual(["b"]);
});

it("a member who left the roster is not decayed even with history", () => {
  const rows = decayPlan("2026-08-24", [group({ memberIds: ["a", "b"] })]);
  expect(rows.map((r) => r.player_id)).toEqual(["b"]);
});
