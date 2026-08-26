// The shared primitives every screen was quietly duplicating (S0-10 review
// note, consolidated at S1-10): centered fog screen, ring-shadow card,
// court button, wordmark, error line. Tokens only, here and nowhere else.
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion, PULL, rubber, SETTLE, timing } from "../lib/motion";
import { maskPhone, PHONE_DIGITS } from "../lib/mask";
import { announce } from "../lib/announce";
import { color, font, layout, radius, shadow, size, space, tracking } from "../theme/tokens";

export function Screen({
  children,
  testID,
  onRefresh,
}: {
  children: ReactNode;
  testID?: string;
  // opt in and the screen gains pattern 46. Leave it out and this renders
  // exactly the ScrollView it always did — no responder in the way.
  onRefresh?: () => Promise<unknown>;
}) {
  // a screen must scroll: a fixed View silently swallowed everything below
  // the fold on real phones. Taps land while the keyboard is up.
  const pull = usePull(onRefresh);
  const body = (
    <ScrollView
      style={styles.screenScroll}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      testID={testID}
      scrollEventThrottle={16}
      onScroll={onRefresh ? (e) => pull.onScroll(e) : undefined}
      {...(onRefresh ? pull.handlers : {})}
    >
      {children}
    </ScrollView>
  );
  if (!onRefresh) return body;
  return (
    <View style={styles.pullRoot}>
      <View style={styles.pullTrack} pointerEvents="none">
        <Animated.View
          style={[
            styles.pullFill,
            { transform: [{ scaleX: pull.arc }] },
            pull.armed && styles.pullFillArmed,
          ]}
        />
      </View>
      <Animated.View style={{ flex: 1, transform: [{ translateY: pull.offset }] }}>
        {body}
      </Animated.View>
    </View>
  );
}

// Pattern 46, hand-rolled: react-native-web ships RefreshControl as a stub
// that drops every prop and renders a plain View, so the platform gives us
// nothing here. The constants are the source pattern's, unchanged — arm at
// 70, hold at 54, and a 12px backtrack disarms, because letting go while
// pulling BACK means you changed your mind.
function usePull(onRefresh?: () => Promise<unknown>) {
  const offset = useRef(new Animated.Value(0)).current;
  const arc = useRef(new Animated.Value(0)).current;
  const [armed, setArmed] = useState(false);
  const at = useRef({ top: 0, peak: 0, raw: 0, own: false });

  const settle = (to: number) => {
    setArmed(false);
    at.current.peak = 0;
    timing(offset, to, SETTLE).start();
    timing(arc, to > 0 ? 1 : 0, SETTLE, false).start();
  };

  const handlers = useRef(
    PanResponder.create({
      // the takeover test: only a downward drag with the list already at the
      // top is ours. Everything else stays a scroll.
      onMoveShouldSetPanResponder: (_e, g) =>
        !!onRefresh && at.current.top <= 0 && g.dy > 2 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy <= 0) return settle(0);
        at.current.own = true;
        at.current.raw = g.dy;
        at.current.peak = Math.max(at.current.peak, g.dy);
        const eff = rubber(g.dy, 400);
        offset.setValue(prefersReducedMotion() ? 0 : eff);
        arc.setValue(Math.min(1, eff / PULL.arm));
        setArmed(eff >= PULL.arm && at.current.peak - g.dy < PULL.backtrack);
      },
      onPanResponderRelease: () => {
        // judged once, on let go
        const commit = at.current.own && armedRef.current;
        at.current.own = false;
        if (!commit || !onRefresh) return settle(0);
        settle(PULL.hold);
        onRefresh().finally(() => settle(0));
      },
      onPanResponderTerminate: () => settle(0),
    })
  ).current.panHandlers;

  // the responder closure is created once; armed has to reach it by ref
  const armedRef = useRef(false);
  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  return {
    handlers,
    armed,
    offset,
    arc,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      at.current.top = e.nativeEvent.contentOffset.y;
    },
  };
}

// Pattern 43's field. The country code is a label, not a value: it never
// enters the input, so nothing can reparse it back into the number.
export function PhoneField({
  value,
  onChange,
  placeholder = "98765 43210",
  label,
}: {
  value: string;
  onChange: (formatted: string) => void;
  placeholder?: string;
  label: string;
}) {
  return (
    <View style={styles.phoneRow}>
      <Text style={styles.phonePrefix}>+91</Text>
      <TextInput
        style={styles.phoneInput}
        value={value}
        onChangeText={(next) => onChange(maskPhone(value, next))}
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColor={color.ink3}
        inputMode="tel"
        autoComplete="tel"
        maxLength={PHONE_DIGITS + 1}
      />
    </View>
  );
}

