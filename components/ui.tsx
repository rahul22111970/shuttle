// The shared primitives every screen was quietly duplicating (S0-10 review
// note, consolidated at S1-10): centered fog screen, ring-shadow card,
// court button, wordmark, error line. Tokens only, here and nowhere else.
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { color, layout, radius, shadow, size, space, tracking } from "../theme/tokens";

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Wordmark() {
  return <Text style={styles.mark}>SHUTTLE</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  busy = false,
  busyLabel,
  disabled = false,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  // what the button says while its own action runs; defaults to the label
  busyLabel?: string;
  disabled?: boolean;
  // quiet = the bordered secondary; one focal point per view
  variant?: "primary" | "quiet";
}) {
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      style={[
        variant === "primary" ? styles.button : styles.buttonQuiet,
        busy && variant === "primary" && styles.buttonBusy,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={off}
    >
      <Text style={variant === "primary" ? styles.buttonText : styles.buttonQuietText}>
        {busy ? busyLabel ?? label : label}
      </Text>
    </Pressable>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>;
}

// The member chip: neutral at rest, court-marked when active (attending,
// checked in, settled — whatever "counted" means on that screen).
export function Chip({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <View style={[styles.chipBase, active && styles.chipActive]}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
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
  button: {
    backgroundColor: color.court,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonBusy: { backgroundColor: color.courtDeep },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: color.chalk, fontSize: size.body },
  buttonQuiet: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonQuietText: { color: color.ink2, fontSize: size.body },
  error: { fontSize: size.body, color: color.cork, textAlign: "center" },
  chipBase: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    backgroundColor: color.card,
  },
  chipActive: { borderColor: color.court, backgroundColor: color.courtWash },
  chipLabel: { fontSize: size.body, color: color.ink2 },
  chipLabelActive: { color: color.courtDeep },
});
