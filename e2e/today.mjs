// e2e for S1-21: the Today home with seeded data. The S1-15 condition
// comes due here: a LIVE-SCORED match must appear in the feed. Plus the
// S1-20 debtor-path carry: the balance summary from the debtor's side.
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
const email = `e2e-today-${stamp}@shuttle-e2e.test`;
let userId, server, browser, failed, groupId, fixtureId;

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
  if (link.error) throw link.error;

  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  // onboard and build the night through the UI
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Today Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });
  console.log("PASS the no-group empty state carries its copy");

  await page.getByText("Session", { exact: true }).click();
  await page.getByPlaceholder("Group name").fill(`Today Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText("I'm in").click();
  await page.getByText("Start the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  await page.getByText("I'm here").click();
  await page.getByText("1 checked in", { exact: true }).waitFor({ timeout: 15000 });

  // LIVE-SCORE a casual game: the S1-15 condition's subject
  await page.getByText("Score a game").click();
  await page.getByLabel("Point to side A").waitFor({ timeout: 15000 });
  const digit = (idx, value) =>
    page.waitForFunction(
      ([i, v]) => {
        const zones = document.querySelectorAll('[aria-label^="Point to side"]');
        return zones.length === 2 && zones[i].textContent.includes(String(v));
      },
      [idx, value],
      { timeout: 15000 }
    );
  for (let i = 0; i < 21; i++) {
    await page.getByLabel("Point to side A").click();
    if (i < 20) await digit(0, i + 1);
  }
  await page.getByText("Side A takes it.").waitFor({ timeout: 20000 });
  await page.getByText("Back to the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });

  // seed a debt: fixture B paid 500 for both -> Runner owes 250
  const g = await admin.from("groups").select("id").eq("name", `Today Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  const u = await admin.auth.admin.createUser({
    email: `e2e-today-f-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  if (u.error) throw u.error;
  fixtureId = u.data.user.id;
  await admin.from("profiles").insert({ id: fixtureId, display_name: "Bela", account_type: "player" });
  await admin.from("group_members").insert({ group_id: groupId, player_id: fixtureId });
  const exp = await admin.from("ledger_events").insert({
    group_id: groupId,
    seq: 1,
    type: "expense",
    payer_id: fixtureId,
    amount_paise: 50000,
    participant_ids: [userId, fixtureId],
    created_by: fixtureId,
  });
  if (exp.error) throw exp.error;

  // Today: every card with data, every action live
  await page.getByText("Today", { exact: true }).click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  console.log("PASS the session card shows the live night");

  // debtor-path balance equals engine output for the seed: 50000/2 = 25000
  await page.getByText("You owe ₹250").waitFor({ timeout: 15000 });
  console.log("PASS the balance equals the engine output, debtor side");

  // the live-scored match is in the feed (S1-15 condition)
  await page.getByText("Side A · Side B").waitFor({ timeout: 15000 });
  await page.getByText("21–0").waitFor({ timeout: 15000 });
  console.log("PASS the live-scored match appears in the feed");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on Today");

  // actions navigate: ledger opens the session tab, log-a-game opens the door
  await page.getByText("Open the ledger").click();
  await page.getByText("Add your UPI ID so the group can pay you.").waitFor({ timeout: 15000 });
  console.log("PASS the money card action lands on the ledger");
  await page.getByText("Today", { exact: true }).click();
  await page.getByText("Log a game").click();
  await page.getByText("Quick log arrives next.").waitFor({ timeout: 15000 });
  console.log("PASS the quick-log door opens");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Today Gang ${stamp}`).maybeSingle();
    groupId = g.data?.id;
  }
  if (groupId) {
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) console.error("cleanup group:", error.message);
  }
  for (const id of [userId, fixtureId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL today e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("today e2e: all assertions passed");
