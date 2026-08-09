// e2e for the Groups home + room Members: the list shows every membership
// with captaincy, a room opens per group, the captain adds a player by
// name + number, adds an existing player with one tap, and removes a
// member with a confirming second tap. A non-captain sees no admin tools.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const parseEnv = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );

const pub = parseEnv(process.env.SHUTTLE_ENV_FILE ?? ".env.local");
const sec = parseEnv(process.env.SHUTTLE_SECRETS_FILE ?? ".secrets.env");
const APP = "http://localhost:3000";
const admin = createClient(pub.EXPO_PUBLIC_SUPABASE_URL, sec.SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const email = `e2e-groups-${stamp}@shuttle-e2e.test`;
let userId, captainB, fixturePlayer, server, browser, failed, groupA, groupB;

try {
  server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: APP },
  });
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Groups Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  // group A through the UI (runner is captain); creating opens the room
  await page.getByPlaceholder("Group name").fill(`Alpha ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const ga = await admin.from("groups").select("id").eq("name", `Alpha ${stamp}`).single();
  groupA = ga.data.id;
  await page.getByRole("button", { name: "Back" }).click();

  // group B admin-side: fixture captain, runner a member
  const cap = await admin.auth.admin.createUser({
    email: `e2e-groups-cap-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  captainB = cap.data.user.id;
  await admin.from("profiles").insert({ id: captainB, display_name: "Cap B", account_type: "player" });
  const gb = await admin
    .from("groups")
    .insert({ name: `Beta ${stamp}`, captain_id: captainB })
    .select("id")
    .single();
  groupB = gb.data.id;
  await admin.from("group_members").insert([
    { group_id: groupB, player_id: captainB },
    { group_id: groupB, player_id: userId },
  ]);

  // the home list carries both memberships, captaincy and the night line
  const home = page.getByTestId("groups-screen");
  await home.getByRole("button", { name: new RegExp(`Alpha ${stamp}`) }).waitFor({ timeout: 15000 });
  await home.getByRole("button", { name: new RegExp(`Beta ${stamp}`) }).waitFor({ timeout: 15000 });
  await home.getByText("Captain").waitFor({ timeout: 15000 });
  await home.getByText("Nothing planned").first().waitFor({ timeout: 15000 });
  console.log("PASS both memberships list, with captaincy and night lines");

  // a non-captain's room has no admin tools on Members
  await home.getByRole("button", { name: new RegExp(`Beta ${stamp}`) }).click();
  const room = page.getByTestId("group-room");
  await room.getByRole("button", { name: "Members", exact: true }).click();
  await room.getByText("2 players").waitFor({ timeout: 15000 });
  await room.getByText("Cap B").waitFor({ timeout: 15000 });
  if ((await room.getByText("Add a player").count()) > 0)
    throw new Error("non-captain sees the add card");
  if ((await room.getByLabel(/^Remove /).count()) > 0)
    throw new Error("non-captain sees remove buttons");
  console.log("PASS a member's room lists players without admin tools");

  // the captain's room: add by name + number mints a real account
  await page.getByRole("button", { name: "Back" }).click();
  await home.getByRole("button", { name: new RegExp(`Alpha ${stamp}`) }).click();
  await room.getByRole("button", { name: "Members", exact: true }).click();
  await room.getByText("1 player", { exact: true }).waitFor({ timeout: 15000 });
  await room.getByLabel("New player name").fill("Kavya");
  await room.getByLabel("New player number").fill(`8${String(stamp).slice(-9)}`);
  await room.getByText("Add to the group").click();
  await room.getByText(/Kavya is in\./).waitFor({ timeout: 15000 });
  const prof = await admin
    .from("profiles")
    .select("id, phone")
    .eq("phone", `+918${String(stamp).slice(-9)}`)
    .single();
  if (prof.error) throw prof.error;
  fixturePlayer = prof.data.id;
  console.log("PASS the captain minted a real account from Members");

  // the group's own code is on the card, so the captain can share it
  const gaCode = await admin.from("groups").select("code").eq("id", groupA).single();
  await room.getByText(gaCode.data.code).waitFor({ timeout: 15000 });
  await room.getByText("Everyone here signs in with their number and this code.").waitFor({ timeout: 15000 });
  console.log("PASS the group code is readable on Members");

  // existing players from other groups join with one tap
  await room.getByLabel("Add Cap B").click();
  // the chip only leaves after the insert lands and the section reloads
  await room.getByLabel("Add Cap B").waitFor({ state: "detached", timeout: 15000 });
  const joined = await admin
    .from("group_members")
    .select("player_id", { count: "exact", head: true })
    .eq("group_id", groupA);
  if ((joined.count ?? 0) !== 3) throw new Error(`Alpha has ${joined.count} members, expected 3`);
  console.log("PASS an existing player joined Alpha with one tap");

  // remove takes two taps and leaves everything but the membership alone
  await room.getByLabel("Remove Kavya").click();
  await room.getByLabel("Really remove Kavya").click();
  await room.getByText("2 players").waitFor({ timeout: 15000 });
  const after = await admin
    .from("group_members")
    .select("player_id")
    .eq("group_id", groupA);
  if (after.data.some((r) => r.player_id === fixturePlayer))
    throw new Error("Kavya still a member after remove");
  console.log("PASS the captain removed a member with a confirming tap");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the room");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  for (const gid of [groupA, groupB]) {
    if (!gid) continue;
    const ms = await admin.from("matches").select("id").eq("group_id", gid);
    if (ms.data && ms.data.length > 0) {
      await admin.from("rating_history").delete().in("match_id", ms.data.map((m) => m.id));
    }
    const { error } = await admin.from("groups").delete().eq("id", gid);
    if (error) console.error("cleanup group:", error.message);
  }
  for (const id of [userId, captainB, fixturePlayer]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL groups e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("groups e2e: all assertions passed");
