// e2e for the game log: seeded games across three days; the window chips
// filter, the days group, the counts are honest.
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
const email = `e2e-games-${stamp}@shuttle-e2e.test`;
let userId, fixtureId, server, browser, failed, groupId;

const CASUAL = { kind: "standard", bestOf: 1, game: { pointsToWin: 21, settingAt: null, cap: null }, midGameIntervalAt: null };

async function seedMatch(score, daysAgo) {
  const created = new Date(Date.now() - daysAgo * 864e5).toISOString();
  const winner = score.a > score.b ? "a" : "b";
  const m = await admin
    .from("matches")
    .insert({
      group_id: groupId, status: "complete", config: CASUAL, created_by: userId, created_at: created,
      snapshot: { config: CASUAL, points: [], games: [score], gamesWon: { a: winner === "a" ? 1 : 0, b: winner === "b" ? 1 : 0 }, score: { a: 0, b: 0 }, finished: true, winner, events: [], quickLog: true },
    })
    .select("id").single();
  if (m.error) throw m.error;
  await admin.from("match_participants").insert([
    { match_id: m.data.id, player_id: userId, side: "a" },
    { match_id: m.data.id, player_id: fixtureId, side: "b" },
  ]);
  const ev = await admin.from("match_events").insert({
    match_id: m.data.id, seq: 1, type: "result", payload: { score }, scorer_id: userId,
  });
  if (ev.error) throw ev.error;
}

try {
  server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.data.user.id;
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: APP } });
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Log Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`Log Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const g = await admin.from("groups").select("id").eq("name", `Log Gang ${stamp}`).single();
  groupId = g.data.id;
  const f = await admin.auth.admin.createUser({ email: `e2e-games-f-${stamp}@shuttle-e2e.test`, email_confirm: true });
  fixtureId = f.data.user.id;
  await admin.from("profiles").insert({ id: fixtureId, display_name: "Bela", account_type: "player" });
  await admin.from("group_members").insert({ group_id: groupId, player_id: fixtureId });

  await seedMatch({ a: 21, b: 15 }, 0);
  await seedMatch({ a: 12, b: 21 }, 4);
  await seedMatch({ a: 21, b: 9 }, 20);

  await page.getByRole("button", { name: "Games", exact: true }).click();
  const log = page.getByTestId("group-room");
  await log.getByText("2 games.").waitFor({ timeout: 15000 });
  await log.getByText("Log Runner d. Bela").waitFor({ timeout: 15000 });
  console.log("PASS the week window holds two games incl. today's");

  await log.getByRole("button", { name: "Month" }).click();
  await log.getByText("3 games.").waitFor({ timeout: 15000 });
  console.log("PASS the month window finds the older game");

  await log.getByRole("button", { name: "Today", exact: true }).click();
  await log.getByText("1 game.", { exact: true }).waitFor({ timeout: 15000 });
  await log.getByText("Log Runner d. Bela").waitFor({ timeout: 15000 });
  console.log("PASS today's window shows only today's win, winner-first");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the game log");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (groupId) {
    const ms = await admin.from("matches").select("id").eq("group_id", groupId);
    if (ms.data && ms.data.length > 0) {
      await admin.from("rating_history").delete().in("match_id", ms.data.map((m) => m.id));
    }
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
  console.error("FAIL games e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("games e2e: all assertions passed");
