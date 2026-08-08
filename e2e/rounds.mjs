// e2e for S1-17: the live night end to end. One real user through the UI,
// three fixture members seeded by admin; check in, empty-state copy, first
// round, court card pairings, tap into the scorer, score the round match
// out, standings update. 390px throughout.
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
const email = `e2e-rounds-${stamp}@shuttle-e2e.test`;
let userId, server, browser, failed, groupId;
const fixtureIds = [];

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

  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Night Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });
  await page.getByText("Session", { exact: true }).click();
  await page.getByPlaceholder("Group name").fill(`Rounds Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });

  // seed three more members before the night starts
  const g = await admin.from("groups").select("id").eq("name", `Rounds Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  const names = ["Bela", "Chirag", "Dev"];
  for (let i = 0; i < 3; i++) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-rounds-f${i}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    const prof = await admin.from("profiles").insert({
      id: u.data.user.id,
      display_name: names[i],
      account_type: "player",
    });
    if (prof.error) throw prof.error;
    const mem = await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
    if (mem.error) throw mem.error;
  }

  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText(/^Plan .*\d/).click();
  await page.getByText(/in the group/).waitFor({ timeout: 15000 });
  await page.getByText("I'm in").click();
  await page.getByText("Start the night").waitFor({ timeout: 15000 });
  await page.getByText("Start the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });

  // not enough check-ins yet: the no-checkins copy shows
  await page.getByText(/Four make a round/).waitFor({ timeout: 15000 });
  console.log("PASS no-checkins state has copy");

  // self checks in through the UI; fixtures check in via admin
  await page.getByText("I'm here").click();
  const s = await admin.from("sessions").select("id").eq("group_id", groupId).single();
  if (s.error) throw s.error;
  for (let i = 0; i < 3; i++) {
    const { error } = await admin.from("session_events").insert({
      session_id: s.data.id,
      seq: 100 + i,
      type: "check_in",
      actor_id: fixtureIds[i],
    });
    if (error) throw error;
  }
  await page.reload();
  await page.getByText("Everyone in? Pick tonight's format.").waitFor({ timeout: 15000 });
  console.log("PASS empty state before round 1 has copy");

  await page.getByText("Americano", { exact: true }).click();
  await page.getByText("Round 1").waitFor({ timeout: 15000 });
  console.log("PASS first round deals");

  // court card pairings equal the stored payload
  const ev = await admin
    .from("session_events")
    .select("payload")
    .eq("session_id", s.data.id)
    .eq("type", "round_generated")
    .single();
  if (ev.error) throw ev.error;
  const payload = ev.data.payload;
  const nameOf = async (id) => {
    if (id === userId) return "Night Runner";
    const idx = fixtureIds.indexOf(id);
    return names[idx];
  };
  const aNames = await Promise.all(payload.round.courts[0].pairs[0].map(nameOf));
  await page.getByText(aNames.join(" & ")).waitFor({ timeout: 15000 });
  console.log("PASS court card shows the engine pairing");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the round view");

  // tap into the scorer for that match and run side A out to 24-0
  await page.getByLabel("Court 1").click();
  await page.getByLabel("Point to side A").waitFor({ timeout: 15000 });
  console.log("PASS tapping the card opens the scorer");

  const digit = (idx, value) =>
    page.waitForFunction(
      ([i, v]) => {
        const zones = document.querySelectorAll('[aria-label^="Point to side"]');
        return zones.length === 2 && zones[i].textContent.includes(String(v));
      },
      [idx, value],
      { timeout: 15000 }
    );
  for (let i = 0; i < 24; i++) {
    await page.getByLabel("Point to side A").click();
    if (i < 23) await digit(0, i + 1);
  }
  await page.getByText("Side A takes it.").waitFor({ timeout: 20000 });
  await page.getByText("Back to the night").click();

  // standings update after the scored match: side a players carry 24, and
  // the Done card wears its final score as the hero
  await page.getByText("Tonight").waitFor({ timeout: 15000 });
  await page.getByText("24").first().waitFor({ timeout: 15000 });
  await page.getByText("24–0").waitFor({ timeout: 15000 });
  console.log("PASS standings update after a scored match");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Rounds Gang ${stamp}`).maybeSingle();
    groupId = g.data?.id;
  }
  if (groupId) {
    // rating rows reference matches with ON DELETE RESTRICT: sweep them
    // before the group delete cascades into matches
    const ms = await admin.from("matches").select("id").eq("group_id", groupId);
    if (ms.data && ms.data.length > 0) {
      await admin.from("rating_history").delete().in("match_id", ms.data.map((m) => m.id));
    }
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) console.error("cleanup group:", error.message);
  }
  for (const id of [userId, ...fixtureIds]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL rounds e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("rounds e2e: all assertions passed");
