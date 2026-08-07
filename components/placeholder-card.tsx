import { StyleSheet, Text, View } from "react-native";
import { color, layout, radius, shadow, size, space } from "../theme/tokens";

// The P0 placeholder every not-yet-real tab shows: a card that tells the
// truth about what lands here, in DESIGN voice.
export default function PlaceholderCard({ title, copy }: { title: string; copy: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.copy}>{copy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
  title: { fontSize: size.lead, color: color.ink },
  copy: { fontSize: size.body, color: color.ink2 },
});
