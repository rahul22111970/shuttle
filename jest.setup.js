// Fake Supabase env so components importing lib/supabase mount under jest.
// Unit tests make no network calls; the values only need to exist.
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_fake";
