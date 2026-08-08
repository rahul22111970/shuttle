// Placeholder door for S1-22: Today's Log-a-game action needs a real
// destination this slice; the two-tap flow replaces this next slice.
import { StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { color, size } from "../theme/tokens";
import { Button, Card, Screen } from "../components/ui";

export default function QuickLog() {
  return (
    <Screen>
      <Card>
        <Text style={styles.copy}>Quick log arrives next.</Text>
      </Card>
      <Button label="Back to Today" variant="quiet" onPress={() => (router.canGoBack() ? router.back() : router.replace("/today"))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  copy: { fontSize: size.body, color: color.ink2 },
});
