// e2e for bulk score entry: paste a night with a clean doubles line and an
// ambiguous "rahul" line, watch the preview resolve one and refuse the
// other, add the one game, then prove the write in the database.
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
const email = `e2e-bulk-${stamp}@shuttle-e2e.test`;
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

  // onboard as the first Rahul
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Rahul Pareek");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  // the group and its roster, seeded by admin: a second Rahul to force the
  // clash, Sai Kiran for the two-word first name, Gautam as the plain case
  const g = await admin
    .from("groups")
    .insert({ name: `Bulk Gang ${stamp}`, captain_id: userId })
    .select("id")
    .single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  await admin.from("group_members").insert({ group_id: groupId, player_id: userId });
  const names = ["Rahul Deo", "Sai Kiran", "Gautam"];
  for (const [i, name] of names.entries()) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-bulk-f${i}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin
      .from("profiles")
      .insert({ id: u.data.user.id, display_name: name, account_type: "player" });
    await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
  }
  const [deoId, saiId, gautamId] = fixtureIds;

  // straight to the screen other code links to
  await page.goto(`${APP}/bulk-log`);
  const bulk = page.getByTestId("bulk-log");
  await bulk
    .getByPlaceholder("Rahul & Sai 21-15 Gautam & Mitrajit")
    .waitFor({ timeout: 15000 });

  await bulk
    .getByPlaceholder("Rahul & Sai 21-15 Gautam & Mitrajit")
    .fill("rahul p & sai 21-15 rahul deo & gautam\nrahul 21-3 gautam");

  // the preview: the doubles line resolved to full names, winner first
  await bulk
    .getByText("Rahul Pareek & Sai Kiran d. Rahul Deo & Gautam · 21–15")
    .waitFor({ timeout: 15000 });
  console.log("PASS the preview resolves fuzzy names to full names");

  // the ambiguous line refused, with both Rahuls on offer
  await bulk
    .getByText("Two Rahuls in this group. Write 'Rahul Deo' or 'Rahul Pareek'.")
    .waitFor({ timeout: 15000 });
  console.log("PASS the two-Rahuls clash names the fix");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on bulk log");

  await bulk.getByText("Add 1 game", { exact: true }).click();
  await bulk.waitFor({ state: "hidden", timeout: 15000 });
  console.log("PASS adding routes back off the screen");

  // the write, checked in the database
  let match = null;
  for (let i = 0; i < 50 && !match; i++) {
    const m = await admin
      .from("matches")
      .select("id, status, snapshot, match_participants(player_id, side)")
      .eq("group_id", groupId);
    if (m.error) throw m.error;
    if (m.data.length > 1) throw new Error(`expected one match, got ${m.data.length}`);
    match = m.data[0] ?? null;
    if (!match) await new Promise((r) => setTimeout(r, 200));
  }
  if (!match) throw new Error("no match row appeared");
  if (match.status !== "complete") throw new Error(`status ${match.status}`);
  const snap = match.snapshot;
  if (snap.games.length !== 1 || snap.games[0].a !== 21 || snap.games[0].b !== 15)
    throw new Error(`snapshot games ${JSON.stringify(snap.games)}`);
  if (snap.winner !== "a") throw new Error(`winner ${snap.winner}`);
  const sides = Object.fromEntries(match.match_participants.map((p) => [p.player_id, p.side]));
  if (
    sides[userId] !== "a" ||
    sides[saiId] !== "a" ||
    sides[deoId] !== "b" ||
    sides[gautamId] !== "b"
  )
    throw new Error(`participants ${JSON.stringify(sides)}`);
  console.log("PASS one complete match with the parsed sides and 21-15 snapshot");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
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
  console.error("FAIL bulk-log e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("bulk-log e2e: all assertions passed");
