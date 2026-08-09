// e2e for S1-20: missing-VPA prompt, save VPA, add a court expense with
// per-head amounts matching the engine, UPI href params, mark settled and
// watch the chip flip, settlement event in the DB. 390px throughout.
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
const email = `e2e-ledger-${stamp}@shuttle-e2e.test`;
let userId, server, browser, failed, groupId, fixtureId;

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

  // sign in, onboard, group, night
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Captain Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`Ledger Gang ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });

  // one fixture member who will owe money
  const g = await admin.from("groups").select("id").eq("name", `Ledger Gang ${stamp}`).single();
  if (g.error) throw g.error;
  groupId = g.data.id;
  const u = await admin.auth.admin.createUser({
    email: `e2e-ledger-f-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  if (u.error) throw u.error;
  fixtureId = u.data.user.id;
  await admin.from("profiles").insert({ id: fixtureId, display_name: "Bela", account_type: "player" });
  await admin.from("group_members").insert({ group_id: groupId, player_id: fixtureId });

  await page.getByText("Tomorrow 7 pm").click();
  await page.getByText(/^Plan .*\d/).click();
  await page.getByText(/in the group/).waitFor({ timeout: 15000 });
  await page.getByText("I'm in").click();
  await page.getByText("Start the night").click();
  await page.getByText("The night is on.").waitFor({ timeout: 15000 });
  await page.getByText("I'm here").click();

  const s = await admin.from("sessions").select("id").eq("group_id", groupId).single();
  if (s.error) throw s.error;
  await admin.from("session_events").insert({
    session_id: s.data.id,
    seq: 100,
    type: "check_in",
    actor_id: fixtureId,
  });
  await page.reload();

  // missing-VPA prompt for the captain (named assertion)
  await page.getByText("Add UPI ID to collect money").click();
  await page.getByText("Add your UPI ID so the group can pay you.").waitFor({ timeout: 15000 });
  console.log("PASS missing-VPA state renders");

  await page.getByLabel("UPI ID").fill("runner@upi");
  await page.getByText("Save UPI ID").click();
  await page.getByText("Money").waitFor({ timeout: 15000 });
  await page.getByText("Court", { exact: true }).waitFor({ timeout: 15000 });
  console.log("PASS VPA saved, ledger ready");

  // add a 600-rupee court expense split across both checked-in players
  await page.getByLabel("Amount in rupees").fill("600");
  await page.getByText("₹300 a head · 2 sharing").waitFor({ timeout: 15000 });
  console.log("PASS per-head amounts match the engine");

  await page.getByText("Add court expense").click();
  await page.getByText("Collect ₹300").waitFor({ timeout: 15000 });
  console.log("PASS debtor row appears with the collect label");

  // the UPI href carries pa/am/tn
  const href = await page.getByText("Collect ₹300").getAttribute("href");
  if (!href || !href.startsWith("upi://pay?")) throw new Error(`href: ${href}`);
  const params = new URLSearchParams(href.split("?")[1]);
  if (params.get("pa") !== "runner@upi") throw new Error(`pa: ${params.get("pa")}`);
  if (params.get("am") !== "300.00") throw new Error(`am: ${params.get("am")}`);
  if (params.get("tn") !== "Shuttle night") throw new Error(`tn: ${params.get("tn")}`);
  console.log("PASS UPI href carries pa, am, tn");

  const width = await page.evaluate(() => document.body.scrollWidth);
  if (width > 390) throw new Error(`scrollWidth ${width} > 390`);
  console.log("PASS 390px holds on the ledger");

  // mark settled: the chip flips and the event lands
  await page.getByLabel("Mark Bela settled").click();
  await page.getByText("Paid").waitFor({ timeout: 15000 });
  console.log("PASS the chip flips to Paid");

  const settlement = await admin
    .from("ledger_events")
    .select("type, payer_id, amount_paise, participant_ids")
    .eq("group_id", groupId)
    .eq("type", "settlement")
    .single();
  if (settlement.error) throw settlement.error;
  if (
    settlement.data.payer_id !== fixtureId ||
    settlement.data.amount_paise !== 30000 ||
    settlement.data.participant_ids[0] !== userId
  ) {
    throw new Error(`settlement row wrong: ${JSON.stringify(settlement.data)}`);
  }
  console.log("PASS the settlement event is in the log");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (!groupId) {
    const g = await admin.from("groups").select("id").eq("name", `Ledger Gang ${stamp}`).maybeSingle();
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
  console.error("FAIL ledger e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("ledger e2e: all assertions passed");
