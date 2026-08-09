// Integration for lib/rating against the hosted project: a completed
// doubles quick-log writes 4 rows equal to the engine fixture, a second
// recording is a no-op, an unrateable match writes nothing, and the
// stored chain replays to equality (rating_replay_equality).
import { createClient } from "@supabase/supabase-js";
import { PRESETS } from "@shuttle/score";
import { INITIAL_RATING, PROVISIONAL_K, doublesDeltas, singlesDeltas } from "@shuttle/rating";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import { createGroup } from "../lib/session";
import { quickLog } from "../lib/scoring";
import { RatingConflictError, rebuildRatings, recordRatings } from "../lib/rating";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(180000);

const stamp = Date.now();
const email = `itest-rating-${stamp}@shuttle-itest.test`;
let userId: string, groupId: string;
const fixtureIds: string[] = [];

async function signInAs(address: string) {
  await supabase.auth.signOut();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: address });
  if (link.error) throw link.error;
  const verified = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error) throw verified.error;
}

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  for (const nm of ["Rate B", "Rate C", "Rate D"]) {
    const u = await admin.auth.admin.createUser({
      email: `itest-rating-${nm.slice(-1).toLowerCase()}-${stamp}@shuttle-itest.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin
      .from("profiles")
      .insert({ id: u.data.user.id, display_name: nm, account_type: "player" });
  }
  await signInAs(email);
  await upsertProfile({ id: userId, display_name: "Rate A", phone: null, account_type: "player" });
  const g = await createGroup(`Rate Gang ${stamp}`);
  groupId = g.id;
  for (const id of fixtureIds) {
    const gm = await admin.from("group_members").insert({ group_id: groupId, player_id: id });
    if (gm.error) throw gm.error;
  }
});

afterAll(async () => {
  // rating rows reference matches with ON DELETE RESTRICT; clear them
  // first, then groups (cascades matches), then users
  const matches = await admin.from("matches").select("id").eq("group_id", groupId);
  if (matches.data && matches.data.length > 0) {
    await admin
      .from("rating_history")
      .delete()
      .in("match_id", matches.data.map((m) => m.id));
  }
  const { error } = await admin.from("groups").delete().eq("id", groupId);
  if (error) console.error("cleanup group:", error.message);
  for (const id of [userId, ...fixtureIds]) {
    if (!id) continue;
    const { error: uerr } = await admin.auth.admin.deleteUser(id);
    if (uerr) console.error("cleanup user:", uerr.message);
  }
});

it("a completed doubles writes 4 rows equal to the engine fixture, once", async () => {
  const [b, c, d] = fixtureIds;
  const row = await quickLog(
    groupId,
    PRESETS.casual1x21,
    [
      { player_id: userId, side: "a" },
      { player_id: b, side: "a" },
      { player_id: c, side: "b" },
      { player_id: d, side: "b" },
    ],
    { a: 21, b: 15 }
  );
  // quickLog fires recordRatings fire-and-forget; call again explicitly —
  // idempotency means the visible result is identical either way
  const rows = await recordRatings(row.id);
  expect(rows).toHaveLength(4);

  const fresh = { rating: INITIAL_RATING, matchesPlayed: 0 };
  const fx = doublesDeltas([fresh, fresh], [fresh, fresh], 6, 21);
  const after = (id: string) =>
    rows.find((r) => r.player_id === id)?.rating_after;
  expect(after(userId)).toBe(Math.round(INITIAL_RATING + fx.winners[0]));
  expect(after(b)).toBe(Math.round(INITIAL_RATING + fx.winners[1]));
  expect(after(c)).toBe(Math.round(INITIAL_RATING + fx.losers[0]));
  expect(after(d)).toBe(Math.round(INITIAL_RATING + fx.losers[1]));
  expect(rows.every((r) => r.k === PROVISIONAL_K)).toBe(true);

  // recording again inserts nothing new
  const again = await recordRatings(row.id);
  expect(again).toHaveLength(4);
  const stored = await admin
    .from("rating_history")
    .select("id")
    .eq("match_id", row.id);
  expect(stored.data).toHaveLength(4);
});

it("an unrateable match (no participants) writes nothing — named: unrated_inserts_nothing", async () => {
  const row = await quickLog(groupId, PRESETS.casual1x21, [], { a: 21, b: 7 });
  const rows = await recordRatings(row.id);
  expect(rows).toEqual([]);
  const stored = await admin
    .from("rating_history")
    .select("id")
    .eq("match_id", row.id);
  expect(stored.data).toHaveLength(0);
});

it("a fabricated pre-existing row is a loud RatingConflictError, never 'already done'", async () => {
  const [b] = fixtureIds;
  const row = await quickLog(
    groupId,
    PRESETS.casual1x21,
    [
      { player_id: userId, side: "b" },
      { player_id: b, side: "a" },
    ],
    { a: 21, b: 23 }
  );
  // wait out quickLog's own fire-and-forget recording, then poison: wipe
  // the legit rows and plant one wrong row (0011's front-run scenario)
  await new Promise((r) => setTimeout(r, 1500));
  await admin.from("rating_history").delete().eq("match_id", row.id);
  const planted = await admin.from("rating_history").insert({
    player_id: userId,
    match_id: row.id,
    group_id: groupId,
    rating_before: 9999,
    rating_after: 9999,
    k: 64,
    created_by: userId,
  });
  if (planted.error) throw planted.error;
  await expect(recordRatings(row.id)).rejects.toThrow(RatingConflictError);
  // remove the poison so later tests see a clean chain (in production
  // this is exactly the admin-intervention path the 0011 note names)
  const swept = await admin.from("rating_history").delete().eq("match_id", row.id);
  if (swept.error) throw swept.error;
});

it("rating_replay_equality: rebuild from history equals stored rows", async () => {
  // a second rated match so the chain has length: A beats C at singles
  const [, c] = fixtureIds;
  const row = await quickLog(
    groupId,
    PRESETS.casual1x21,
    [
      { player_id: userId, side: "a" },
      { player_id: c, side: "b" },
    ],
    { a: 21, b: 18 }
  );
  await recordRatings(row.id);

  const rebuilt = await rebuildRatings(userId, groupId);
  const stored = await admin
    .from("rating_history")
    .select("player_id, match_id, rating_before, rating_after, k, created_at")
    .eq("player_id", userId)
    .order("created_at", { ascending: true });
  if (stored.error) throw stored.error;
  expect(rebuilt).toHaveLength(stored.data.length);
  expect(rebuilt.length).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < rebuilt.length; i++) {
    expect(rebuilt[i].match_id).toBe(stored.data[i].match_id);
    expect(rebuilt[i].rating_before).toBe(stored.data[i].rating_before);
    expect(rebuilt[i].rating_after).toBe(stored.data[i].rating_after);
    expect(rebuilt[i].k).toBe(stored.data[i].k);
  }
  // and the singles second step matches the engine directly
  const fresh = { rating: INITIAL_RATING, matchesPlayed: 0 };
  const first = doublesDeltas([fresh, fresh], [fresh, fresh], 6, 21);
  const aAfterFirst = Math.round(INITIAL_RATING + first.winners[0]);
  const cAfterFirst = Math.round(INITIAL_RATING + first.losers[0]);
  const second = singlesDeltas(
    { rating: aAfterFirst, matchesPlayed: 1 },
    { rating: cAfterFirst, matchesPlayed: 1 },
    3,
    21
  );
  expect(rebuilt[1].rating_after).toBe(Math.round(aAfterFirst + second.winner));
});
