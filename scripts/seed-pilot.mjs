// Pilot seeding: stub profiles for players who cannot onboard in time
// (built-in mailer allows ~2 sign-ins per hour). Stubs are real rows in
// profiles/group_members with unusable @shuttle.stub emails; only the
// captain's phone signs in. Run from app/:
//
//   node scripts/seed-pilot.mjs --captain you@example.com \
//     --group "Saturday Gang" "Name One" "Name Two" ...
//
// Idempotent: an existing group of that name is reused, an existing stub
// of the same display name is skipped.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const parseEnv = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );

const pub = parseEnv(".env.local");
const sec = parseEnv(".secrets.env");
const admin = createClient(pub.EXPO_PUBLIC_SUPABASE_URL, sec.SUPABASE_ADMIN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args.splice(i, 2)[1];
};
const captainEmail = flag("--captain");
const groupName = flag("--group");
const names = args;
if (!captainEmail || !groupName || names.length === 0) {
  console.error('usage: node scripts/seed-pilot.mjs --captain <email> --group "<name>" <player names...>');
  process.exit(1);
}

// the captain must be a real signed-up account
const { data: users, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;
const captain = users.users.find((u) => u.email === captainEmail);
if (!captain) {
  console.error(`no account for ${captainEmail} — sign in once on the phone first`);
  process.exit(1);
}

// reuse the captain's group of this name, or create it
let { data: group } = await admin
  .from("groups")
  .select("id, name")
  .eq("name", groupName)
  .eq("created_by", captain.id)
  .maybeSingle();
if (!group) {
  const created = await admin
    .from("groups")
    .insert({ name: groupName, created_by: captain.id })
    .select("id, name")
    .single();
  if (created.error) throw created.error;
  group = created.data;
  const cm = await admin
    .from("group_members")
    .insert({ group_id: group.id, player_id: captain.id });
  if (cm.error) throw cm.error;
  console.log(`created group "${groupName}"`);
} else {
  console.log(`using existing group "${groupName}"`);
}

const { data: existing, error: exErr } = await admin
  .from("group_members")
  .select("player_id, profiles!inner(display_name)")
  .eq("group_id", group.id);
if (exErr) throw exErr;
const have = new Set(existing.map((r) => r.profiles.display_name));

for (const name of names) {
  if (have.has(name)) {
    console.log(`skip ${name} (already in the group)`);
    continue;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const u = await admin.auth.admin.createUser({
    email: `${slug}-${Date.now()}@shuttle.stub`,
    email_confirm: true,
  });
  if (u.error) throw u.error;
  const p = await admin
    .from("profiles")
    .insert({ id: u.data.user.id, display_name: name, account_type: "player" });
  if (p.error) throw p.error;
  const m = await admin
    .from("group_members")
    .insert({ group_id: group.id, player_id: u.data.user.id });
  if (m.error) throw m.error;
  console.log(`seeded ${name}`);
}

const { count } = await admin
  .from("group_members")
  .select("*", { count: "exact", head: true })
  .eq("group_id", group.id);
console.log(`done: "${group.name}" now has ${count} members`);
