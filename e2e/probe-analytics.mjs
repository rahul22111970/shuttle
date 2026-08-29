// Visual probe for the analytics surfaces: seed a group with quick-logged
// games, one deuce game, one live-scored comeback and a decay row, then
// screenshot the Stats tab and a player card at phone size. Asserts the
// SVG rating line actually painted (token resolution on web).
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
let userId, server, browser, failed, groupId;
const fixtureIds = [];

const CONFIG = {
  kind: "standard",
  bestOf: 1,
  game: { pointsToWin: 21, settingAt: 20, cap: 30 },
  midGameIntervalAt: 11,
};

const snapshotOf = (a, b, points = []) => ({
  config: CONFIG,
  points,
  games: [{ a, b }],
  gamesWon: a > b ? { a: 1, b: 0 } : { a: 0, b: 1 },
  score: { a: 0, b: 0 },
  finished: true,
  winner: a > b ? "a" : "b",
  events: [],
  serving: null,
  serverNumber: null,
});

try {
  server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const created = await admin.auth.admin.createUser({
    email: `e2e-viz-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `e2e-viz-${stamp}@shuttle-e2e.test`,
    options: { redirectTo: APP },
  });
  if (link.error) throw link.error;

  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Rahul Probe");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  const g = await admin
    .from("groups")
    .insert({ name: `Viz Gang ${stamp}`, captain_id: userId })
    .select("id")
    .single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  await admin.from("group_members").insert({ group_id: groupId, player_id: userId });
  for (const [i, name] of ["Sai Kiran", "Gautam"].entries()) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-viz-f${i}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin
      .from("profiles")
      .insert({ id: u.data.user.id, display_name: name, account_type: "player" });
    await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
  }
  const [saiId, gautamId] = fixtureIds;

  // three games across two weeks: a plain win, a deuce win, a live-scored
  // comeback (0-5 down, then 21 straight)
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
  const comebackPoints = [..."bbbbb"].map(() => "b").concat(Array(21).fill("a"));
  const seed = [
    { a: 21, b: 15, points: [], at: day(9), me: "a", opp: saiId },
    { a: 22, b: 20, points: [], at: day(2), me: "a", opp: saiId },
    { a: 21, b: 5, points: comebackPoints, at: day(1), me: "a", opp: gautamId },
  ];
  let rating = 1200;
  for (const s of seed) {
    const m = await admin
      .from("matches")
      .insert({
        group_id: groupId,
        config: CONFIG,
        status: "complete",
        snapshot: snapshotOf(s.a, s.b, s.points),
        created_by: userId,
        created_at: s.at,
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    await admin.from("match_participants").insert([
      { match_id: m.data.id, player_id: userId, side: "a" },
      { match_id: m.data.id, player_id: s.opp, side: "b" },
    ]);
    const h = await admin.from("rating_history").insert([
      {
        player_id: userId, match_id: m.data.id, group_id: groupId,
        rating_before: rating, rating_after: rating + 16, k: 64,
        created_by: userId, created_at: s.at,
      },
      {
        player_id: s.opp, match_id: m.data.id, group_id: groupId,
        rating_before: 1200, rating_after: 1184, k: 64,
        created_by: userId, created_at: s.at,
      },
    ]);
    if (h.error) throw h.error;
    rating += 16;
  }
  // a decay week in the middle of the viewer's chain
  const dec = await admin.from("rating_history").insert({
    player_id: userId, group_id: groupId, rating_before: rating,
    rating_after: rating - 8, kind: "decay", week: "2026-08-17",
    created_at: day(0),
  });
  if (dec.error) throw dec.error;

  await page.goto(`${APP}/group/${groupId}`);
  await page.getByRole("tab", { name: "Stats" }).click();
  await page.getByText("Rhythm").waitFor({ timeout: 15000 });
  await page.getByText("This week", { exact: true }).waitFor({ timeout: 15000 });
  console.log("PASS stats tab shows Rhythm and This week");
  // let the leaderboard's staggered entry finish, then prove a row landed
  await page.waitForTimeout(800);
  const row = page.getByTestId(`board-row-${userId}`);
  await row.waitFor({ timeout: 15000 });
  if (!(await row.isVisible())) throw new Error("leaderboard row not visible");
  await page.getByText("3-0", { exact: true }).waitFor({ timeout: 5000 });
  console.log("PASS leaderboard rows visible with records");
  await page.screenshot({ path: "/tmp/probe-stats.png", fullPage: true });

  await page.goto(`${APP}/player/${userId}`);
  await page.getByText("Head to head").waitFor({ timeout: 15000 });
  await page.getByText("Hollow dots are idle weeks.", { exact: false }).waitFor({ timeout: 15000 });
  // the SVG painted with real colours, not ignored var() attributes
  const svg = await page.evaluate(() => {
    const path = document.querySelector("svg path");
    if (!path) return { ok: false, why: "no path" };
    const stroke = path.getAttribute("stroke") ?? "";
    return { ok: stroke.startsWith("#") || stroke.startsWith("rgb"), stroke };
  });
  if (!svg.ok) throw new Error(`rating line stroke unresolved: ${JSON.stringify(svg)}`);
  console.log(`PASS rating line painted (stroke ${svg.stroke})`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/probe-player.png", fullPage: true });
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (groupId) {
    await admin.from("rating_history").delete().eq("group_id", groupId);
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
  console.error("FAIL probe:", failed.message ?? failed);
  process.exit(1);
}
console.log("probe-analytics: done");
