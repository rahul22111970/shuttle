import { supabase } from "./supabase";

export type AccountType = "player" | "organiser";

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  account_type: AccountType;
  upi_vpa: string | null;
  // 'preset:<key>' | 'photo:<path>' | null (initials)
  avatar: string | null;
  created_at: string;
};

export type ProfileInput = {
  id: string;
  display_name: string;
  phone: string | null;
  account_type: AccountType;
  upi_vpa?: string | null;
};

// The S0-08 ceiling came due at S1-17: the select policy widened for
// rosters, so "the profile" now filters to the signed-in user explicitly.
export async function getProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("not signed in");
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle<Profile>();
  if (error) throw error;
  return data;
}

export async function upsertProfile(input: ProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(input)
    .select()
    .single<Profile>();
  if (error) throw error;
  return data;
}
