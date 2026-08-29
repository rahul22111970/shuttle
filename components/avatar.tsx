// The face beside a name: preset image, uploaded photo, or initials.
// One circle, any size; the caller owns the ring and the tap.
import { Image, StyleSheet, Text, View } from "react-native";
import { avatarSource, initialsOf } from "../lib/avatar";
import { color, font } from "../theme/tokens";

export default function Avatar({
  name,
  avatar,
  size,
  decorative = false,
}: {
  name: string;
  avatar?: string | null;
  size: number;
  // inside an already-labelled parent (a leaderboard row, a preset
  // button) the circle is decoration; it must not announce twice
  decorative?: boolean;
}) {
  const source = avatarSource(avatar);
  const round = { width: size, height: size, borderRadius: size / 2 };
  const a11y = decorative
    ? ({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const)
    : ({ accessibilityLabel: `${name}'s avatar` } as const);
  if (source === null) {
    return (
      <View style={[styles.empty, round]} {...a11y}>
        <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initialsOf(name)}</Text>
      </View>
    );
  }
  return <Image source={source} style={round} {...a11y} />;
}

const styles = StyleSheet.create({
  empty: { backgroundColor: color.inkWash, alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: font.bold, color: color.ink2 },
});
