import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import Onboarding from "../components/onboarding";
import { Button, Card, ErrorNote, PhoneField, Screen, Wordmark } from "../components/ui";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { color, font, layout, radius, size, space, tracking } from "../theme/tokens";

const FAIL = "Could not sign you in. Try again.";

// Honest placeholder: disabled, labelled, no handler. Feather has no brand
// glyphs, so the provider name carries the button.
function Provider({ label }: { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: true }}
      disabled
      style={styles.provider}
    >
      <Text style={styles.providerText}>{label}</Text>
      <View style={styles.soon}>
        <Text style={styles.soonText}>Soon</Text>
      </View>
    </Pressable>
  );
}

export default function Index() {
  const { ready, session, profile, profileError, reloadProfile, setProfile } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pilotError, setPilotError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready || (session && profile === undefined && !profileError)) {
    return (
      <Screen>
        <View style={styles.hero}>
          <Wordmark />
        </View>
      </Screen>
    );
  }

  if (session) {
    if (profileError) {
      return (
        <Screen>
          <View style={styles.hero}>
            <Wordmark />
          </View>
          <ErrorNote>Could not load your profile.</ErrorNote>
          <Card>
            <Button label="Try again" onPress={reloadProfile} />
          </Card>
        </Screen>
      );
    }
    if (profile === null) {
      return (
        <Onboarding
          userId={session.user.id}
          email={session.user.email ?? ""}
          onDone={setProfile}
          onSignOut={() => supabase.auth.signOut()}
        />
      );
    }
    return <Redirect href={profile?.account_type === "organiser" ? "/organiser" : "/groups"} />;
  }

  const stepOnCourt = async () => {
    setPilotError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/pilot-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setPilotError(body?.error ?? FAIL);
        return;
      }
      // verifyOtp sets the session; onAuthStateChange re-renders this screen
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: "email",
        token_hash: body.token_hash,
      });
      if (otpError) setPilotError(FAIL);
    } catch {
      setPilotError(FAIL);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.mark}>SHUTTLE</Text>
        <Text style={styles.tagline}>The night runs on your phone.</Text>
      </View>

      <Card>
        <Text style={styles.cardLabel}>Play tonight</Text>
        <PhoneField value={phone} onChange={setPhone} label="Your number" />
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Group code"
          placeholderTextColor={color.ink3}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button label="Step on court" busy={busy} busyLabel="Checking" onPress={stepOnCourt} />
        {pilotError ? <ErrorNote>{pilotError}</ErrorNote> : null}
      </Card>

      <Card>
        <Text style={styles.cardLabel}>Or use email</Text>
        {sent ? (
          <Text style={styles.body}>Link sent. Open it from your email.</Text>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={color.ink3}
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
            />
            <Button
              label="Email me a sign-in link"
              variant="quiet"
              onPress={async () => {
                setError(null);
                const { error: sendError } = await supabase.auth.signInWithOtp({
                  email: email.trim(),
                  // send the link back to wherever this build is served from;
                  // Supabase honours it only if the origin is allowlisted in
                  // Auth → URL Configuration
                  options: { emailRedirectTo: window.location.origin },
                });
                if (sendError) setError("That did not send. Check the address and try again.");
                else setSent(true);
              }}
            />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </>
        )}
      </Card>

      <View style={styles.providers}>
        <Provider label="Google" />
        <Provider label="Apple" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.sm, marginTop: space.xxl, marginBottom: space.sm },
  mark: {
    fontFamily: font.display,
    fontSize: size.hero,
    letterSpacing: size.hero * tracking.label,
    color: color.ink,
  },
  tagline: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  cardLabel: {
    fontFamily: font.medium,
    fontSize: size.label,
    color: color.ink3,
    textTransform: "uppercase",
    letterSpacing: size.label * tracking.label,
  },
  body: { fontFamily: font.body, fontSize: size.body, color: color.ink2, textAlign: "center" },
  input: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontFamily: font.body,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.card,
  },
  providers: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    gap: space.md,
  },
  provider: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.control + 3,
    paddingVertical: 13,
    opacity: 0.45,
  },
  providerText: { fontFamily: font.bold, fontSize: 14, color: color.ink },
  soon: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: color.inkWash,
  },
  soonText: {
    fontFamily: font.medium,
    fontSize: size.label,
    color: color.ink3,
    textTransform: "uppercase",
    letterSpacing: size.label * tracking.label,
  },
});
