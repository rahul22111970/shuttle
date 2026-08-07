import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getProfile, type Profile } from "./profile";
import { supabase } from "./supabase";

type Auth = {
  ready: boolean;
  session: Session | null;
  // undefined = not yet fetched; null = fetched, none exists
  profile: Profile | null | undefined;
  profileError: boolean;
  reloadProfile: () => void;
  setProfile: (profile: Profile) => void;
};

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const load = () => {
    setProfileError(false);
    getProfile()
      .then(setProfile)
      .catch(() => setProfileError(true));
  };
  useEffect(() => {
    if (!userId) {
      setProfile(undefined);
      return;
    }
    load();
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{ ready, session, profile, profileError, reloadProfile: load, setProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}
