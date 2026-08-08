// Integration tests for lib/ledger against the hosted project: the fixture
// sequence must yield the engine's exact nets, conservation must hold, and
// a non-member's expense must be refused.
import { createClient } from "@supabase/supabase-js";
import { pairKey, pairwiseNets } from "@shuttle/split";
import { supabase } from "../lib/supabase";
import { upsertProfile } from "../lib/profile";
import { createGroup } from "../lib/session";
import {
  addExpense,
  fetchGroupLedger,
  groupBalances,
  recordSettlement,
  toSplitEvents,
} from "../lib/ledger";

const admin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ADMIN_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

jest.setTimeout(120000);

const stamp = Date.now();
const email = `itest-ledger-${stamp}@shuttle-itest.test`;
const strangerEmail = `itest-ledger-s-${stamp}@shuttle-itest.test`;
let userId: string, strangerId: string, memberBId: string, groupId: string;

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
  for (const [address, name] of [
    [email, "Ledger A"],
    [strangerEmail, "Ledger Stranger"],
  ] as const) {
    const created = await admin.auth.admin.createUser({ email: address, email_confirm: true });
    if (created.error) throw created.error;
    if (address === email) userId = created.data.user.id;
    else strangerId = created.data.user.id;
    const prof = await admin.from("profiles").insert({
      id: created.data.user.id,
      display_name: name,
      account_type: "player",
    });
    if (prof.error) throw prof.error;
  }
  const b = await admin.auth.admin.createUser({
    email: `itest-ledger-b-${stamp}@shuttle-itest.test`,
    email_confirm: true,
  });
  if (b.error) throw b.error;
  memberBId = b.data.user.id;
  const bProf = await admin.from("profiles").insert({
    id: memberBId,
    display_name: "Ledger B",
    account_type: "player",
  });
  if (bProf.error) throw bProf.error;

  await signInAs(email);
  const group = await createGroup(`Ledger Gang ${stamp}`);
  groupId = group.id;
  const mem = await admin.from("group_members").insert({ group_id: groupId, player_id: memberBId });
  if (mem.error) throw mem.error;
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
  for (const id of [userId, strangerId, memberBId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
});

it("the fixture sequence yields the engine's exact nets, and money is conserved", async () => {
  // A pays 600 court for both; B pays 250 shuttles for both (recorded by A,
  // payer B — whoever opened their wallet); B hands A 100 in cash
  await addExpense(groupId, 60000, [userId, memberBId]);
  await addExpense(groupId, 25000, [userId, memberBId], { payerId: memberBId });
  await recordSettlement(groupId, memberBId, userId, 10000);

  const rows = await fetchGroupLedger(groupId);
  expect(rows).toHaveLength(3);

  // the engine, fed the same events directly, is the oracle
  const expected = pairwiseNets(toSplitEvents(rows));
  const { nets, perPlayer } = await groupBalances(groupId);
  expect(nets).toEqual(expected);

  // hand arithmetic: B owed A 30000, A owed B 12500, B paid 10000
  // -> B still owes A 30000 - 12500 - 10000 = 7500
  const key = pairKey(userId, memberBId);
  const value = nets.get(key) ?? 0;
  expect(Math.abs(value)).toBe(7500);
  const bOwesA = userId < memberBId ? value < 0 : value > 0;
  expect(bOwesA).toBe(true);

  // conservation: totals sum to zero, to the paise
  const sum = Object.values(perPlayer).reduce((a, b) => a + b, 0);
  expect(sum).toBe(0);
});

it("a settlement to a stranger is refused: phantoms are forever", async () => {
  await expect(
    recordSettlement(groupId, userId, strangerId, 100)
  ).rejects.toMatchObject({ code: "42501" });
});

it("ledger_insert_non_member_denied", async () => {
  await signInAs(strangerEmail);
  await expect(addExpense(groupId, 100, [strangerId])).rejects.toMatchObject({
    code: "42501",
  });
  await signInAs(email);
});
