import { StyleSheet, Text } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { color, font, size, tracking } from "../theme/tokens";
import { Button, Card, Screen, Wordmark } from "../components/ui";

export default function Organiser() {
  const { ready, session, profile, profileError } = useAuth();

  if (!ready || (session && profile === undefined && !profileError)) {
    return (
      <Screen>
        <Wordmark />
      </Screen>
    );
  }
  if (!session || !profile || profileError) return <Redirect href="/" />;
  if (profile.account_type === "player") return <Redirect href="/today" />;

  return (
    <Screen>
      <Wordmark />
      <Card>
        <Text style={styles.title}>{profile.display_name}</Text>
        <Text style={styles.copy}>
          The organiser console comes later. Entries, draws and the call board land here.
        </Text>
      </Card>
      <Button label="Sign out" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
});
