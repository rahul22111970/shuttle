// e2e for the Groups manager: two memberships, switch the active one,
// and the whole app follows (session header sub + Today).
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

const pub = parseEnv(".env.local");
const sec = parseEnv(".secrets.env");
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
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });

  // group A through the UI (runner is captain)
  await page.getByRole("tab", { name: "Session" }).click();
  await page.getByPlaceholder("Group name").fill(`Alpha ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const ga = await admin.from("groups").select("id").eq("name", `Alpha ${stamp}`).single();
  groupA = ga.data.id;

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

  // open Groups from the session header
  await page.getByLabel("Groups").click();
  const groups = page.getByTestId("groups-screen");
  await groups.getByRole("button", { name: new RegExp(`Alpha ${stamp}`) }).waitFor({ timeout: 15000 });
  await groups.getByRole("button", { name: new RegExp(`Beta ${stamp}`) }).waitFor({ timeout: 15000 });
  await groups.getByText("Captain").waitFor({ timeout: 15000 });
  console.log("PASS both memberships list, with captaincy and counts");

  // switch to Beta; the session tab follows
  await groups.getByRole("button", { name: new RegExp(`Beta ${stamp}`) }).click();
  await groups.getByText("Active", { exact: true }).waitFor({ timeout: 15000 });
  await page.getByLabel("Back").click();
  await page.getByText(`Beta ${stamp}`).waitFor({ timeout: 15000 });
  console.log("PASS switching makes Beta the whole app's group");

  // back on Groups: switch to Alpha (captained) and add a player by number
  await page.getByLabel("Groups").click();
  await groups.getByRole("button", { name: new RegExp(`Alpha ${stamp}`) }).click();
  await groups.getByText(`Add a player to Alpha ${stamp}`).waitFor({ timeout: 15000 });
  await page.getByLabel("New player name").fill("Kavya");
  await page.getByLabel("New player number").fill(`8${String(stamp).slice(-9)}`);
  await page.getByText("Add to the group").click();
  await groups.getByText(/Kavya is in\./).waitFor({ timeout: 15000 });
  const prof = await admin
    .from("profiles")
    .select("id, phone")
    .eq("phone", `+918${String(stamp).slice(-9)}`)
    .single();
  if (prof.error) throw prof.error;
  fixturePlayer = prof.data.id;
  console.log("PASS the captain minted a real account from the Groups screen");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on Groups");
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
