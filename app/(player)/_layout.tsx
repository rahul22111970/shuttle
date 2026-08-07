import { Redirect, Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../lib/auth";
import { color, size, space, tracking } from "../../theme/tokens";

export default function PlayerLayout() {
  const { ready, session, profile, profileError } = useAuth();

  if (!ready || (session && profile === undefined && !profileError)) {
    return (
      <View style={styles.loading}>
        <Text style={styles.mark}>SHUTTLE</Text>
      </View>
    );
  }
  if (!session || !profile || profileError) return <Redirect href="/" />;
  if (profile.account_type === "organiser") return <Redirect href="/organiser" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.court,
        tabBarInactiveTintColor: color.ink3,
        tabBarStyle: { backgroundColor: color.card, borderTopColor: color.line },
        tabBarLabelStyle: { fontSize: size.body },
        tabBarIconStyle: { display: "none" },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="session" options={{ title: "Session" }} />
      <Tabs.Screen name="compete" options={{ title: "Compete" }} />
      <Tabs.Screen name="me" options={{ title: "Me" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    backgroundColor: color.fog0,
  },
  mark: {
    fontSize: size.display,
    letterSpacing: size.display * tracking.label,
    color: color.ink,
  },
});
