// Avatar probe: pick a preset on Me, then upload a real photo through the
// picker, and prove both render and persist. Phone viewport, live DB,
// full cleanup including the uploaded storage object.
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
let userId, server, browser, failed;

try {
  server = spawn("node", ["e2e/serve.mjs"], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    const up = await fetch(APP).then(() => true).catch(() => false);
    if (up) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const created = await admin.auth.admin.createUser({
    email: `e2e-ava-${stamp}@shuttle-e2e.test`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: `e2e-ava-${stamp}@shuttle-e2e.test`,
    options: { redirectTo: APP },
  });
  if (link.error) throw link.error;

  browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(link.data.properties.action_link);
  await page.getByPlaceholder("Your name").fill("Ava Probe");
  await page.getByPlaceholder("Phone (+91)").fill(`9${String(stamp).slice(-9)}`);
  await page.getByText("Start playing").click();
  await page.getByText("No group yet").waitFor({ timeout: 15000 });

  await page.getByText("Me", { exact: true }).click();
  await page.getByText("Your look").waitFor({ timeout: 15000 });
  // fresh account: initials while nothing is chosen
  await page.getByText("AP", { exact: true }).waitFor({ timeout: 5000 });
  console.log("PASS initials show before any choice");

  await page.getByLabel("Avatar shuttle").click();
  await page.waitForTimeout(800);
  const saved = await admin.from("profiles").select("avatar").eq("id", userId).single();
  if (saved.data?.avatar !== "preset:shuttle")
    throw new Error(`preset not saved: ${saved.data?.avatar}`);
  console.log("PASS preset pick persists to the profile");

  // choosing folds the picker: only the look and the pencil remain
  await page.getByText("Upload a photo").waitFor({ state: "hidden", timeout: 5000 });
  await page.getByLabel("Change your look").waitFor({ timeout: 5000 });
  console.log("PASS picker folds away once a look is chosen");
  await page.screenshot({ path: "/tmp/probe-look.png", fullPage: false });

  // the pencil reopens it; upload a real image through the file input
  await page.getByLabel("Change your look").click();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 15000 }),
    page.getByText("Upload a photo").click(),
  ]);
  await chooser.setFiles("assets/avatars/preset-sun.png");
  await page.waitForTimeout(3000);
  const photo = await admin.from("profiles").select("avatar").eq("id", userId).single();
  if (!photo.data?.avatar?.startsWith(`photo:${userId}/`))
    throw new Error(`photo not saved: ${photo.data?.avatar}`);
  const path = photo.data.avatar.slice(6);
  const obj = await admin.storage.from("avatars").download(path);
  if (obj.error) throw new Error(`stored object missing: ${obj.error.message}`);
  console.log("PASS photo uploads to own folder and saves to the profile");

  // the page shows the uploaded photo (an img pointing into the bucket)
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll("img")].some((i) => i.src.includes("/avatars/"))
  );
  if (!shown) throw new Error("uploaded photo not rendered");
  console.log("PASS uploaded photo renders on Me");
  await page.getByText("Upload a photo").waitFor({ state: "hidden", timeout: 5000 });
  console.log("PASS the picker folds again after the upload");
  await page.screenshot({ path: "/tmp/probe-look2.png", fullPage: false });
} catch (e) {
  failed = e;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (userId) {
    const files = await admin.storage.from("avatars").list(userId);
    if (files.data && files.data.length > 0) {
      await admin.storage.from("avatars").remove(files.data.map((f) => `${userId}/${f.name}`));
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("cleanup user:", error.message);
  }
}

if (failed) {
  console.error("FAIL probe:", failed.message ?? failed);
  process.exit(1);
}
console.log("probe-avatars: done");
