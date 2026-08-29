// Integration proof for the weekly decay job against the hosted project:
// a group that played last week decays its sit-outs once and only once;
// never-rated members, players who played, and idle groups are untouched.
// Runs via integration/run.sh after migration 0017.
import { createClient } from "@supabase/supabase-js";
import { DECAY_FLOOR, WEEKLY_DECAY_POINTS } from "@shuttle/rating";
import { lastWeekWindow, runWeeklyDecay } from "../api/rating-decay";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(30000);

const stamp = Date.now();
const NOW = new Date();
const { week, startUtc } = lastWeekWindow(NOW);
let played: string, satOut: string, unrated: string;
let activeGroup: string, idleGroup: string, matchId: string;

beforeAll(async () => {
  const mk = async (tag: string) => {
    const u = await admin.auth.admin.createUser({
      email: `itest-decay-${tag}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    const p = await admin
      .from("profiles")
      .insert({ id: u.data.user.id, display_name: `Decay ${tag}`, account_type: "player" });
    if (p.error) throw p.error;
    return u.data.user.id;
  };
  played = await mk("played");
  satOut = await mk("sat");
  unrated = await mk("unrated");

  const mkGroup = async (name: string) => {
    const g = await admin
      .from("groups")
      .insert({ name: `${name} ${stamp}`, captain_id: played })
      .select("id")
      .single();
    if (g.error) throw g.error;
    const m = await admin.from("group_members").insert(
      [played, satOut, unrated].map((id) => ({ group_id: g.data.id, player_id: id }))
    );
    if (m.error) throw m.error;
    return g.data.id;
  };
  activeGroup = await mkGroup("Decay Active");
  idleGroup = await mkGroup("Decay Idle");

  // one completed match INSIDE last week's window: `played` beat `satOut`
  const inWeek = new Date(new Date(startUtc).getTime() + 3_600_000).toISOString();
  const match = await admin
    .from("matches")
    .insert({
      group_id: activeGroup,
      config: { kind: "standard", bestOf: 1, pointsTo: 21, cap: null, goldenPoint: true },
      status: "complete",
      snapshot: { winner: "a", games: [{ a: 21, b: 15 }] },
      created_by: played,
      created_at: inWeek,
    })
    .select("id")
    .single();
  if (match.error) throw match.error;
  matchId = match.data.id;
  const parts = await admin.from("match_participants").insert([
    { match_id: matchId, player_id: played, side: "a" },
    { match_id: matchId, player_id: satOut, side: "b" },
  ]);
  if (parts.error) throw parts.error;

  // both are on the ladder from that match; `unrated` never played
  const hist = await admin.from("rating_history").insert([
    {
      player_id: played, match_id: matchId, group_id: activeGroup,
      rating_before: 1200, rating_after: 1216, k: 64, created_by: played,
      created_at: inWeek,
    },
    {
      player_id: satOut, match_id: matchId, group_id: activeGroup,
      rating_before: 1200, rating_after: 1184, k: 64, created_by: played,
      created_at: inWeek,
    },
  ]);
  if (hist.error) throw hist.error;
});

afterAll(async () => {
  for (const g of [activeGroup, idleGroup]) {
    if (!g) continue;
    await admin.from("rating_history").delete().eq("group_id", g);
    await admin.from("groups").delete().eq("id", g);
  }
  for (const id of [played, satOut, unrated]) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
});

it("decays exactly the sit-out, once, and leaves the idle group alone", async () => {
  // wait: `satOut` PLAYED that seeded match, so week one decays nobody
  const first = await runWeeklyDecay(admin, NOW, [activeGroup, idleGroup]);
  expect(first.groups).toBe(1);

  const wk = await admin
    .from("rating_history")
    .select("player_id, rating_before, rating_after, kind, week")
    .in("group_id", [activeGroup, idleGroup])
    .eq("kind", "decay");
  expect(wk.error).toBeNull();
  expect(wk.data).toHaveLength(0);

  // now pretend `satOut` skipped the week: strip them from the match
  const strip = await admin
    .from("match_participants")
    .delete()
    .eq("match_id", matchId)
    .eq("player_id", satOut);
  expect(strip.error).toBeNull();

  const second = await runWeeklyDecay(admin, NOW, [activeGroup, idleGroup]);
  expect(second.decayed).toBe(1);
  const rows = await admin
    .from("rating_history")
    .select("player_id, rating_before, rating_after, kind, week, match_id, k")
    .in("group_id", [activeGroup, idleGroup])
    .eq("kind", "decay");
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
  expect(rows.data![0]).toMatchObject({
    player_id: satOut,
    rating_before: 1184,
    rating_after: 1184 - WEEKLY_DECAY_POINTS,
    week,
    match_id: null,
    k: null,
  });
  expect(1184 - WEEKLY_DECAY_POINTS).toBeGreaterThan(DECAY_FLOOR);

  // idempotent: a re-run writes nothing new
  await runWeeklyDecay(admin, NOW, [activeGroup, idleGroup]);
  const again = await admin
    .from("rating_history")
    .select("id")
    .in("group_id", [activeGroup, idleGroup])
    .eq("kind", "decay");
  expect(again.data).toHaveLength(1);
});
