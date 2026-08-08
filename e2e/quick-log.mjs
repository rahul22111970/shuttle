// e2e for S1-22: log a finished game in one screen from Today, then prove
// the write: match row complete, result event, snapshot games, and the
// Today feed showing the game immediately.
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
const email = `e2e-qlog-${stamp}@shuttle-e2e.test`;
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

  // onboard, make the group through the UI
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Qlog Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No sessions yet. Your group's nights will land here.").waitFor({ timeout: 15000 });
  await page.getByText("Session", { exact: true }).click();
  await page.getByPlaceholder("Group name").fill(`Qlog Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });

  // a second member to put on side B
  const g = await admin.from("groups").select("id").eq("name", `Qlog Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  // pilot-scale roster: 8 more members, one with a long Indian name, so the
  // 390px check below measures the real chip wall, not two short chips
  const names = ["Bela", "Chirag", "Dev", "Esha", "Farhan", "Gauri", "Harsh", "Lakshminarayanan"];
  for (const [i, name] of names.entries()) {
    const u = await admin.auth.admin.createUser({
      email: `e2e-qlog-f${i}-${stamp}@shuttle-e2e.test`,
      email_confirm: true,
    });
    if (u.error) throw u.error;
    fixtureIds.push(u.data.user.id);
    await admin.from("profiles").insert({ id: u.data.user.id, display_name: name, account_type: "player" });
    await admin.from("group_members").insert({ group_id: groupId, player_id: u.data.user.id });
  }
  const fixtureId = fixtureIds[0];

  // ONE screen: Today -> Log a game -> tap Bela onto B -> score -> log
  await page.getByText("Today", { exact: true }).click();
  await page.getByText("Log a game").click();
  await page.getByText("Who played").waitFor({ timeout: 15000 });
  await page.getByText("Qlog Runner · A").waitFor({ timeout: 15000 });
  console.log("PASS self arrives pre-picked on side A");

  await page.getByText("Bela", { exact: true }).click();
  await page.getByText("Bela · A").waitFor({ timeout: 15000 });
  await page.getByText("Bela · A").click();
  await page.getByText("Bela · B").waitFor({ timeout: 15000 });
  console.log("PASS the tap cycle walks none, A, B");

  await page.getByLabel("Side A score").fill("21");
  await page.getByLabel("Side B score").fill("15");
  await page.getByText("Log 21–15").waitFor({ timeout: 15000 });
  console.log("PASS the button names the score it will write");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on quick log");

  await page.getByText("Log 21–15").click();

  // the feed shows it immediately, names first
  await page.getByText("Qlog Runner · Bela").waitFor({ timeout: 15000 });
  await page.getByText("21–15").waitFor({ timeout: 15000 });
  console.log("PASS the Today feed shows the logged game immediately");

  // the write, checked in the database
  const m = await admin
    .from("matches")
    .select("id, status, snapshot, match_participants(player_id, side)")
    .eq("group_id", groupId)
    .single();
  if (m.error) throw m.error;
  if (m.data.status !== "complete") throw new Error(`status ${m.data.status}`);
  const snap = m.data.snapshot;
  if (snap.games.length !== 1 || snap.games[0].a !== 21 || snap.games[0].b !== 15)
    throw new Error(`snapshot games ${JSON.stringify(snap.games)}`);
  if (snap.winner !== "a") throw new Error(`winner ${snap.winner}`);
  const sides = Object.fromEntries(m.data.match_participants.map((p) => [p.player_id, p.side]));
  if (sides[userId] !== "a" || sides[fixtureId] !== "b")
    throw new Error(`participants ${JSON.stringify(sides)}`);
  console.log("PASS match row is complete with the right snapshot and sides");

  const ev = await admin
    .from("match_events")
    .select("seq, type, payload")
    .eq("match_id", m.data.id);
  if (ev.error) throw ev.error;
  if (ev.data.length !== 1 || ev.data[0].type !== "result")
    throw new Error(`events ${JSON.stringify(ev.data)}`);
  if (ev.data[0].payload.score.a !== 21 || ev.data[0].payload.score.b !== 15)
    throw new Error(`result payload ${JSON.stringify(ev.data[0].payload)}`);
  console.log("PASS the result event is in the log");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Qlog Gang ${stamp}`).maybeSingle();
    groupId = g.data?.id;
  }
  if (groupId) {
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
  console.error("FAIL quick-log e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("quick-log e2e: all assertions passed");
