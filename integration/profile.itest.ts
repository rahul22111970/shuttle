// Integration tests for lib/profile against the hosted project, run via
// integration/run.sh (which injects the real env; CI never runs these).
// Signs the app's own singleton client in as real users, so the functions
// under test are the exact ones the app ships.
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { getProfile, upsertProfile } from "../lib/profile";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(30000);

const stamp = Date.now();
let userA: string, userB: string;

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
    email: `itest-a-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  const b = await admin.auth.admin.createUser({
    email: `itest-b-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  if (a.error || b.error) throw a.error ?? b.error;
  userA = a.data.user.id;
  userB = b.data.user.id;
});

afterAll(async () => {
  await supabase.auth.signOut();
  // deleting the users cascades their profiles; no residue on the shared DB
  if (userA) await admin.auth.admin.deleteUser(userA);
  if (userB) await admin.auth.admin.deleteUser(userB);
});

it("upsert own row succeeds and round-trips", async () => {
  await signInAs(`itest-a-${stamp}@shuttle-itest.test`);
  const written = await upsertProfile({
    id: userA,
    display_name: "Itest A",
    phone: `+91${String(stamp).slice(-10)}`,
    account_type: "player",
  });
  expect(written.id).toBe(userA);
  const read = await getProfile();
  expect(read).not.toBeNull();
  expect(read?.display_name).toBe("Itest A");
  expect(read?.phone).toBe(`+91${String(stamp).slice(-10)}`);
  expect(read?.account_type).toBe("player");
});

it("profile_upsert_wrong_user_denied", async () => {
  await signInAs(`itest-b-${stamp}@shuttle-itest.test`);
  await expect(
    upsertProfile({
      id: userA, // B writing under A's id: RLS must refuse
      display_name: "Impostor",
      phone: null,
      account_type: "player",
    })
  ).rejects.toMatchObject({ code: "42501" });
});
