import { StyleSheet, Text } from "react-native";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { color, font, size } from "../../theme/tokens";
import { Button, Card, Screen } from "../../components/ui";

export default function Me() {
  const { profile, session } = useAuth();
  if (!profile) return null; // the layout guard has already redirected

  return (
    <Screen>
      <Card>
        <Text style={styles.name}>{profile.display_name}</Text>
        <Text style={styles.detail}>Player · {profile.phone ?? "no phone"}</Text>
        <Text style={styles.detail}>{session?.user.email}</Text>
      </Card>
      <Button label="Sign out" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.body, fontSize: size.lead, color: color.ink },
  detail: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
});
