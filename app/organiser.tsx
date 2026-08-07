import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { color, layout, radius, shadow, size, space, tracking } from "../theme/tokens";

export default function Organiser() {
  const { ready, session, profile, profileError } = useAuth();

  if (!ready || (session && profile === undefined && !profileError)) {
    return (
      <View style={styles.root}>
        <Text style={styles.mark}>SHUTTLE</Text>
      </View>
    );
  }
  if (!session || !profile || profileError) return <Redirect href="/" />;
  if (profile.account_type === "player") return <Redirect href="/today" />;

  return (
    <View style={styles.root}>
      <Text style={styles.mark}>SHUTTLE</Text>
      <View style={styles.card}>
        <Text style={styles.title}>{profile.display_name}</Text>
        <Text style={styles.copy}>
          The organiser console comes later. Entries, draws and the call board land here.
        </Text>
      </View>
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
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
  card: {
    alignSelf: "stretch",
    maxWidth: layout.column,
    marginHorizontal: "auto",
    boxShadow: [...shadow.ring],
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.sm,
    backgroundColor: color.card,
  },
  title: { fontSize: size.lead, color: color.ink },
  copy: { fontSize: size.body, color: color.ink2 },
  button: {
    backgroundColor: color.court,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonText: { color: color.chalk, fontSize: size.body },
});
