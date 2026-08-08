// e2e for S1-10: create a group, plan a session, RSVP, see yourself on the
// roster — all through the real UI against the hosted project, at 390px.
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
const email = `e2e-session-${stamp}@shuttle-e2e.test`;
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

  // sign in and onboard
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Session Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });

  // Session tab: no group yet → create one
  await page.getByText("Session", { exact: true }).click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`E2E Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  console.log("PASS group created from the empty state");

  // plan via preset: Tomorrow always exists; Today filters out after 7 pm
  // and this project builds at 21:30 IST
  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText(/in the group/).waitFor({ timeout: 15000 });
  console.log("PASS session planned via preset");

  // RSVP and see the chip flip
  await page.getByText("I'm in").click();
  await page.getByText("1 in · 1 in the group").waitFor({ timeout: 15000 });
  console.log("PASS RSVP lands and the roster shows the member");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the session tab");

  // capture group id for cleanup
  const g = await admin.from("groups").select("id").eq("name", `E2E Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  // groups first (frees captain_id/actor_id FKs), then the user
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
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL session-tab e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("session-tab e2e: all assertions passed");
