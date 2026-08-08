// Pilot door: phone + tonight's group code -> a magic-link token_hash the
// client redeems with supabase.auth.verifyOtp. Service key stays server-side.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only." });
  try {
    const { phone, code } = req.body ?? {};

    if (!process.env.PILOT_CODE || code !== process.env.PILOT_CODE) {
      return res.status(401).json({ error: "That code is not tonight's code." });
    }

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
