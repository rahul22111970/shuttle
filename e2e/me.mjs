// e2e for S1-24: the Me tab against admin-seeded matches with hand-computed
// figures. Seed: 3 doubles wins with Bela (oldest first), then 1 singles
// loss most recent. Expect 75% wins, streak L1, chemistry Bela 100% · 3.
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
const email = `e2e-me-${stamp}@shuttle-e2e.test`;
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
  if (participants.length > 0) {
    const rows = participants.map((p) => ({ match_id: m.data.id, ...p }));
    const ins = await admin.from("match_participants").insert(rows);
    if (ins.error) throw ins.error;
  }
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
  await page.getByPlaceholder("Your name").fill("Me Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  // empty state first
  await page.getByRole("tab", { name: "Me" }).click();
  const meEmpty = page.getByTestId("me-screen");
  await meEmpty.getByText("Me Runner").waitFor({ timeout: 15000 });
  await meEmpty.getByText("No games yet. Score one tonight.").waitFor({ timeout: 15000 });
  await meEmpty.getByText("Play 3 games with someone to see your chemistry.").waitFor({ timeout: 15000 });
  await meEmpty.getByText("Every player starts at 1200. Your line begins with your first game.").waitFor({ timeout: 15000 });
  console.log("PASS a new player's Me is fully drawn empty, rating included");

  // group + fixtures + the hand-computed season; creating drops into the
  // room, which also marks Me Gang as the last-opened group Me reads
  await page.getByRole("tab", { name: "Groups" }).click();
  await page.getByPlaceholder("Group name").fill(`Me Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const g = await admin.from("groups").select("id").eq("name", `Me Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  for (const nm of ["Bela", "Chirag", "Dev"]) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-me-${nm.toLowerCase()}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin.from("profiles").insert({ id: u.data.user.id, display_name: nm, account_type: "player" });
    await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
  }
  const [bela, chirag, dev] = fixtureIds;
  const at = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();
  // 3 doubles wins with Bela, then the most recent: a singles loss
  for (const [i, score] of [[40, { a: 21, b: 15 }], [30, { a: 21, b: 18 }], [20, { a: 21, b: 10 }]].entries()) {
    void i;
    await seedMatch(
      [
        { player_id: userId, side: "a" },
        { player_id: bela, side: "a" },
        { player_id: chirag, side: "b" },
        { player_id: dev, side: "b" },
      ],
      score[1],
      at(score[0])
    );
  }
  await seedMatch(
    [
      { player_id: userId, side: "a" },
      { player_id: chirag, side: "b" },
    ],
    { a: 12, b: 21 },
    at(5)
  );

  // a seeded rating line over the four matches: hero must equal the
  // LATEST rating_after (1276), spark must render
  const matchesForRating = await admin
    .from("matches")
    .select("id, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (matchesForRating.error) throw matchesForRating.error;
  const series = [
    { before: 1200, after: 1232 },
    { before: 1232, after: 1265 },
    { before: 1265, after: 1290 },
    { before: 1290, after: 1276 },
  ];
  for (const [i, m] of matchesForRating.data.entries()) {
    const r = await admin.from("rating_history").insert({
      player_id: userId,
      match_id: m.id,
      group_id: groupId,
      rating_before: series[i].before,
      rating_after: series[i].after,
      k: 64,
      created_by: userId,
      created_at: m.created_at,
    });
    if (r.error) throw r.error;
  }

  // the figures, hand-computed: 3 of 4 = 75%, streak L1, Bela 100% of 3.
  // Every assertion scoped to the Me screen: blurred screens can stay in
  // the DOM and other surfaces render the same strings.
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("tab", { name: "Me" }).click();
  const me = page.getByTestId("me-screen");
  await me.getByText("75%").waitFor({ timeout: 15000 });
  console.log("PASS win % equals the fixture output");
  await me.getByText("L1").waitFor({ timeout: 15000 });
  console.log("PASS the streak reads L1 after the recent loss");
  await me.getByText("100% · 3 games").waitFor({ timeout: 15000 });
  await me.getByText("Bela", { exact: true }).waitFor({ timeout: 15000 });
  console.log("PASS chemistry shows Bela at 100% of 3");
  await me.getByText("Chirag d. Me Runner").waitFor({ timeout: 15000 });
  await me.getByText("21–12").waitFor({ timeout: 15000 });
  console.log("PASS the loss reads winners-first with a flipped score");

  // S1-27: the hero equals the latest rating_after, the line renders
  await me.getByText("1276").waitFor({ timeout: 15000 });
  await me.getByTestId("rating-spark").waitFor({ timeout: 15000 });
  await me.getByText("Finding your level").waitFor({ timeout: 15000 });
  console.log("PASS the rating hero equals the latest rating_after, with a line");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on Me");

  // the published math carries the engine constants
  await me.getByText("How the rating works").click();
  const math = page.getByTestId("rating-math");
  await math.getByText("Everyone starts at 1200, in every group. Each group keeps its own ladder. Your number here is earned here. A win adds points to the winner and takes them from the loser. Nothing else moves your number.").waitFor({ timeout: 15000 });
  await math.getByText(/Yours is 32\./).waitFor({ timeout: 15000 });
  await math.getByText(/first 10 rated/).waitFor({ timeout: 15000 });
  await math.getByText(/use 64, so you find/).waitFor({ timeout: 15000 });
  await math.getByText(/a 400-point gap/).waitFor({ timeout: 15000 });
  await math.getByText("You are rated against the opposing pair's average. Partners are scored one by one: at the same K, the stronger partner gains less from the same win.").waitFor({ timeout: 15000 });
  const widthMath = await page.evaluate(() => document.body.scrollWidth);
  if (widthMath > 390) throw new Error(`math scrollWidth ${widthMath} > 390`);
  console.log("PASS the math page publishes the engine constants at 390px");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Me Gang ${stamp}`).maybeSingle();
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
  console.error("FAIL me e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("me e2e: all assertions passed");
