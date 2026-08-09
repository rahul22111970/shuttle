// Pilot door: phone + YOUR GROUP's code -> a magic-link token_hash the
// client redeems with supabase.auth.verifyOtp. Codes are per group
// (0013): a code only opens accounts that belong to a group carrying it.
// Service key stays server-side.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  try {
    const { phone, code } = req.body ?? {};

    const digits = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (digits.length !== 10) {
      return res.status(400).json({ error: "That is not a 10-digit number." });
    }
    const e164 = `+91${digits}`;

    const admin = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ADMIN_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", e164)
      .maybeSingle();
    if (!profile) {
      return res.status(404).json({ error: "No player has that number. Ask your captain." });
    }
    // the admin account never enters through a group code: its number is
    // known to the whole group, and this account carries wipe and oversight
    // powers. It signs in by email link only.
    if (process.env.ADMIN_USER_ID && profile.id === process.env.ADMIN_USER_ID) {
      return res.status(403).json({ error: "This account signs in by email link only." });
    }

    // the typed code must belong to one of THIS player's groups
    const memberships = await admin
      .from("group_members")
      .select("groups!inner(code)")
      .eq("player_id", profile.id);
    if (memberships.error) throw memberships.error;
    const typed = String(code ?? "").trim().toLowerCase();
    const match = (memberships.data ?? []).some(
      (r) => r.groups.code.toLowerCase() === typed
    );
    if (!typed || !match) {
      return res.status(401).json({ error: "That code is not your group's code." });
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email;
    if (userError || !email) throw userError ?? new Error("no email on user");

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;

    return res.status(200).json({ token_hash: data.properties.hashed_token });
  } catch {
    // no error details out: they can carry emails or key hints
    return res.status(500).json({ error: "Could not sign you in. Try again." });
  }
}
