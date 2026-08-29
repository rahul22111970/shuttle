// Chart primitives for the analytics surfaces (ANALYTICS.md). The line
// chart is the only SVG in the app; bars, heatmaps and tracks stay Views,
// the me-view Spark precedent. Colours are tokens, resolved to concrete
// values where SVG needs attributes.
import { Platform, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import Svg, { Circle, Line as AxisLine, Path } from "react-native-svg";
import { INITIAL_RATING } from "@shuttle/rating";
import { color, font, size, space } from "../theme/tokens";

// react-native-svg writes colours as SVG ATTRIBUTES, and a CSS var() is
// ignored there, so web tokens resolve through the live palette. A theme
// flip mid-view leaves the SVG on the old palette until the next render;
// accepted - it self-heals on navigation or refetch.
function svgColor(token: string): string {
  if (Platform.OS === "web" && token.startsWith("var(")) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(
      token.slice(4, -1)
    );
    if (v) return v.trim();
  }
  return token;
}

export type LinePoint = { value: number; decay: boolean };

const LINE_H = 120;
const PAD = 8;
// the min/max figures live in a left gutter so they never sit on the line
const GUTTER = 40;

// The rating line: one series in court, decay weeks as hollow markers so a
// deduction is always a labelled event, never a mysterious dip. Min/max
// ride the left gutter; the current value lives in the row under the chart.
export function RatingLine({ series }: { series: readonly LinePoint[] }) {
  const [width, setWidth] = useState(0);
  if (series.length < 2) return null;
  const values = series.map((p) => p.value);
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = Math.max(hi - lo, 12);
  const x = (i: number) => GUTTER + (i / (series.length - 1)) * (width - GUTTER - PAD);
  const y = (v: number) => PAD + ((hi - v) / span) * (LINE_H - PAD * 2);
  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const last = series[series.length - 1];
  const decayIdx = series.map((p, i) => (p.decay ? i : -1)).filter((i) => i >= 0);
  const showBase = lo <= INITIAL_RATING && INITIAL_RATING <= hi;

  return (
    <View
      style={styles.lineWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={`Rating from ${series[0].value} to ${last.value}`}
    >
      {width > 0 ? (
        <Svg width={width} height={LINE_H}>
          {showBase ? (
            <AxisLine
              x1={PAD}
              y1={y(INITIAL_RATING)}
              x2={width - PAD}
              y2={y(INITIAL_RATING)}
              stroke={svgColor(color.line)}
              strokeWidth={1}
            />
          ) : null}
          <Path
            d={path}
            stroke={svgColor(color.court)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
          {!last.decay ? (
            <>
              <Circle cx={x(series.length - 1)} cy={y(last.value)} r={5.5} fill={svgColor(color.card)} />
              <Circle cx={x(series.length - 1)} cy={y(last.value)} r={3.5} fill={svgColor(color.court)} />
            </>
          ) : null}
          {/* drawn after the endpoint: a chain that ENDS on a decay stays
              visibly hollow, the whole point of marking them */}
          {decayIdx.map((i) => (
            <Circle
              key={i}
              cx={x(i)}
              cy={y(series[i].value)}
              r={3}
              fill={svgColor(color.card)}
              stroke={svgColor(color.ink3)}
              strokeWidth={1.5}
            />
          ))}
        </Svg>
      ) : null}
      <Text style={[styles.axis, styles.axisHi]}>{hi}</Text>
      <Text style={[styles.axis, styles.axisLo]}>{lo}</Text>
    </View>
  );
}

// Activity heatmap: one hue, more games = deeper. Views only; columns are
// Mon..Sun weeks, oldest left. The caption under it carries the numbers.
export function Heatmap({
  weeks,
  max,
}: {
  weeks: readonly (readonly { date: string; count: number }[])[];
  max: number;
}) {
  const level = (count: number) =>
    count === 0 ? 0 : max <= 1 ? 3 : Math.min(3, Math.ceil((count / max) * 3));
  const OPACITY = [0, 0.3, 0.62, 1];
  return (
    <View style={styles.heatRow} accessibilityLabel="Games per day, recent weeks">
      {weeks.map((col, w) => (
        <View key={w} style={styles.heatCol}>
          {col.map((cell) => (
            <View
              key={cell.date}
              style={[
                styles.heatCell,
                cell.count === 0
                  ? styles.heatEmpty
                  : { backgroundColor: color.court, opacity: OPACITY[level(cell.count)] },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// A head-to-head record as one split track: wins in court, losses neutral,
// a 2px surface gap between them. Never orange - cork means a clock.
export function SplitBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return null;
  return (
    <View style={styles.splitTrack}>
      {wins > 0 ? <View style={{ flex: wins, backgroundColor: color.court }} /> : null}
      {wins > 0 && losses > 0 ? <View style={styles.splitGap} /> : null}
      {losses > 0 ? <View style={{ flex: losses, backgroundColor: color.inkWash2 }} /> : null}
    </View>
  );
}

// The leaderboard's weekly movement: direction plus points, text tokens
// only (up wears court because up is good; down stays neutral ink).
export function WeekDelta({ delta }: { delta: number | null | undefined }) {
  if (delta == null || delta === 0) return <Text style={styles.deltaFlat}>–</Text>;
  const up = delta > 0;
  return (
    <Text style={up ? styles.deltaUp : styles.deltaDown}>
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </Text>
  );
}

const styles = StyleSheet.create({
  lineWrap: { alignSelf: "stretch", height: LINE_H },
  axis: {
    position: "absolute",
    left: PAD,
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.ink3,
    fontVariant: ["tabular-nums"],
  },
  axisHi: { top: 0 },
  axisLo: { bottom: 0 },
  heatRow: { flexDirection: "row", gap: 3 },
  heatCol: { gap: 3 },
  heatCell: { width: 12, height: 12, borderRadius: 3 },
  heatEmpty: { backgroundColor: color.inkWash },
  splitTrack: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    alignSelf: "stretch",
  },
  splitGap: { width: 2 },
  deltaUp: {
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.court,
    fontVariant: ["tabular-nums"],
  },
  deltaDown: {
    fontFamily: font.mono,
    fontSize: size.label,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  deltaFlat: { fontFamily: font.mono, fontSize: size.label, color: color.ink3 },
});