// Pattern 54. The source pattern's real content is a scroll-restore dance
// around collapsing the box to 4px to force an honest scrollHeight; that is
// a DOM problem react-native does not have, because onContentSizeChange
// reports the measurement directly. What ports is the clamp and the honest
// overflow: grow to the content, stop at max, never twitch.
export function GrowingInput({
  value,
  onChange,
  placeholder,
  label,
  minHeight = 120,
  maxHeight = 360,
  testID,
  footer,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  minHeight?: number;
  maxHeight?: number;
  testID?: string;
  // pinned inside the box's bottom edge (suggestion chips); the input pads
  // itself so text never slides underneath, and since contentSize is
  // scrollHeight the growth formula already counts that padding
  footer?: ReactNode;
}) {
  const [height, setHeight] = useState(minHeight);
  return (
    <View style={styles.growWrap}>
      <TextInput
        testID={testID}
        style={[styles.growing, { height }, footer != null && styles.growingPadded]}
        value={value}
        onChangeText={onChange}
        onContentSizeChange={(e) =>
          setHeight(
            Math.min(Math.max(e.nativeEvent.contentSize.height + 24, minHeight), maxHeight)
          )
        }
        scrollEnabled={height >= maxHeight}
        multiline
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColor={color.ink3}
        textAlignVertical="top"
      />
      {footer != null ? <View style={styles.growFooter}>{footer}</View> : null}
    </View>
  );
}

// The shapes, named for what they stand in for. Heights are the real
// components' type sizes, so the skeleton is the same height as what lands.
export const SKEL = {
  card: [{ w: "34%", h: size.label }, { w: "82%", h: size.body }, { w: "60%", h: size.body }],
  rows: [{ w: "70%", h: size.lead }, { w: "45%", h: size.body }, { w: "62%", h: size.body }, { w: "38%", h: size.body }],
  chips: [{ w: "34%", h: size.label }, { w: "92%", h: 28 }, { w: "74%", h: 28 }],
} as const;

// Pattern 48. The skeleton is built from the same token numbers the real
// card is, so it predicts the layout instead of guessing at it, and the
// card keeps its height so nothing jumps when the content lands. One
// shimmer for the whole card, never one per bar.
export function Skeleton({
  bars,
  testID = "skeleton",
}: {
  bars: readonly { w: string; h: number }[];
  testID?: string;
}) {
  const shimmer = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 720, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0.5, duration: 720, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  return (
    <Card testID={testID}>
      <Animated.View style={{ opacity: shimmer, gap: space.sm, width: "100%" }}>
        {bars.map((b, i) => (
          <View
            key={i}
            style={{
              width: b.w as ViewStyle["width"],
              height: b.h,
              borderRadius: 3,
              backgroundColor: color.inkWash,
            }}
          />
        ))}
      </Animated.View>
    </Card>
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

// Pattern 83. The source builds a summary that scrolls the label and
// focuses the field; SHUTTLE's forms are two fields deep, so a summary
// would be scaffolding. What ports is the part that matters: an error that
// appears must be ANNOUNCED, not just drawn, and it must be reachable.
// Every error surface in the app already comes through here.
// Pattern 83. The source builds a summary that scrolls the label and focuses
// the field; SHUTTLE's forms are two fields deep, so a summary would be
// scaffolding. What ports is the part that matters: an error that appears
// must be ANNOUNCED, not just drawn. Every error surface routes through here.
export function ErrorNote({ children }: { children: ReactNode }) {
  const said = useRef<string | null>(null);
  const text = typeof children === "string" ? children : null;
  useEffect(() => {
    // assertive: an error interrupts. The same message twice running is the
    // same problem, not a new one.
    if (text && text !== said.current) {
      said.current = text;
      announce(text, true);
    }
  }, [text]);
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
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

const inputBase = {
  borderWidth: 1,
  borderColor: color.lineStrong,
  borderRadius: radius.control,
  padding: space.md,
  fontFamily: font.body,
  fontSize: size.body,
  color: color.ink,
  backgroundColor: color.card,
} as const;

const styles = StyleSheet.create({
  phoneRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    ...inputBase,
    padding: 0,
    paddingLeft: space.md,
  },
  phonePrefix: { fontFamily: font.mono, fontSize: size.body, color: color.ink3 },
  phoneInput: {
    flex: 1,
    paddingVertical: space.md,
    paddingRight: space.md,
    fontFamily: font.mono,
    fontSize: size.body,
    color: color.ink,
  },
  growing: {
    alignSelf: "stretch",
    ...inputBase,
    backgroundColor: color.fog1,
    lineHeight: size.body * 1.5,
  },
  growWrap: { alignSelf: "stretch" },
  growingPadded: { paddingBottom: space.md + 44 },
  growFooter: {
    position: "absolute",
    bottom: space.md,
    left: space.md,
    right: space.md,
  },
  pullRoot: { flex: 1, overflow: "hidden" },
  pullTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
    backgroundColor: "transparent",
  },
  pullFill: {
    height: 2,
    backgroundColor: color.ink3,
    transformOrigin: "left",
  },
  pullFillArmed: { backgroundColor: color.court },
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
