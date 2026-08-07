import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { color, layout, radius, shadow, size, space } from "../../theme/tokens";

export default function Me() {
  const { profile, session } = useAuth();
  if (!profile) return null; // the layout guard has already redirected

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.detail}>Player · {profile.phone ?? "no phone"}</Text>
        <Text style={styles.detail}>{session?.user.email}</Text>
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
  name: { fontSize: size.lead, color: color.ink },
  detail: { fontSize: size.body, color: color.ink2 },
  button: {
    backgroundColor: color.court,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonText: { color: color.chalk, fontSize: size.body },
});
