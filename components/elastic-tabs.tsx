import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { prefersReducedMotion, SPRING, timing } from "../lib/motion";
import { color, font, layout, space } from "../theme/tokens";

// Pattern 38 from ATELIER PRIME. The old strip swapped a background colour
// between four pills, which tells you the state changed but not that YOU
// changed it. One indicator that travels does. The stretch is the whole
// trick: it leans out of the tab it leaves, overshoots past the one it
// lands on, then settles — so the motion has a direction you can feel.
//
// These tabs are flex: 1 and therefore equal width, so the indicator's
// position comes from the index and the measured track rather than from
// measuring four rects every press.
export default function ElasticTabs<K extends string>({
  sections,
  value,
  onPick,
}: {
  sections: readonly { key: K; label: string }[];
  value: K;
  onPick: (key: K) => void;
}) {
  const [track, setTrack] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(1)).current;
  const index = sections.findIndex((s) => s.key === value);
  const was = useRef(index);
  const slot = track > 0 ? (track - space.sm * (sections.length - 1)) / sections.length : 0;
  const step = slot + space.sm;

  useEffect(() => {
    if (track === 0) return;
    const moving = index - was.current;
    was.current = index;
    x.setValue(index * step); // land at the destination now
    if (moving === 0 || prefersReducedMotion()) return; // positional: instant
    // scaleX pulses out and back over the same beat the travel takes; the
    // origin follows the direction so the stretch trails the movement
    stretch.setValue(1);
    Animated.sequence([
      timing(stretch, 1.15, { duration: SPRING.duration * 0.4, easing: SPRING.easing }),
      timing(stretch, 1, { duration: SPRING.duration * 0.6, easing: SPRING.easing }),
    ]).start();
  }, [index, step, track, x, stretch]);

  return (
    <View
      style={styles.tabs}
      onLayout={(e) => setTrack(e.nativeEvent.layout.width)}
    >
      {track > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: slot,
              transform: [{ translateX: x }, { scaleX: stretch }],
              transformOrigin: index >= was.current ? "left" : "right",
            },
          ]}
        />
      ) : null}
      {sections.map((s) => {
        const on = value === s.key;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={styles.tab}
            onPress={() => onPick(s.key)}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    gap: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: color.inkWash,
  },
  indicator: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: color.ink,
  },
  tabText: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  tabTextOn: { color: color.fog0 },
});
