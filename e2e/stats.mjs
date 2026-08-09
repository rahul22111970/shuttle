// e2e for the Stats tab: admin-seeded season with hand-computed figures.
// Seed: 4 members, Stats Runner & Bela take games 1-2 (21–15, 21–18),
// Chirag & Dev take game 3 by 21–5 (the biggest win). Ratings seeded so the
// podium reads Runner 1246 / Bela 1242 / Chirag 1160. Expect: Chirag's row
// 1-2 at 33%, best pair 67% · 3 games, hottest streak W1 Chirag, 390px holds.
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
const email = `e2e-stats-${stamp}@shuttle-e2e.test`;
let userId, server, browser, failed, groupId;
const fixtureIds = [];

const CASUAL = { kind: "standard", bestOf: 1, pointsTo: 21, cap: null, goldenPoint: true };

async function seedMatch(participants, score, createdAt) {
  const winner = score.a === score.b ? null : score.a > score.b ? "a" : "b";
  const m = await admin
    .from("matches")
    .insert({
      group_id: groupId,
      status: "complete",
      config: CASUAL,
      created_by: userId,
      created_at: createdAt,
      snapshot: {
        config: CASUAL,
        points: [],
        games: [score],
        gamesWon: { a: winner === "a" ? 1 : 0, b: winner === "b" ? 1 : 0 },
        score: { a: 0, b: 0 },
        finished: true,
        winner,
        events: [],
        quickLog: true,
      },
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  const rows = participants.map((p) => ({ match_id: m.data.id, ...p }));
  const ins = await admin.from("match_participants").insert(rows);
  if (ins.error) throw ins.error;
  const ev = await admin.from("match_events").insert({
    match_id: m.data.id,
    seq: 1,
    type: "result",
    payload: { score },
    scorer_id: userId,
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
  await page.getByPlaceholder("Your name").fill("Stats Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  // group + members + the hand-computed season; creating opens the room
  await page.getByPlaceholder("Group name").fill(`Stats Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const g = await admin.from("groups").select("id").eq("name", `Stats Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  for (const nm of ["Bela", "Chirag", "Dev"]) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-stats-${nm.toLowerCase()}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin.from("profiles").insert({ id: u.data.user.id, display_name: nm, account_type: "player" });
    await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
  }
  const [bela, chirag, dev] = fixtureIds;
  const at = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
  const AB_CD = [
    { player_id: userId, side: "a" },
    { player_id: bela, side: "a" },
    { player_id: chirag, side: "b" },
    { player_id: dev, side: "b" },
  ];
  // Runner & Bela win twice, then Chirag & Dev land the 21–5
  await seedMatch(AB_CD, { a: 21, b: 15 }, at(40));
  await seedMatch(AB_CD, { a: 21, b: 18 }, at(30));
  await seedMatch(AB_CD, { a: 5, b: 21 }, at(20));

  // ratings per player per match; the leaderboard reads the LATEST after
  const series = {
    [userId]: [1232, 1260, 1246],
    [bela]: [1230, 1255, 1242],
    [chirag]: [1170, 1145, 1160],
    [dev]: [1168, 1142, 1158],
  };
  const ms = await admin
    .from("matches")
    .select("id, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (ms.error) throw ms.error;
  for (const [i, m] of ms.data.entries()) {
    for (const pid of [userId, bela, chirag, dev]) {
      const after = series[pid][i];
      const before = i === 0 ? 1200 : series[pid][i - 1];
      const r = await admin.from("rating_history").insert({
        group_id: groupId,
        player_id: pid,
        match_id: m.id,
        rating_before: before,
        rating_after: after,
        k: 64,
        created_by: userId,
        created_at: m.created_at,
      });
      if (r.error) throw r.error;
    }
  }

  // Stats is a room section now; every assert scoped to the room
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  const stats = page.getByTestId("group-room");

  const podium = stats.getByTestId("podium-card");
  await podium.getByText("Stats Runner").waitFor({ timeout: 15000 });
  await podium.getByText("1246").waitFor({ timeout: 15000 });
  await podium.getByText("Gold").waitFor({ timeout: 15000 });
  await podium.getByText("Bela").waitFor({ timeout: 15000 });
  await podium.getByText("Chirag").waitFor({ timeout: 15000 });
  console.log("PASS the podium crowns the top-rated player");

  const chiragRow = stats.getByTestId(`board-row-${chirag}`);
  await chiragRow.getByText("1-2").waitFor({ timeout: 15000 });
  await chiragRow.getByText("33%").waitFor({ timeout: 15000 });
  await chiragRow.getByText("1160").waitFor({ timeout: 15000 });
  console.log("PASS Chirag's leaderboard row carries the hand-computed figures");

  // best pair: Runner & Bela, 2 of 3 together = 67%
  await stats.getByTestId("duos-card").getByText("67% · 3 games").waitFor({ timeout: 15000 });
  console.log("PASS the best duo reads 67% of 3");

  const highlights = stats.getByTestId("highlights-card");
  await highlights.getByText("Hottest streak: W1, Chirag.").waitFor({ timeout: 15000 });
  // pair name order follows id sort, so accept either
  await highlights
    .getByText(/Biggest win: 21–5, (Chirag & Dev|Dev & Chirag) over (Stats Runner & Bela|Bela & Stats Runner)\./)
    .waitFor({ timeout: 15000 });
  console.log("PASS the highlights speak the season's sentences");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on Stats");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Stats Gang ${stamp}`).maybeSingle();
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
  console.error("FAIL stats e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("stats e2e: all assertions passed");
