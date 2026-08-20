// Pattern 04 from ATELIER PRIME, ported to React Native.
//
// The trick is not that digits move, it is which WAY they move. A count
// going up rolls forward even when the digit wraps 8 → 2, and a count going
// down rolls back. Get that wrong and the number reads as a slot machine
// instead of a counter. The reel holds two turns so either direction has
// somewhere to travel.
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View, type TextStyle } from "react-native";
import { SPRING, timing } from "../lib/motion";

const REEL = [...Array(20).keys()].map((n) => n % 10); // 0-9, twice

function Column({ digit, dir, style, lineHeight }: {
  digit: number;
  dir: number;
  style: TextStyle;
  lineHeight: number;
}) {
  const y = useRef(new Animated.Value(-digit * lineHeight)).current;
  const at = useRef(digit);

  useEffect(() => {
    let delta = digit - at.current;
    if (dir > 0 && delta < 0) delta += 10; // wrap forward: 8 → 2 is +4
    if (dir < 0 && delta > 0) delta -= 10; // wrap back:    2 → 8 is −4
    const base = delta < 0 ? at.current + 10 : at.current;
    y.setValue(-base * lineHeight); // snap to the same glyph, one turn along
    at.current = digit;
    if (delta !== 0) timing(y, -(base + delta) * lineHeight, SPRING).start();
  }, [digit, dir, y, lineHeight]);

  return (
    <View style={{ height: lineHeight, overflow: "hidden" }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {REEL.map((n, i) => (
          <Text key={i} style={[style, { height: lineHeight, lineHeight }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export default function NumberRoll({
  value,
  style,
  size,
}: {
  value: number;
  style: TextStyle;
  size: number;
}) {
  const prev = useRef(value);
  const dir = Math.sign(value - prev.current) || 1;
  prev.current = value;
  const lineHeight = Math.round(size * 1.2);
  const digits = [...String(Math.max(0, Math.trunc(value)))].map(Number);
  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        // keyed by place from the right, so 9 → 10 grows a column instead of
        // re-keying every existing one and snapping them all
        <Column
          key={digits.length - i}
          digit={d}
          dir={dir}
          style={style}
          lineHeight={lineHeight}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: "row" } });
