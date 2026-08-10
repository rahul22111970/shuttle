// e2e for spoken scoring: the typed twin of the mic path drives the same
// parser, confirm card and write; a wrong game is undone from the log and
// the players' ladders rebuild. The mic itself can't run headless — the
// parser has 11 unit tests and the confirm card gates both paths.
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

const pub = parseEnv(process.env.SHUTTLE_ENV_FILE ?? ".env.local");
const sec = parseEnv(process.env.SHUTTLE_SECRETS_FILE ?? ".secrets.env");
const APP = "http://localhost:3000";
const admin = createClient(pub.EXPO_PUBLIC_SUPABASE_URL, sec.SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const email = `e2e-voice-${stamp}@shuttle-e2e.test`;
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
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Voice Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`Voice Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const g = await admin.from("groups").select("id").eq("name", `Voice Gang ${stamp}`).single();
  groupId = g.data.id;
  const fx = await admin.auth.admin.createUser({
    email: `e2e-voice-f-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  fixtureId = fx.data.user.id;
  await admin.from("profiles").insert({ id: fixtureId, display_name: "Bela", account_type: "player" });
  await admin.from("group_members").insert({ group_id: groupId, player_id: fixtureId });

  // the spoken sentence, typed: parse -> confirm card -> nothing written yet
  await page.getByRole("button", { name: "Games", exact: true }).click();
  const voice = page.getByTestId("voice-log");
  await voice.getByText("Type it instead").click();
  await voice.getByLabel("Spoken score").fill("voice versus bela, voice won 21-16");
  await voice.getByText("Check it").click();
  await voice.getByText("Voice Runner d. Bela · 21–16").waitFor({ timeout: 15000 });
  const before = await admin.from("matches").select("id", { count: "exact", head: true }).eq("group_id", groupId);
  if ((before.count ?? 0) !== 0) throw new Error("match written before confirmation");
  console.log("PASS the confirm card shows the resolution and writes nothing");

  // approve: the game lands in the log, ratings move
  await voice.getByText("Log it").click();
  await voice.getByText("In. Voice Runner d. Bela · 21–16").waitFor({ timeout: 15000 });
  await page.getByText("Voice Runner d. Bela", { exact: true }).waitFor({ timeout: 15000 });
  let ratedCount = 0;
  for (let i = 0; i < 40 && ratedCount !== 2; i++) {
    const rated = await admin.from("rating_history").select("id", { count: "exact", head: true }).eq("group_id", groupId);
    ratedCount = rated.count ?? 0;
    if (ratedCount !== 2) await new Promise((r) => setTimeout(r, 300));
  }
  if (ratedCount !== 2) throw new Error(`expected 2 rating rows, got ${ratedCount}`);
  console.log("PASS the approved game is logged and rated");

  // a wrong utterance is refused with the resolver's own message
  await voice.getByText("Type it instead").click();
  await voice.getByLabel("Spoken score").fill("ravi beat bela 21-3");
  await voice.getByText("Check it").click();
  await voice.getByText(/No one called 'ravi'/).waitFor({ timeout: 15000 });
  console.log("PASS an unknown name is refused before the confirm card");

  // a second game, then undo it: match gone, ladders rebuilt to game one
  await voice.getByText("Type it instead").click();
  await voice.getByLabel("Spoken score").fill("bela beat voice 21-8");
  await voice.getByText("Check it").click();
  await voice.getByText("Bela d. Voice Runner · 21–8").waitFor({ timeout: 15000 });
  await voice.getByText("Log it").click();
  await voice.getByText("In. Bela d. Voice Runner · 21–8").waitFor({ timeout: 15000 });
  await page.getByText("Bela d. Voice Runner", { exact: true }).waitFor({ timeout: 15000 });

  // the confirm tap can race a poll-driven re-render (the standing
  // Playwright-vs-transition trap), so arm-and-confirm retries until the
  // row actually leaves
  for (let i = 0; i < 4; i++) {
    if ((await page.getByText("Bela d. Voice Runner", { exact: true }).count()) === 0) break;
    if ((await page.getByLabel("Really remove this game").count()) === 0) {
      await page.getByLabel("Remove Bela d. Voice Runner").click();
      await page.getByLabel("Really remove this game").waitFor({ timeout: 5000 });
    }
    await page.getByLabel("Really remove this game").click();
    await page.waitForTimeout(4000);
  }
  await page.getByText("Bela d. Voice Runner", { exact: true }).waitFor({ state: "detached", timeout: 20000 });
  const after = await admin.from("matches").select("id").eq("group_id", groupId);
  if (after.data.length !== 1) throw new Error(`expected 1 match after undo, got ${after.data.length}`);
  const ratedAfter = await admin
    .from("rating_history")
    .select("match_id")
    .eq("group_id", groupId);
  if (ratedAfter.data.length !== 2 || ratedAfter.data.some((r) => r.match_id !== after.data[0].id))
    throw new Error(`rating rows not rebuilt to game one: ${JSON.stringify(ratedAfter.data)}`);
  console.log("PASS undo removes the game and rebuilds the ladders");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds with the voice card");
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
  console.error("FAIL voice e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("voice e2e: all assertions passed");
