// Integration tests for lib/rounds against the hosted project: determinism
// through the DB, payload-to-rows equality, and the mexicano round-2
// fixture. Fixture players are seeded by the admin client (service role
// bypasses RLS); only the generator signs in.
import { createClient } from "@supabase/supabase-js";
import { americanoRound, mexicanoRound, type NightConfig } from "@shuttle/rounds";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import { createGroup, createSession, fetchSessionEvents, rosterFromEvents } from "../lib/session";
import { generateRound, talliesForSession, ROUND_POINTS } from "../lib/rounds";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(120000);

const stamp = Date.now();
const email = `itest-rounds-${stamp}@shuttle-itest.test`;
let userId: string, groupId: string;
const fixtureIds: string[] = [];

async function seedFixturePlayers(count: number, tag = "a"): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const u = await admin.auth.admin.createUser({
      email: `itest-rounds-${tag}${i}-${stamp}@shuttle-itest.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    ids.push(u.data.user.id);
    const prof = await admin.from("profiles").insert({
      id: u.data.user.id,
      display_name: `Fixture ${i}`,
      account_type: "player",
    });
    if (prof.error) throw prof.error;
    const mem = await admin.from("group_members").insert({
      group_id: groupId,
      player_id: u.data.user.id,
    });
    if (mem.error) throw mem.error;
  }
  fixtureIds.push(...ids);
  return ids;
}

async function checkInAll(sessionId: string, playerIds: readonly string[]) {
  // admin seeds check_in events directly; service role is not bound by the
  // actor-honesty policy, which is exactly what fixtures need
  for (let i = 0; i < playerIds.length; i++) {
    const { error } = await admin.from("session_events").insert({
      session_id: sessionId,
      seq: 100 + i,
      type: "check_in",
      actor_id: playerIds[i],
    });
    if (error) throw error;
  }
}

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const verified = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error) throw verified.error;
  await upsertProfile({ id: userId, display_name: "Generator", phone: null, account_type: "player" });
  const group = await createGroup(`Rounds Gang ${stamp}`);
  groupId = group.id;
});

afterAll(async () => {
  await supabase.auth.signOut();
  if (groupId) {
    // rating rows reference matches with ON DELETE RESTRICT: sweep first
    const ratedMs = await admin.from("matches").select("id").eq("group_id", groupId);
    if (ratedMs.data && ratedMs.data.length > 0) {
      await admin.from("rating_history").delete().in("match_id", ratedMs.data.map((m) => m.id));
    }
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) throw error;
  }
  for (const id of [userId, ...fixtureIds]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

it("americano: payload matches rows exactly, and the DB reproduces the engine", async () => {
  const session = await createSession(groupId, new Date(stamp + 86400000).toISOString());
  const players = await seedFixturePlayers(4);
  await checkInAll(session.id, players);

  const payload = await generateRound(session.id, groupId, "americano", 1, 42);
  expect(payload.round.courts).toHaveLength(1);
  expect(payload.matchIds).toHaveLength(1);

  // rows equal payload: participants match the court pairing side for side
  const { data: parts, error } = await admin
    .from("match_participants")
    .select("player_id, side")
    .eq("match_id", payload.matchIds[0]);
  if (error) throw error;
  const bySide = (side: string) =>
    (parts ?? []).filter((p) => p.side === side).map((p) => p.player_id).sort();
  expect(bySide("a")).toEqual([...payload.round.courts[0].pairs[0]].sort());
  expect(bySide("b")).toEqual([...payload.round.courts[0].pairs[1]].sort());
  const { data: matchRow } = await admin
    .from("matches")
    .select("config, session_id")
    .eq("id", payload.matchIds[0])
    .single();
  expect(matchRow?.config).toEqual({ kind: "americano", totalPoints: ROUND_POINTS });
  expect(matchRow?.session_id).toBe(session.id);

  // determinism through the DB: rebuild every input from what is stored
  const events = await fetchSessionEvents(session.id);
  const roster = rosterFromEvents(events);
  const stored = events.find((e) => e.type === "round_generated")!
    .payload as unknown as typeof payload;
  const config: NightConfig = {
    players: [...roster.checkedIn],
    courts: stored.courts,
    seed: stored.seed,
  };
  expect(americanoRound(config, [])).toEqual(stored.round);
});

it("mexicano round 2 pairing matches the engine for the same tallies", async () => {
  const session = await createSession(groupId, new Date(stamp + 172800000).toISOString());
  const players = fixtureIds.slice(0, 4);
  await checkInAll(session.id, players);

  const r1 = await generateRound(session.id, groupId, "mexicano", 1, 7);

  // finish round 1's match 14-10 via the RPC (as the generator, a member)
  const finished = {
    config: { kind: "americano", totalPoints: ROUND_POINTS },
    points: [],
    games: [],
    gamesWon: { a: 0, b: 0 },
    score: { a: 14, b: 10 },
    finished: true,
    winner: "a",
    events: [],
  };
  const { error: rpcError } = await supabase
    .rpc("append_match_event", {
      p_match_id: r1.matchIds[0],
      p_expected_seq: 1,
      p_event: { type: "result", payload: { score: { a: 14, b: 10 } } },
      p_snapshot: finished,
    })
    .single();
  if (rpcError) throw rpcError;

  const talliesBefore = await talliesForSession(session.id);
  const r2 = await generateRound(session.id, groupId, "mexicano", 1, 7);

  // the fixture: the engine, called directly with independently rebuilt
  // inputs, must produce the identical round 2
  const events = await fetchSessionEvents(session.id);
  const roster = rosterFromEvents(events);
  const config: NightConfig = { players: [...roster.checkedIn], courts: 1, seed: 7 };
  const expected = mexicanoRound(config, [r1.round], talliesBefore);
  expect(r2.round).toEqual(expected);

  // and the winners' tallies moved: side a of round 1 carries 14 each
  for (const p of r1.round.courts[0].pairs[0]) {
    expect(talliesBefore[p]).toBe(14);
  }
});

it("a mid-night dropout does not crash the next mexicano round", async () => {
  const session = await createSession(groupId, new Date(stamp + 259200000).toISOString());
  const five = await seedFixturePlayers(5, "d");
  await checkInAll(session.id, five);
  const r1 = await generateRound(session.id, groupId, "mexicano", 1, 11);

  // one round-1 player leaves: an rsvp_out AFTER their check_in
  const leaver = r1.round.courts[0].pairs[0][0];
  const { error } = await admin.from("session_events").insert({
    session_id: session.id,
    seq: 200,
    type: "rsvp_out",
    actor_id: leaver,
  });
  if (error) throw error;

  // finish round 1 so the leaver owns tally points
  const { error: rpcError } = await supabase
    .rpc("append_match_event", {
      p_match_id: r1.matchIds[0],
      p_expected_seq: 1,
      p_event: { type: "result", payload: { score: { a: 12, b: 12 } } },
      p_snapshot: {
        config: { kind: "americano", totalPoints: ROUND_POINTS },
        points: [], games: [], gamesWon: { a: 0, b: 0 },
        score: { a: 12, b: 12 }, finished: true, winner: null, events: [],
      },
    })
    .single();
  if (rpcError) throw rpcError;

  const r2 = await generateRound(session.id, groupId, "mexicano", 1, 11);
  const onCourt = r2.round.courts.flatMap((c) => c.pairs.flat());
  expect(onCourt).not.toContain(leaver);
  expect([...onCourt, ...r2.round.resting]).toHaveLength(4);
});
