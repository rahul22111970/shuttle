// e2e for the pilot admin overview: the account named in ADMIN_USER_ID sees
// EVERY group on Me — including one it is not a member of — and any other
// account gets a 403 and no card.
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
const email = `e2e-admin-${stamp}@shuttle-e2e.test`;
let userId, otherId, server, browser, failed, myGroup, otherGroup;

try {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  // the local api shim reads process.env: name the runner as the admin
  server = spawn("node", ["e2e/serve.mjs"], {
    stdio: "ignore",
    env: { ...process.env, ADMIN_USER_ID: userId },
  });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  // a stranger's group the runner is NOT in
  const other = await admin.auth.admin.createUser({
    email: `e2e-admin-o-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  otherId = other.data.user.id;
  await admin.from("profiles").insert({
    id: otherId,
    display_name: "Stranger",
    account_type: "player",
    phone: `+918${String(stamp).slice(-9)}`,
  });
  const og = await admin
    .from("groups")
    .insert({ name: `Strangers ${stamp}`, captain_id: otherId })
    .select("id")
    .single();
  otherGroup = og.data.id;
  await admin.from("group_members").insert({ group_id: otherGroup, player_id: otherId });

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: APP },
  });
  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Admin Runner");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  await page.getByPlaceholder("Group name").fill(`Mine ${stamp}`);
  await page.getByText("Start the group").click();
  await page.getByText("Nothing planned. Pick a night.").waitFor({ timeout: 15000 });
  const mg = await admin.from("groups").select("id").eq("name", `Mine ${stamp}`).single();
  myGroup = mg.data.id;

  // the admin card lists BOTH groups, including the stranger's
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("tab", { name: "Me" }).click();
  const card = page.getByTestId("admin-overview");
  await card.getByText("Every group · admin").waitFor({ timeout: 15000 });
  await card.getByText(`Mine ${stamp}`).waitFor({ timeout: 15000 });
  await card.getByText(`Strangers ${stamp}`).waitFor({ timeout: 15000 });
  await card.getByText(/Stranger runs it/).waitFor({ timeout: 15000 });
  console.log("PASS the admin sees every group, membership or not");

  // any other account gets 403 from the endpoint itself
  const otherLink = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `e2e-admin-o-${stamp}@shuttle-e2e.test`,
  });
  const anon = createClient(pub.EXPO_PUBLIC_SUPABASE_URL, pub.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const otp = await anon.auth.verifyOtp({
    type: "email",
    token_hash: otherLink.data.properties.hashed_token,
  });
  if (otp.error) throw otp.error;
  const res = await fetch(`${APP}/api/admin-overview`, {
    headers: { authorization: `Bearer ${otp.data.session.access_token}` },
  });
  if (res.status !== 403) throw new Error(`stranger got ${res.status}, expected 403`);
  console.log("PASS every other account is refused with 403");

  // the shared code can never open the admin account: even the right
  // number + the right code is refused, email link is the only door
  const og2 = await admin.from("groups").select("code").eq("id", otherGroup).single();
  const strangerCode = og2.data.code;
  const pilot = await fetch(`${APP}/api/pilot-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: `9${String(stamp).slice(-9)}`, code: strangerCode }),
  });
  if (pilot.status !== 403) throw new Error(`admin pilot-login got ${pilot.status}, expected 403`);
  const pilotBody = await pilot.json();
  if (pilotBody.error !== "This account signs in by email link only.")
    throw new Error(`wrong refusal copy: ${pilotBody.error}`);
  console.log("PASS no code, right or wrong, opens the admin account");

  // per-group codes (0013): the stranger's own group code signs them in,
  // any other code is refused
  const goodPilot = await fetch(`${APP}/api/pilot-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: `8${String(stamp).slice(-9)}`, code: strangerCode }),
  });
  if (goodPilot.status !== 200) throw new Error(`own-code login got ${goodPilot.status}`);
  if (!(await goodPilot.json()).token_hash) throw new Error("no token_hash from own-code login");
  const badPilot = await fetch(`${APP}/api/pilot-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone: `8${String(stamp).slice(-9)}`, code: "not-their-code" }),
  });
  if (badPilot.status !== 401) throw new Error(`wrong-code login got ${badPilot.status}, expected 401`);
  console.log("PASS a code only opens accounts inside its own group");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  for (const gid of [myGroup, otherGroup]) {
    if (!gid) continue;
    const { error } = await admin.from("groups").delete().eq("id", gid);
    if (error) console.error("cleanup group:", error.message);
  }
  for (const id of [userId, otherId]) {
    if (!id) continue;
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL admin e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("admin e2e: all assertions passed");
