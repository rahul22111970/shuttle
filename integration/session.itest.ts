// Integration tests for lib/session against the hosted project. Signs the
// app's own client in as real users; run via integration/run.sh.
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import {
  appendSessionEvent,
  closeSession,
  createGroup,
  createSession,
  getRoster,
  rsvpIn,
  rsvpOut,
} from "../lib/session";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(60000);

const stamp = Date.now();
let memberId: string, strangerId: string;
let sessionId: string, groupId: string;

async function signInAs(email: string) {
  await supabase.auth.signOut();
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  const verified = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: link.data.properties.hashed_token,
  });
  if (verified.error) throw verified.error;
}

beforeAll(async () => {
  const a = await admin.auth.admin.createUser({
    email: `itest-s-a-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  const c = await admin.auth.admin.createUser({
    email: `itest-s-c-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  if (a.error || c.error) throw a.error ?? c.error;
  memberId = a.data.user.id;
  strangerId = c.data.user.id;

  await signInAs(`itest-s-a-${stamp}@shuttle-itest.test`);
  // profiles must exist before groups reference them; upsertProfile throws
  // on failure instead of silently returning an error
  await upsertProfile({
    id: memberId,
    display_name: "Itest Member",
    phone: null,
    account_type: "player",
  });
  const group = await createGroup(`Itest Gang ${stamp}`);
  groupId = group.id;
  const session = await createSession(group.id, new Date(stamp + 86400000).toISOString());
  sessionId = session.id;
});

afterAll(async () => {
  await supabase.auth.signOut();
  // order matters: groups.captain_id and session_events.actor_id have no
  // on-delete action, so the group (cascading sessions and events) must go
  // before its captain's user; and deleteUser returns {error} without
  // throwing, so check it or leak residue on the shared project
  if (groupId) {
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) throw error;
  }
  for (const id of [memberId, strangerId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

it("rsvp_in puts you on the roster; rsvp_out takes you off (replay correctness)", async () => {
  await rsvpIn(sessionId);
  let roster = await getRoster(sessionId);
  expect(roster.attending).toContain(memberId);
  await rsvpOut(sessionId);
  roster = await getRoster(sessionId);
  expect(roster.attending).not.toContain(memberId);
  expect(roster.attending).toHaveLength(0);
});

it("concurrent_appends_get_distinct_seq: the advisory lock serialises rapid taps", async () => {
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      appendSessionEvent(sessionId, i % 2 === 0 ? "rsvp_in" : "rsvp_out")
    )
  );
  const seqs = results.map((e) => e.seq);
  expect(new Set(seqs).size).toBe(seqs.length); // all distinct
});

it("check_in implies attendance and survives replay", async () => {
  await appendSessionEvent(sessionId, "check_in");
  const roster = await getRoster(sessionId);
  expect(roster.attending).toContain(memberId);
  expect(roster.checkedIn).toContain(memberId);
});

it("session_rsvp_non_member_denied", async () => {
  await signInAs(`itest-s-c-${stamp}@shuttle-itest.test`);
  await upsertProfile({
    id: strangerId,
    display_name: "Itest Stranger",
    phone: null,
    account_type: "player",
  });
  await expect(rsvpIn(sessionId)).rejects.toMatchObject({ code: "42501" });
});

it("close writes the event first, then flips the plain-row status", async () => {
  await signInAs(`itest-s-a-${stamp}@shuttle-itest.test`);
  await closeSession(sessionId);
  const { data } = await supabase
    .from("sessions")
    .select("status")
    .eq("id", sessionId)
    .single<{ status: string }>();
  expect(data?.status).toBe("closed");
  const events = await supabase
    .from("session_events")
    .select("type")
    .eq("session_id", sessionId);
  expect(events.data?.some((e) => e.type === "session_closed")).toBe(true);
});
