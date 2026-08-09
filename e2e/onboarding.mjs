// e2e for S0-09: a fresh user completes onboarding; the profiles row exists
// with phone and account_type; the screen fits 390px with no sideways scroll.
// Run via e2e/run.sh after a web export.
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
const email = `e2e-onboard-${stamp}@shuttle-e2e.test`;
const phoneDigits = `9${String(stamp).slice(-9)}`;
let userId, server, browser, failed;

try {
  server = spawn(
    "python3",
    ["-m", "http.server", "3000", "-d", "dist", "--bind", "127.0.0.1"],
    { stdio: "ignore" }
  );
  await new Promise((r) => setTimeout(r, 1000));

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

  // fresh user lands on onboarding
  await page.goto(link.data.properties.action_link);
  await page.getByText("Start playing").waitFor({ timeout: 15000 });
  console.log("PASS fresh user lands on onboarding");

  // fits 390px
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  if (scrollWidth > 390) throw new Error(`scrollWidth ${scrollWidth} > 390`);
  console.log("PASS no sideways scroll at 390px");

  // complete it
  await page.getByPlaceholder("Your name").fill("E2E Runner");
  await page.getByPlaceholder("Phone (+91)").fill(phoneDigits);
  await page.getByText("Start playing").click();
  // a completed player lands on the Groups home
  await page.getByText("No group yet").waitFor({ timeout: 15000 });
  console.log("PASS onboarding completes into the player surface");

  // the row is real, with phone and account_type
  const row = await admin.from("profiles").select("*").eq("id", userId).single();
  if (row.error) throw row.error;
  if (row.data.phone !== `+91${phoneDigits}`) throw new Error(`phone ${row.data.phone}`);
  if (row.data.account_type !== "player") throw new Error(`type ${row.data.account_type}`);
  console.log("PASS profiles row exists with phone and account_type");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (userId) await admin.auth.admin.deleteUser(userId);
}

if (failed) {
  console.error("FAIL onboarding e2e:", failed.message ?? failed);
  process.exit(1);
}
console.log("onboarding e2e: all assertions passed");
