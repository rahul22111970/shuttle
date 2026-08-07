import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Redirect } from "expo-router";
import Onboarding from "../components/onboarding";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { color, layout, radius, size, space, tracking } from "../theme/tokens";

export default function Index() {
  const { ready, session, profile, profileError, reloadProfile, setProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready || (session && profile === undefined && !profileError)) {
    return (
      <View style={styles.root}>
        <Text style={styles.mark}>SHUTTLE</Text>
      </View>
    );
  }

  if (session) {
    if (profileError) {
      return (
        <View style={styles.root}>
          <Text style={styles.mark}>SHUTTLE</Text>
          <Text style={styles.error}>Could not load your profile.</Text>
          <Pressable style={styles.button} onPress={reloadProfile}>
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
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
    return <Redirect href={profile?.account_type === "organiser" ? "/organiser" : "/today"} />;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.mark}>SHUTTLE</Text>
      {sent ? (
        <Text style={styles.body}>Link sent. Open it from your email.</Text>
      ) : (
        <>
          <Text style={styles.body}>Sign in with your email. No password.</Text>
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
          <Pressable
            style={styles.button}
            onPress={async () => {
              setError(null);
              const { error: sendError } = await supabase.auth.signInWithOtp({
                email: email.trim(),
              });
              if (sendError) setError("That did not send. Check the address and try again.");
              else setSent(true);
            }}
          >
            <Text style={styles.buttonText}>Email me a sign-in link</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
    backgroundColor: color.fog0,
  },
  mark: {
    fontSize: size.display,
    letterSpacing: size.display * tracking.label,
    color: color.ink,
  },
  body: { fontSize: size.body, color: color.ink2, textAlign: "center" },
  input: {
    alignSelf: "stretch",
    maxWidth: layout.column,
    marginHorizontal: "auto",
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.card,
  },
  button: {
    backgroundColor: color.court,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonText: { color: color.chalk, fontSize: size.body },
  error: { fontSize: size.body, color: color.cork, textAlign: "center" },
});
