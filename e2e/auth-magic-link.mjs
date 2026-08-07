// e2e: auth_magic_link_signin, per the amended S0-07 acceptance in BACKLOG.md.
// Mints the magic link server-side with the admin API (no mail catcher),
// follows it in a real browser, and proves: signed in, session survives a
// reload, sign-out clears it. Run via e2e/run.sh after a web export.
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

const email = `e2e-${Date.now()}@shuttle-e2e.test`;
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
  const page = await browser.newPage();

  // follow the link, land signed in
  await page.goto(link.data.properties.action_link);
  await page.getByText(email).waitFor({ timeout: 15000 });
  console.log("PASS signed in after following the link");

  // reload keeps the session
  await page.reload();
  await page.getByText(email).waitFor({ timeout: 15000 });
  console.log("PASS session survives a reload");

  // sign-out clears it
  await page.getByText("Sign out").click();
  await page.getByText("Email me a sign-in link").waitFor({ timeout: 15000 });
  await page.reload();
  await page.getByText("Email me a sign-in link").waitFor({ timeout: 15000 });
  console.log("PASS sign-out clears the session, and stays cleared on reload");
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (userId) await admin.auth.admin.deleteUser(userId);
}

if (failed) {
  console.error("FAIL auth_magic_link_signin:", failed.message ?? failed);
  process.exit(1);
}
console.log("auth_magic_link_signin: all assertions passed");
