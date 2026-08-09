import { cutoffFor, dayLabel, groupByDay } from "./gamelog";

const now = new Date(2026, 7, 9, 21, 30); // Sun 9 Aug 2026, 21:30 local

it("today's cutoff is local midnight", () => {
  const c = cutoffFor("today", now) as Date;
  expect(c.getHours()).toBe(0);
  expect(c.getDate()).toBe(9);
});

it("week and month windows reach back 7 and 30 days; all has no cutoff", () => {
  expect((cutoffFor("week", now) as Date).getDate()).toBe(2);
  expect((cutoffFor("month", now) as Date).getMonth()).toBe(6); // July
  expect(cutoffFor("all", now)).toBeNull();
});

it("labels speak human: Today, Yesterday, then short dates", () => {
  expect(dayLabel(new Date(2026, 7, 9, 7).toISOString(), now)).toBe("Today");
  expect(dayLabel(new Date(2026, 7, 8, 23).toISOString(), now)).toBe("Yesterday");
  expect(dayLabel(new Date(2026, 7, 2, 12).toISOString(), now)).toMatch(/Aug 2|2 Aug/)  // locale order varies in CI vs devices;
});

it("groups a desc list into contiguous day buckets, newest first", () => {
  const rows = [
    { created_at: new Date(2026, 7, 9, 20).toISOString(), id: "a" },
    { created_at: new Date(2026, 7, 9, 7).toISOString(), id: "b" },
    { created_at: new Date(2026, 7, 8, 22).toISOString(), id: "c" },
    { created_at: new Date(2026, 7, 2, 9).toISOString(), id: "d" },
  ];
  const days = groupByDay(rows, now);
  expect(days.map((d) => d.label)).toEqual(["Today", "Yesterday", days[2].label]);
  expect(days[0].rows.map((r) => r.id)).toEqual(["a", "b"]);
  expect(days[1].rows.map((r) => r.id)).toEqual(["c"]);
});
