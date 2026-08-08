import { StyleSheet, Text } from "react-native";
import { color, font, size, tracking } from "../theme/tokens";
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
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
});
