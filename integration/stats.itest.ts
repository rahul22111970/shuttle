// Integration for lib/stats fetch: one player's complete matches come back
// across TWO different groups, most recent first, with the viewer's side
// and partners resolved — the S1-23 cross-group acceptance.
import { createClient } from "@supabase/supabase-js";
import { PRESETS } from "@shuttle/score";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import { createGroup } from "../lib/session";
import { quickLog } from "../lib/scoring";
import { fetchPlayedMatches, winPct } from "../lib/stats";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(120000);

const stamp = Date.now();
const email = `itest-stats-${stamp}@shuttle-itest.test`;
let userId: string, partnerId: string;
const groupIds: string[] = [];

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
  const partner = await admin.auth.admin.createUser({
    email: `itest-stats-p-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  if (partner.error) throw partner.error;
  partnerId = partner.data.user.id;
  await admin
    .from("profiles")
    .insert({ id: partnerId, display_name: "Partner", account_type: "player" });

  await signInAs(email);
  await upsertProfile({ id: userId, display_name: "Stats", phone: null, account_type: "player" });
  for (const name of [`Stats A ${stamp}`, `Stats B ${stamp}`]) {
    const g = await createGroup(name);
    groupIds.push(g.id);
  }
  const gm = await admin
    .from("group_members")
    .insert({ group_id: groupIds[0], player_id: partnerId });
  if (gm.error) throw gm.error;
});

afterAll(async () => {
  // groups before users, always (itest cleanup doctrine)
  for (const gid of groupIds) {
    const { error } = await admin.from("groups").delete().eq("id", gid);
    if (error) console.error("cleanup group:", error.message);
  }
  for (const id of [userId, partnerId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
});

it("returns one player's matches across two groups, sides and partners resolved", async () => {
  // group A: a doubles win with the partner; group B: a singles loss
  await quickLog(
    groupIds[0],
    PRESETS.casual1x21,
    [
      { player_id: userId, side: "a" },
      { player_id: partnerId, side: "a" },
    ],
    { a: 21, b: 12 }
  );
  await quickLog(groupIds[1], PRESETS.casual1x21, [{ player_id: userId, side: "b" }], {
    a: 21,
    b: 9,
  });

  const played = await fetchPlayedMatches(userId);
  expect(played).toHaveLength(2);
  expect(new Set(played.map((m) => m.groupId))).toEqual(new Set(groupIds));
  // most recent first: the group-B loss was logged last
  expect(played[0].groupId).toBe(groupIds[1]);
  expect(played[0].side).toBe("b");
  expect(played[0].winner).toBe("a");
  expect(played[0].partnerIds).toEqual([]);
  const win = played.find((m) => m.groupId === groupIds[0]);
  expect(win?.side).toBe("a");
  expect(win?.winner).toBe("a");
  expect(win?.partnerIds).toEqual([partnerId]);
  // one win one loss, both decided
  expect(winPct(played)).toBe(50);
});
