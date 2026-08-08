// Pilot-only captain reset. The logs are append-only with no client DELETE
// grants, so during the pilot the captain wipes his group's activity through
// this server-side function and the service key. Profiles, group_members and
// the group row are never touched. This file leaves before the app store.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const groupId = req.body?.groupId;
  if (!token || !groupId) return res.status(400).json({ error: "Missing token or groupId." });

  const admin = createClient(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ADMIN_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Sign in again." });

  const { data: group, error: groupErr } = await admin
    .from("groups")
    .select("captain_id")
    .eq("id", groupId)
    .maybeSingle();
  if (groupErr) {
    return res.status(500).json({ error: "The wipe failed partway. Tell the builder." });
  }
  if (!group || group.captain_id !== userData.user.id) {
    return res.status(403).json({ error: "Only the captain can clear the group." });
  }

  // FK-safe order. rating_history.match_id is ON DELETE RESTRICT, so it goes
  // before matches; the rest would cascade but explicit deletes give counts.
  const deleted = {};
  try {
    const { data: matches, error: mErr } = await admin
      .from("matches")
      .select("id")
      .eq("group_id", groupId);
    if (mErr) throw mErr;
    const matchIds = matches.map((m) => m.id);

    const { data: sessions, error: sErr } = await admin
      .from("sessions")
      .select("id")
      .eq("group_id", groupId);
    if (sErr) throw sErr;
    const sessionIds = sessions.map((s) => s.id);

    const wipe = async (table, filter) => {
      const { count, error } = await filter(admin.from(table).delete({ count: "exact" }));
      if (error) throw error;
      deleted[table] = count ?? 0;
    };

    await wipe("rating_history", (q) => q.in("match_id", matchIds));
    await wipe("match_events", (q) => q.in("match_id", matchIds));
    await wipe("match_participants", (q) => q.in("match_id", matchIds));
    await wipe("matches", (q) => q.eq("group_id", groupId));
    await wipe("session_events", (q) => q.in("session_id", sessionIds));
    await wipe("sessions", (q) => q.eq("group_id", groupId));
    await wipe("ledger_events", (q) => q.eq("group_id", groupId));
  } catch {
    // partial wipes are visible in the counts; be honest about how far it got
    return res.status(500).json({ error: "The wipe failed partway. Tell the builder.", deleted });
  }

  return res.status(200).json({ deleted });
}
