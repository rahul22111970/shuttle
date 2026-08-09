// The shared primitives every screen was quietly duplicating (S0-10 review
// note, consolidated at S1-10): centered fog screen, ring-shadow card,
// court button, wordmark, error line. Tokens only, here and nowhere else.
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { color, font, layout, radius, shadow, size, space, tracking } from "../theme/tokens";

export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  // a screen must scroll: a fixed View silently swallowed everything below
  // the fold on real phones. Taps land while the keyboard is up.
  return (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}

export function AppBar({
  title,
  sub,
  onAction,
  actionLabel,
}: {
  title: string;
  sub?: string;
  // the mockup's ink square "+" — one accelerator per screen, optional
  onAction?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.appbar}>
      <View style={styles.appbarText}>
        <Text style={styles.appbarTitle}>{title}</Text>
        {sub ? <Text style={styles.appbarSub}>{sub}</Text> : null}
      </View>
      {onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel ?? "More"}
          style={({ pressed }) => [styles.abtn, pressed && styles.pressed]}
          onPress={onAction}
        >
          <Text style={styles.abtnText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.appbar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.backb, pressed && styles.pressed]}
        onPress={onBack}
      >
        <Text style={styles.backbText}>‹</Text>
      </Pressable>
      <Text style={styles.backTitle}>{title}</Text>
    </View>
  );
}

export function Wordmark() {
  return <Text style={styles.mark}>SHUTTLE</Text>;
}

export function Card({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy = false,
  busyLabel,
  disabled = false,
  variant = "primary",
  tone,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  // what the button says while its own action runs; defaults to the label
  busyLabel?: string;
  disabled?: boolean;
  // quiet = the bordered secondary; one focal point per view
  variant?: "primary" | "quiet";
  // cork = destructive; only meaningful on the quiet variant
  tone?: "cork";
}) {
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [
        variant === "primary" ? styles.button : styles.buttonQuiet,
        busy && variant === "primary" && styles.buttonBusy,
        variant === "quiet" && tone === "cork" && styles.buttonQuietCork,
        disabled && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={off}
    >
      <Text
        style={[
          variant === "primary" ? styles.buttonText : styles.buttonQuietText,
          variant === "quiet" && tone === "cork" && styles.buttonQuietCorkText,
        ]}
      >
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
  screenScroll: {
    flex: 1,
    backgroundColor: Platform.OS === "web" ? "transparent" : color.fog0,
  },
  screen: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: space.lg,
    padding: space.xl,
    paddingTop: space.xxl + space.lg,
    // web paints the fog gradient on <body> (root layout); a solid fill here
    // would cover it
    backgroundColor: Platform.OS === "web" ? "transparent" : color.fog0,
  },
  appbar: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    alignItems: "center",
  },
  appbarText: { flex: 1, gap: 2 },
  appbarTitle: { fontFamily: font.heavy, fontSize: 20, color: color.ink, letterSpacing: -0.2 },
  appbarSub: { fontFamily: font.body, fontSize: 12.5, color: color.ink3 },
  abtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  abtnText: { fontFamily: font.medium, fontSize: 20, lineHeight: 22, color: color.fog0 },
  backb: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: color.inkWash,
    alignItems: "center",
    justifyContent: "center",
  },
  backbText: { fontFamily: font.bold, fontSize: 22, lineHeight: 24, color: color.ink },
  backTitle: {
    fontFamily: font.heavy,
    fontSize: 20,
    color: color.ink,
    letterSpacing: -0.2,
    marginLeft: space.md,
  },
  mark: {
    fontFamily: font.display,
    fontSize: size.display,
    letterSpacing: size.display * tracking.label,
    color: color.ink,
    textTransform: "uppercase",
  },
  card: {
    width: "100%",
    maxWidth: layout.column,
    boxShadow: [...shadow.ring],
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: space.sm,
    backgroundColor: color.card,
  },
  button: {
    backgroundColor: color.court,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: space.xl,
    alignItems: "center",
    alignSelf: "stretch",
  },
  buttonBusy: { backgroundColor: color.courtDeep },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontFamily: font.bold, color: color.chalk, fontSize: 14.5 },
  buttonQuiet: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: space.xl,
    alignItems: "center",
    alignSelf: "stretch",
  },
  buttonQuietText: { fontFamily: font.bold, color: color.ink, fontSize: 14 },
  buttonQuietCork: { backgroundColor: color.corkWash, borderColor: color.corkWash },
  buttonQuietCorkText: { color: color.cork },
  error: { fontFamily: font.body, fontSize: size.body, color: color.cork, textAlign: "center" },
  pressed: { transform: [{ scale: 0.97 }] },
  chipBase: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: color.inkWash,
  },
  chipActive: { backgroundColor: color.courtWash },
  chipLabel: { fontFamily: font.bold, fontSize: 12.5, color: color.ink2 },
  chipLabelActive: { color: color.court },
});
