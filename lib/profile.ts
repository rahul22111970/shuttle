import { supabase } from "./supabase";

export type AccountType = "player" | "organiser";

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  account_type: AccountType;
  upi_vpa: string | null;
  created_at: string;
};

export type ProfileInput = {
  id: string;
  display_name: string;
  phone: string | null;
  account_type: AccountType;
  upi_vpa?: string | null;
};

// RLS scopes every query to the signed-in user, so "the profile" needs no id.
// ponytail: the unfiltered select works only while the select policy is
// owner-only; add .eq("id", uid) when S1 widens the policy for rosters.
export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
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
