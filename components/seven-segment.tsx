// Pattern 67 from ATELIER PRIME, ported to React Native primitives.
//
// SHUTTLE is a scoreboard app that had no scoreboard: the score was Plex
// Mono at 104px, which is a number, not a display. This is a display.
//
// Three things carry it, all from the source pattern. The canonical bit map
// (one hex per digit, seven bits). GHOST — unlit segments sit at 6% and are
// never removed, because a real display shows you every segment it owns and
// that is what says "hardware" instead of "font". And decay: a segment that
// turns OFF fades over 180ms while a segment that turns ON snaps, which is
// how LEDs actually behave.
//
// ponytail: segments are three Views each (body + two 45-degree caps) rather
// than one SVG polygon, because react-native-svg is not a dependency here.
// 21 Views per digit is nothing at this size. Swap to <Polygon> if a digit
// grid ever gets big.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { prefersReducedMotion } from "../lib/motion";

// canonical 10-digit map; 0x3F = a b c d e f. ' ' is the all-ghost blank
// that pads a one-digit score without moving the layout.
const MAP: Record<string, number> = {
  "0": 0x3f, "1": 0x06, "2": 0x5b, "3": 0x4f, "4": 0x66,
  "5": 0x6d, "6": 0x7d, "7": 0x07, "8": 0x7f, "9": 0x6f,
  "-": 0x40, " ": 0x00,
};

const BIT = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6 } as const;
type Seg = keyof typeof BIT;
const SEGS = Object.keys(BIT) as Seg[];

// Off-segment opacity, never 0. The source pattern's 0.06 is one number for
// one background; SHUTTLE draws this on two — chalk on court green for the
// serving side, ink on card white for the other — and the same alpha reads
// twice as loud on the green. Per-surface is the honest port: the grammar
// is "ghost, always present, never competing", not the literal constant.
const GHOST = 0.06;
const DECAY_MS = 180;

// proportions, verified against the rendered harness before this shipped
const W_RATIO = 0.6;
const T_RATIO = 0.145;
const GAP_RATIO = 0.2; // of thickness

// centreline endpoints, named by the junctions they connect
const LINE: Record<Seg, [keyof Junctions, keyof Junctions]> = {
  a: ["TL", "TR"], f: ["TL", "ML"], b: ["TR", "MR"],
  g: ["ML", "MR"], e: ["ML", "BL"], c: ["MR", "BR"], d: ["BL", "BR"],
};
type Junctions = { TL: P; TR: P; ML: P; MR: P; BL: P; BR: P };
type P = readonly [number, number];

function Digit({ char, size, ink, ghost }: { char: string; size: number; ink: string; ghost: number }) {
  const h = size;
  const w = size * W_RATIO;
  const t = size * T_RATIO;
  const gap = t * GAP_RATIO;
  const cap = t / Math.SQRT2; // a 45-degree square whose diagonal is the thickness
  const J: Junctions = {
    TL: [t / 2, t / 2], TR: [w - t / 2, t / 2],
    ML: [t / 2, h / 2], MR: [w - t / 2, h / 2],
    BL: [t / 2, h - t / 2], BR: [w - t / 2, h - t / 2],
  };

  const bits = MAP[char] ?? 0;
  // one Animated.Value per segment: opacity lives on the WRAPPER, never on
  // the three pieces, or 6% over 6% draws a visible X on every unlit segment
  const anim = useRef(SEGS.map(() => new Animated.Value(ghost))).current;

  useEffect(() => {
    anim.forEach((value, i) => {
      const on = (bits >> BIT[SEGS[i]]) & 1;
      const target = on ? 1 : ghost;
      // a segment that is already where it belongs schedules nothing: on
      // mount that is six of seven, and each one was a live 180ms timer
      if ((value as unknown as { _value: number })._value === target) return;
      // on snaps, off decays — and reduced motion collapses the decay, since
      // this is an opacity change that carries meaning
      if (on || prefersReducedMotion()) value.setValue(target);
      else Animated.timing(value, { toValue: target, duration: DECAY_MS, useNativeDriver: false }).start();
    });
  }, [bits, anim, ghost]);

  return (
    <View style={{ width: w, height: h }}>
      {SEGS.map((k, i) => {
        const [p, q] = LINE[k];
        const [x0, y0] = J[p];
        const [x1, y1] = J[q];
        const vertical = x0 === x1;
        // inset each end by the gap, then by half a thickness so the
        // chamfer's point lands exactly on the junction
        const from = (vertical ? y0 : x0) + gap + t / 2;
        const to = (vertical ? y1 : x1) - gap - t / 2;
        const body = vertical
          ? { left: x0 - t / 2, top: from, width: t, height: to - from }
          : { left: from, top: y0 - t / 2, width: to - from, height: t };
        return (
          <Animated.View key={k} style={[StyleSheet.absoluteFill, { opacity: anim[i] }]}>
            <View style={[styles.piece, body, { backgroundColor: ink }]} />
            {[from, to].map((at) => (
              <View
                key={at}
                style={[
                  styles.piece,
                  {
                    left: (vertical ? x0 : at) - cap / 2,
                    top: (vertical ? at : y0) - cap / 2,
                    width: cap,
                    height: cap,
                    backgroundColor: ink,
                    transform: [{ rotate: "45deg" }],
                  },
                ]}
              />
            ))}
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function SevenSegment({
  value,
  size,
  ink,
  ghost = GHOST,
  minDigits = 2,
}: {
  value: number;
  size: number;
  ink: string;
  ghost?: number;
  minDigits?: number;
}) {
  // pad with blanks, not zeroes: a scoreboard showing "05" is lying about
  // the score, but a blank digit is an honest unlit one and the two sides
  // stay the same width all match
  const text = String(Math.max(0, Math.trunc(value))).padStart(minDigits, " ");
  return (
    <View style={[styles.row, { gap: size * 0.09 }]}>
      {/* Seven segments made of Views are invisible to a screen reader and
          to anything that reads text. The number stays in the tree, clipped
          to a pixel — the display is decoration over a real value. */}
      <Text style={styles.value}>{Math.max(0, Math.trunc(value))}</Text>
      {[...text].map((ch, i) => (
        <Digit key={i} char={ch} size={size} ink={ink} ghost={ghost} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  piece: { position: "absolute" },
  value: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
});
