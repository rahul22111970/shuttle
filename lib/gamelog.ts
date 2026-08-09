// The game log's pure half: window cutoffs and day grouping. "now" is
// always injected — nothing here reads the clock, so tests pin every edge.

export type LogWindow = "today" | "week" | "month" | "all";

const DAY_MS = 24 * 60 * 60 * 1000;

export function cutoffFor(window: LogWindow, now: Date): Date | null {
  if (window === "all") return null;
  if (window === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date(now.getTime() - (window === "week" ? 7 : 30) * DAY_MS);
}

// "Today", "Yesterday", then the app's usual short date
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// newest day first; rows inside a day keep the order they arrive in
// (callers pass created_at-desc lists)
export function groupByDay<T extends { created_at: string }>(
  rows: readonly T[],
  now: Date
): { label: string; rows: T[] }[] {
  const days: { label: string; rows: T[] }[] = [];
  for (const row of rows) {
    const label = dayLabel(row.created_at, now);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(row);
    else days.push({ label, rows: [row] });
  }
  return days;
}
