// The motion substrate. Ported from ATELIER PRIME (patterns 05 damp, 46 pull
// to refresh, 80 reduced motion) — the math and the constants, none of the
// skin. Everything here renders in SHUTTLE's own tokens.
//
// Before this file the app had no motion at all: the only movement anywhere
// was a 0.98 scale on press.
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

// Pattern 05, the one formula. A fixed fraction per frame (x += (t-x)*0.1)
// is wrong on every device that is not 60 Hz: four times fewer ticks means
// four times behind. This is frame-rate independent — λ is "how fast",
// dt is however long the frame actually took.
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// λ values that read as themselves. Higher is snappier.
export const LAMBDA = { snap: 18, ui: 11, drift: 6 } as const;

// Pattern 38's spring, expressed as a curve Animated can drive. The overshoot
// is the point: a tab indicator that eases in with no overrun reads as a
// slide, not a spring.
export const SPRING = { duration: 420, easing: Easing.bezier(0.22, 1.4, 0.36, 1) };
export const SETTLE = { duration: 260, easing: Easing.bezier(0.32, 0.72, 0, 1) };

// Pattern 80, the positional split. Reduced motion does NOT mean no motion:
// opacity and colour survive, movement does not. Every caller here reads
// this before it animates anything that travels.
let reduced = false;
if (Platform.OS === "web" && typeof window !== "undefined" && window.matchMedia) {
  const q = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = q.matches;
  q.addEventListener?.("change", (e) => {
    reduced = e.matches;
  });
} else {
  AccessibilityInfo.isReduceMotionEnabled?.()
    .then((on) => {
      reduced = on;
    })
    .catch(() => {});
}

export const prefersReducedMotion = (): boolean => reduced;

// A timing that collapses to an instant landing under reduced motion, so
// callers never branch. Positional animations pass travels: true.
export function timing(
  value: Animated.Value,
  toValue: number,
  spec: { duration: number; easing: (v: number) => number },
  travels = true
): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue,
    duration: travels && reduced ? 0 : spec.duration,
    easing: spec.easing,
    useNativeDriver: Platform.OS !== "web",
  });
}

// Pattern 46's rubber band, from use-gesture. Pull hard and the sheet still
// only ever approaches h; there is no wall to hit and no linear stretch to
// give the game away.
export const rubber = (distance: number, height: number, c = 1): number =>
  (distance * height * c) / (height + c * distance);

// Pattern 46's judgement constants, unchanged.
export const PULL = { arm: 70, hold: 54, backtrack: 12 } as const;
