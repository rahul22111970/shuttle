// PILOT-ONLY oversight: the one account named in ADMIN_USER_ID sees every
// group in the app — names, rosters, game counts. Read-only, server-side,
// RLS untouched. Remove before the store build.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only." });
  try {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Sign in first." });

    const admin = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ADMIN_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const caller = await admin.auth.getUser(token);
    if (caller.error || !caller.data.user) {
      return res.status(401).json({ error: "Sign in first." });
    }
    if (!process.env.ADMIN_USER_ID || caller.data.user.id !== process.env.ADMIN_USER_ID) {
      return res.status(403).json({ error: "Not yours." });
    }

    const [groups, members, matches] = await Promise.all([
      admin.from("groups").select("id, name, captain_id, created_at").order("created_at"),
      admin.from("group_members").select("group_id, player_id, profiles!inner(display_name)"),
      admin.from("matches").select("group_id, created_at").eq("status", "complete"),
    ]);
    if (groups.error) throw groups.error;
    if (members.error) throw members.error;
    if (matches.error) throw matches.error;

    const nameOf = new Map(
      members.data.map((r) => [r.player_id, r.profiles.display_name])
    );
    const rows = groups.data.map((g) => {
      const roster = members.data
        .filter((m) => m.group_id === g.id)
        .map((m) => m.profiles.display_name)
        .sort();
      const games = matches.data.filter((m) => m.group_id === g.id);
      const last = games.reduce(
        (acc, m) => (acc && acc > m.created_at ? acc : m.created_at),
        null
      );
      return {
        id: g.id,
        name: g.name,
        captain: nameOf.get(g.captain_id) ?? "Unknown",
        players: roster.length,
        roster: roster.join(", "),
        games: games.length,
        lastGame: last,
      };
    });
    return res.status(200).json({ groups: rows });
  } catch {
    return res.status(500).json({ error: "Could not fetch the overview." });
  }
}
