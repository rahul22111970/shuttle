// e2e for S0-10: player lands on Today with tabs; organiser lands on the
// stub; an organiser opening a player deep link is redirected; 390px holds.
// Run via e2e/run.sh after a web export. Uses serve.mjs for the SPA fallback
// deep links need.
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
const users = [];
let server, browser, failed;

async function freshSignedInPage(email) {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) throw created.error;
  users.push(created.data.user.id);
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: APP },
  });
  if (link.error) throw link.error;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(link.data.properties.action_link);
  return page;
}

async function completeOnboarding(page, name, phone, organiser) {
  await page.getByPlaceholder("Your name").waitFor({ timeout: 15000 });
  if (organiser) await page.getByText("Organiser", { exact: true }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.getByPlaceholder("Phone (+91)").fill(phone);
  await page.getByText(organiser ? "Set up events" : "Start playing").click();
}

try {
  server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: "chrome" });

  // player lands on the Groups home, tabs navigate, 390 holds
  const player = await freshSignedInPage(`e2e-shell-p-${stamp}@shuttle-e2e.test`);
  await completeOnboarding(player, "Shell Player", `9${String(stamp).slice(-9)}`, false);
  await player.getByText("No group yet").waitFor({ timeout: 15000 });
  console.log("PASS player lands on Groups");

  const widthGroups = await player.evaluate(() => document.body.scrollWidth);
  if (widthGroups > 390) throw new Error(`groups scrollWidth ${widthGroups}`);
  console.log("PASS 390px holds on Groups");

  await player.getByRole("tab", { name: "Me" }).click();
  await player.getByText("Shell Player").waitFor({ timeout: 15000 });
  await player.getByRole("tab", { name: "Groups" }).click();
  await player.getByText("Start a new group").waitFor({ timeout: 15000 });
  console.log("PASS tabs navigate and carry their copy");

  // the mirror guard: a player opening the organiser stub is sent home
  await player.goto(`${APP}/organiser`);
  await player.getByText("No group yet").waitFor({ timeout: 15000 });
  console.log("PASS player deep link to /organiser redirects to Groups");

  // organiser lands on the stub
  const organiser = await freshSignedInPage(`e2e-shell-o-${stamp}@shuttle-e2e.test`);
  await completeOnboarding(organiser, "Shell Organiser", `8${String(stamp).slice(-9)}`, true);
  await organiser.getByText(/organiser console comes later/).waitFor({ timeout: 15000 });
  console.log("PASS organiser lands on the stub");

  const widthOrg = await organiser.evaluate(() => document.body.scrollWidth);
  if (widthOrg > 390) throw new Error(`organiser scrollWidth ${widthOrg}`);
  console.log("PASS 390px holds on the organiser stub");

  // organiser opening a player deep link is redirected to their surface
  await organiser.goto(`${APP}/groups`);
  await organiser.getByText(/organiser console comes later/).waitFor({ timeout: 15000 });
  console.log("PASS organiser deep link to /groups redirects to the stub");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

if (failed) {
  console.error("FAIL shell e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("shell e2e: all assertions passed");
