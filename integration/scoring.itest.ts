// Integration tests for lib/scoring against the hosted project: the
// acceptance criteria of S1-14 plus S1-13's deferred replay-equality proof.
import { createClient } from "@supabase/supabase-js";
import { PRESETS } from "@shuttle/score";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import { createGroup } from "../lib/session";
import {
  fetchMatch,
  fetchMatchEvents,
  quickLog,
  replayMatch,
  scorePoint,
  StaleSeqError,
  startMatch,
  undoPoint,
  type LiveMatch,
} from "../lib/scoring";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(120000);

const stamp = Date.now();
const email = `itest-score-${stamp}@shuttle-itest.test`;
let userId: string, groupId: string;

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
  await upsertProfile({ id: userId, display_name: "Scorer", phone: null, account_type: "player" });
  const group = await createGroup(`Score Gang ${stamp}`);
  groupId = group.id;
});

afterAll(async () => {
  await supabase.auth.signOut();
  if (groupId) {
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) throw error;
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
});

it("scores a full 1×21 golden game; projection winner equals engine winner", async () => {
  let live = await startMatch(groupId, PRESETS.casual1x21, [
    { player_id: userId, side: "a" },
  ]);
  // a runs to 21 while b picks up 5
  for (let i = 0; i < 5; i++) {
    live = await scorePoint(live, "a");
    live = await scorePoint(live, "b");
  }
  while (!live.state.finished) live = await scorePoint(live, "a");

  expect(live.state.winner).toBe("a");
  const row = await fetchMatch(live.matchId);
  expect(row?.status).toBe("complete");
  expect(row?.snapshot?.winner).toBe(live.state.winner);
  expect(row?.snapshot?.games).toEqual(live.state.games);
});

it("undo removes the last point from engine state AND the stored snapshot", async () => {
  let live = await startMatch(groupId, PRESETS.casual1x21, []);
  live = await scorePoint(live, "a");
  live = await scorePoint(live, "a");
  live = await scorePoint(live, "b");
  expect(live.state.score).toEqual({ a: 2, b: 1 });

  live = await undoPoint(live);
  expect(live.state.score).toEqual({ a: 2, b: 0 });

  const row = await fetchMatch(live.matchId);
  expect(row?.snapshot?.score).toEqual({ a: 2, b: 0 });
  // the log keeps every event: 3 points + 1 undo
  const events = await fetchMatchEvents(live.matchId);
  expect(events).toHaveLength(4);
  expect(events[3].type).toBe("undo");
});

it("quick-log creates match, result event and snapshot in one flow", async () => {
  const row = await quickLog(groupId, PRESETS.casual1x21, [], { a: 21, b: 14 });
  expect(row.status).toBe("complete");
  const stored = await fetchMatch(row.id);
  expect(stored?.status).toBe("complete");
  expect(stored?.snapshot?.winner).toBe("a");
  const events = await fetchMatchEvents(row.id);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe("result");
  expect(events[0].payload).toEqual({ score: { a: 21, b: 14 } });
});

it("a stale seq surfaces as the typed error, not a throw-through", async () => {
  let live = await startMatch(groupId, PRESETS.casual1x21, []);
  live = await scorePoint(live, "a");
  // a second device stuck on the old handle tries seq 1 again
  const staleHandle: LiveMatch = { matchId: live.matchId, state: live.state, nextSeq: 1 };
  await expect(scorePoint(staleHandle, "b")).rejects.toBeInstanceOf(StaleSeqError);
});

it("match_snapshot_replay_equality: TS replay of the log equals the stored snapshot", async () => {
  // a deterministic pseudo-random walk with undos sprinkled in
  let live = await startMatch(groupId, PRESETS.bwf3x21, []);
  let x = 7;
  for (let i = 0; i < 60 && !live.state.finished; i++) {
    x = (x * 31 + 17) % 97;
    if (x % 11 === 0 && live.state.points.length > 0) {
      live = await undoPoint(live);
    } else {
      live = await scorePoint(live, x % 2 === 0 ? "a" : "b");
    }
  }
  const events = await fetchMatchEvents(live.matchId);
  const replayed = replayMatch(PRESETS.bwf3x21, events);
  const row = await fetchMatch(live.matchId);
  expect(replayed).toEqual(live.state);
  expect(row?.snapshot).toEqual(JSON.parse(JSON.stringify(replayed)));
});
