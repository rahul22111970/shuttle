// Patterns 12 (auto-FLIP) and 69 (staggered grid), which are one concern in
// a list: something arrived, or something moved, and either way it should
// not teleport.
//
// react-native-web ships LayoutAnimation as a stub — configureNext calls the
// completion callback and animates nothing — so this is hand-rolled FLIP.
// Same shape as the source: read the position, invert to where it was, play
// back to identity. onLayout gives us the read for free.
//
// The entry keyframe is the source's too: hold at zero for the first half,
// THEN arrive. A row that starts fading the instant it exists reads as a
// glitch; one that waits reads as a decision.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { prefersReducedMotion, SETTLE, timing } from "../lib/motion";

// pattern 69's constants, unchanged: 30ms per step, capped at 420 so a long
// list never makes the last row wait
const STEP = 30;
const CAP = 420;
const ENTRY = { duration: 390, easing: SETTLE.easing }; // SETTLE × 1.5

export default function Settle({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const shift = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  const was = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      enter.setValue(1);
      return;
    }
    const run = Animated.sequence([
      // the stagger, plus the hold that makes arrival deliberate
      Animated.delay(Math.min(CAP, index * STEP) + ENTRY.duration * 0.5),
      timing(enter, 1, ENTRY, false),
    ]);
    run.start();
    return () => run.stop();
  }, [index, enter]);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.y;
    const previous = was.current;
    was.current = next;
    // first layout is an arrival, not a move; the entry animation owns it
    if (previous === null || previous === next || prefersReducedMotion()) return;
    shift.setValue(previous - next); // invert
    timing(shift, 0, SETTLE).start(); // play
  };

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        {
          opacity: enter,
          transform: [
            { translateY: shift },
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
