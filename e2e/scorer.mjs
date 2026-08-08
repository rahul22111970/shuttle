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
let userId, server, browser, failed, groupId;

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
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });
  await page.getByText("Session", { exact: true }).click();
  await page.getByPlaceholder("Group name").fill(`Scorer Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText("I'm in").click();
  await page.getByText("Start the night").waitFor({ timeout: 15000 });
  await page.getByText("Start the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });

  // open the scorer
  await page.getByText("Score a game").click();
  await page.getByLabel("Point to side A").waitFor({ timeout: 15000 });
  console.log("PASS scorer opens from the live night");

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
  const m = await admin.from("matches").select("status, snapshot").eq("group_id", groupId).single();
  if (m.error) throw m.error;
  if (m.data.status !== "complete" || m.data.snapshot.winner !== "a") {
    throw new Error(`match row wrong: ${m.data.status} ${m.data.snapshot?.winner}`);
  }
  console.log("PASS the result is in the database, winner a, status complete");

  await page.getByText("Back to the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  console.log("PASS back lands on the live session");
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
    const { error } = await admin.from("groups").delete().eq("id", groupId);
    if (error) console.error("cleanup group:", error.message);
  }
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL scorer e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("scorer e2e: all assertions passed");
