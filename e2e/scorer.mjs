// e2e for S1-15: from a live night, open the scorer, tap a side to 21,
// land on match-complete; undo reverts the displayed score; the scorer
// chip names the scorer; 390px holds. The "result lands in the feed"
// clause is amended to a DB assertion: the feed arrives at S1-21.
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
const email = `e2e-scorer-${stamp}@shuttle-e2e.test`;
let userId, fixtureId, server, browser, failed, groupId;

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

  // sign in, onboard, build the night
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Scorer Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`Scorer Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });

  // a second member so the who-plays picker can form 1v1
  const g0 = await admin.from("groups").select("id").eq("name", `Scorer Gang ${stamp}`).single();
  if (g0.error) throw g0.error;
  groupId = g0.data.id;
  const fx = await admin.auth.admin.createUser({
    email: `e2e-scorer-f-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  if (fx.error) throw fx.error;
  fixtureId = fx.data.user.id;
  await admin.from("profiles").insert({ id: fixtureId, display_name: "Bela", account_type: "player" });
  await admin.from("group_members").insert({ group_id: groupId, player_id: fixtureId });
  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText(/^Plan .*\d/).click();
  await page.getByText(/in the group/).waitFor({ timeout: 15000 });
  await page.getByText("I'm in").click();
  await page.getByText("Start the night").waitFor({ timeout: 15000 });
  await page.getByText("Start the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });

  // open the scorer through the who-plays picker (S1-28): seat 1v1
  await page.getByText("Score live").click();
  await page.getByText("Who plays").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Bela" }).click();
  await page.getByRole("button", { name: "Bela · A" }).click();
  await page.getByText("Start scoring").click();
  await page.getByLabel("Point to side A").waitFor({ timeout: 15000 });
  console.log("PASS scorer opens seated from the live night picker");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the scorer");

  const chip = await page.getByText("Scorer Runner is scoring").isVisible();
  if (!chip) throw new Error("scorer chip missing");
  console.log("PASS scorer chip names the scorer");

  // three points, then undo reverts the displayed score. Each tap waits for
  // its digit so a swallowed click cannot fake a pass.
  const digit = (idx, value) =>
    page.waitForFunction(
      ([i, v]) => {
        const zones = document.querySelectorAll('[aria-label^="Point to side"]');
        return zones.length === 2 && zones[i].textContent.includes(String(v));
      },
      [idx, value],
      { timeout: 15000 }
    );
  await page.getByLabel("Point to side A").click();
  await digit(0, 1);
  await page.getByLabel("Point to side A").click();
  await digit(0, 2);
  await page.getByLabel("Point to side B").click();
  await digit(1, 1);
  await page.getByText("Undo").click();
  await digit(1, 0);
  console.log("PASS undo reverts the displayed score");

  // leave mid-match: the game stays live and resumes from the session tab
  await page.getByLabel("Leave scoring").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  await page.getByText("Live now").waitFor({ timeout: 15000 });
  await page.getByText("Scorer Runner · Bela").waitFor({ timeout: 15000 });
  await page.getByText("2–0").waitFor({ timeout: 15000 });
  await page.getByText("Continue scoring").click();
  await page.getByLabel("Point to side A").waitFor({ timeout: 15000 });
  await digit(0, 2);
  console.log("PASS leaving keeps the game live and it resumes with the score intact");

  // side A runs out the game, each tap gated on its own digit landing
  for (let i = 0; i < 19; i++) {
    await page.getByLabel("Point to side A").click();
    if (i < 18) await digit(0, 3 + i);
  }
  await page.getByText("Side A takes it.").waitFor({ timeout: 20000 });
  console.log("PASS match-complete screen appears at 21");

  // amended feed assertion: the match row is complete with winner a
  const g = await admin.from("groups").select("id").eq("name", `Scorer Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  const m = await admin
    .from("matches")
    .select("status, snapshot, match_participants(player_id, side)")
    .eq("group_id", groupId)
    .single();
  if (m.error) throw m.error;
  if (m.data.status !== "complete" || m.data.snapshot.winner !== "a") {
    throw new Error(`match row wrong: ${m.data.status} ${m.data.snapshot?.winner}`);
  }
  const seats = Object.fromEntries(m.data.match_participants.map((p) => [p.player_id, p.side]));
  if (seats[userId] !== "a" || seats[fixtureId] !== "b")
    throw new Error(`participants ${JSON.stringify(seats)}`);
  console.log("PASS the result is in the database, winner a, status complete, both seated");

  await page.getByText("Back to the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  console.log("PASS back lands on the live session");

  // the Tonight table shows the finished game: 1 win, 21 points
  const tonight = page.getByTestId("tonight-summary");
  await tonight.getByText("Scorer Runner").waitFor({ timeout: 15000 });
  await tonight.getByText("100%").waitFor({ timeout: 15000 });
  console.log("PASS the Tonight table carries the winner's line");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Scorer Gang ${stamp}`).maybeSingle();
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
  for (const id of [userId, fixtureId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL scorer e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("scorer e2e: all assertions passed");
