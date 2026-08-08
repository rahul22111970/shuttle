import { StyleSheet, Text } from "react-native";
import { color, size } from "../theme/tokens";
import { Card, Screen } from "./ui";

// The P0 placeholder every not-yet-real tab shows: a card that tells the
// truth about what lands here, in DESIGN voice.
export default function PlaceholderCard({ title, copy }: { title: string; copy: string }) {
  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.copy}>{copy}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: size.lead, color: color.ink },
  copy: { fontSize: size.body, color: color.ink2 },
});
