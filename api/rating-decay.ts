// The weekly decay job (vercel.json cron, Monday 02:00 IST). For every
// group that played last week, every current member on that group's
// ladder who played nothing loses WEEKLY_DECAY_POINTS - the number comes
// from @shuttle/rating so the published math is the running math. A group
// with no matches that week decays nobody. Idempotent: one row per
// (group, player, week), re-runs and retries no-op on the unique index.
// A run that never happens is never back-filled: the job only ever looks
// at the single most recently finished week.
import { createClient } from "@supabase/supabase-js";
import { weeklyDecayAfter } from "../packages/rating/src";

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;

// The IST calendar week (Mon..Sun) that ENDED before `now`, as
// [startUtc, endUtc) plus the Monday date that names it in the table.
export function lastWeekWindow(now: Date) {
  const ist = new Date(now.getTime() + IST);
  const sinceMonday = (ist.getUTCDay() + 6) % 7;
  const thisMonday =
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - sinceMonday * DAY;
  const start = thisMonday - 7 * DAY;
  return {
    week: new Date(start).toISOString().slice(0, 10),
    startUtc: new Date(start - IST).toISOString(),
    endUtc: new Date(thisMonday - IST).toISOString(),
  };
}

// Pure planning: who decays, from what, to what. Exported for tests.
export function decayPlan(
  week: string,
  groups: readonly {
    groupId: string;
    memberIds: readonly string[];
    playedIds: readonly string[];
    // the ladder: last rating_after per player with any history here
    ladder: ReadonlyMap<string, number>;
  }[]
) {
  const rows: {
    group_id: string;
    player_id: string;
    rating_before: number;
    rating_after: number;
    kind: "decay";
    week: string;
  }[] = [];
  for (const g of groups) {
    const played = new Set(g.playedIds);
    for (const id of g.memberIds) {
      const rating = g.ladder.get(id);
      if (rating === undefined || played.has(id)) continue;
      const after = weeklyDecayAfter(rating);
      if (after === null) continue;
      rows.push({
        group_id: g.groupId,
        player_id: id,
        rating_before: rating,
        rating_after: after,
        kind: "decay",
        week,
      });
    }
  }
  return rows;
}

// onlyGroups scopes a run for integration tests; the cron always runs all
export async function runWeeklyDecay(admin: any, now: Date, onlyGroups?: readonly string[]) {
  const { week, startUtc, endUtc } = lastWeekWindow(now);

  const matches = await admin
    .from("matches")
    .select("group_id, match_participants(player_id)")
    .eq("status", "complete")
    .gte("created_at", startUtc)
    .lt("created_at", endUtc);
  if (matches.error) throw matches.error;
  const playedByGroup = new Map<string, Set<string>>();
  for (const m of matches.data) {
    const set = playedByGroup.get(m.group_id) ?? new Set();
    for (const p of m.match_participants) set.add(p.player_id);
    playedByGroup.set(m.group_id, set);
  }
  const groupIds = [...playedByGroup.keys()].filter(
    (id) => !onlyGroups || onlyGroups.includes(id)
  );
  if (groupIds.length === 0) return { week, groups: 0, decayed: 0 };

  // PostgREST caps a response at max_rows (Supabase default 1000); page
  // until a short page so a growing club never silently folds a truncated
  // ladder. Page size 999 stays under any cap >= 1000, so a full page is
  // always genuinely full and termination cannot misfire.
  const PAGE = 999;
  const pageAll = async (build: (from: number, to: number) => any) => {
    const rows: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await build(from, from + PAGE - 1);
      if (page.error) throw page.error;
      rows.push(...page.data);
      if (page.data.length < PAGE) return rows;
    }
  };
  const [members, history] = await Promise.all([
    pageAll((from, to) =>
      admin
        .from("group_members")
        .select("group_id, player_id")
        .in("group_id", groupIds)
        .order("group_id", { ascending: true })
        .order("player_id", { ascending: true })
        .range(from, to)
    ),
    // the whole chain, no cutoff: rating_before must be the chain HEAD at
    // run time, or a match logged after week end but before the run would
    // be clobbered by a decay row computed from a stale rating (and
    // rebuildRatings, which replays in chain order, would flag the row)
    pageAll((from, to) =>
      admin
        .from("rating_history")
        .select("group_id, player_id, rating_after, created_at, id")
        .in("group_id", groupIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const ladders = new Map<string, Map<string, number>>();
  for (const r of history) {
    const ladder = ladders.get(r.group_id) ?? new Map();
    ladder.set(r.player_id, r.rating_after);
    ladders.set(r.group_id, ladder);
  }
  const memberIds = new Map<string, string[]>();
  for (const m of members) {
    memberIds.set(m.group_id, [...(memberIds.get(m.group_id) ?? []), m.player_id]);
  }

  const rows = decayPlan(
    week,
    groupIds.map((groupId) => ({
      groupId,
      memberIds: memberIds.get(groupId) ?? [],
      playedIds: [...(playedByGroup.get(groupId) ?? [])],
      ladder: ladders.get(groupId) ?? new Map(),
    }))
  );
  if (rows.length > 0) {
    const ins = await admin.from("rating_history").upsert(rows, {
      onConflict: "group_id,player_id,week",
      ignoreDuplicates: true,
    });
    if (ins.error) throw ins.error;
  }
  return { week, groups: groupIds.length, decayed: rows.length };
}

export default async function handler(req: any, res: any) {
  // Vercel cron authenticates with the CRON_SECRET env; the same bearer
  // lets a human run the job by hand
  const auth = req.headers.authorization ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Cron only." });
  }
  try {
    const admin = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_ADMIN_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const summary = await runWeeklyDecay(admin, new Date());
    return res.status(200).json(summary);
  } catch (e: any) {
    console.error("rating-decay:", e?.message ?? e);
    return res.status(500).json({ error: "Decay run failed." });
  }
}
