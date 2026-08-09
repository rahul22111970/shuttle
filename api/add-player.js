// Captain adds a player at the court by name + number. If the number
// already belongs to a profile, that profile joins the group; otherwise a
// stub account is minted (the pilot-login door then works for them
// immediately). Duplicate first names inside a group get a numeral so
// bulk scoring's fuzzy matcher never faces two identical names.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  try {
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Sign in first." });

    const { groupId, name, phone, playerId: knownId } = req.body ?? {};
    if (!groupId || (!knownId && (!name || !phone))) {
      return res.status(400).json({ error: "Name, number and group are all needed." });
    }
    const digits = knownId ? "" : String(phone).replace(/\D/g, "").slice(-10);
    if (!knownId && digits.length !== 10) {
      return res.status(400).json({ error: "That is not a 10-digit number." });
    }
    const e164 = `+91${digits}`;

    const admin = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ADMIN_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const caller = await admin.auth.getUser(token);
    if (caller.error || !caller.data.user) {
      return res.status(401).json({ error: "Sign in first." });
    }
    const group = await admin
      .from("groups")
      .select("captain_id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group.data) return res.status(404).json({ error: "No such group." });
    if (group.data.captain_id !== caller.data.user.id) {
      return res.status(403).json({ error: "Only the captain can add players." });
    }

    // existing person joins; no second account — by id (tap-to-add from
    // another group) or by a number that already belongs to someone
    const existing = knownId
      ? await admin.from("profiles").select("id, display_name").eq("id", knownId).maybeSingle()
      : await admin.from("profiles").select("id, display_name").eq("phone", e164).maybeSingle();
    if (knownId && !existing.data) {
      return res.status(404).json({ error: "No such player." });
    }

    let playerId;
    let finalName;
    if (existing.data) {
      playerId = existing.data.id;
      finalName = existing.data.display_name;
    } else {
      // numeral suffix on a clash so no two members read identically
      const members = await admin
        .from("group_members")
        .select("profiles!inner(display_name)")
        .eq("group_id", groupId);
      const taken = new Set(
        (members.data ?? []).map((r) => r.profiles.display_name.toLowerCase())
      );
      finalName = String(name).trim();
      let n = 2;
      while (taken.has(finalName.toLowerCase())) {
        finalName = `${String(name).trim()} ${n}`;
        n++;
      }
      const slug = finalName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const created = await admin.auth.admin.createUser({
        email: `${slug}-${Date.now()}@shuttle.stub`,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      playerId = created.data.user.id;
      const prof = await admin
        .from("profiles")
        .insert({ id: playerId, display_name: finalName, account_type: "player", phone: e164 });
      if (prof.error) throw prof.error;
    }

    const member = await admin
      .from("group_members")
      .insert({ group_id: groupId, player_id: playerId });
    if (member.error) {
      if (member.error.code === "23505") {
        return res.status(409).json({ error: `${finalName} is already in the group.` });
      }
      throw member.error;
    }
    return res.status(200).json({ playerId, name: finalName });
  } catch {
    return res.status(500).json({ error: "Could not add them. Try again." });
  }
}
