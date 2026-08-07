import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { color, radius, size, space, tracking } from "../theme/tokens";

export default function Index() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.mark}>SHUTTLE</Text>
      {session ? (
        <>
          <Text style={styles.body}>{session.user.email}</Text>
          <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.buttonText}>Sign out</Text>
          </Pressable>
        </>
      ) : sent ? (
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
    maxWidth: 360,
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
