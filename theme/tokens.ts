// The design system, from DESIGN.md. Colour lives here and nowhere else, and
// tokens.test.ts fails the build on a colour literal found outside this folder.
// Radii, spacing and type sizes live here too, but nothing lints those yet.

import type { BoxShadowValue } from "react-native";

export const color = {
  // Page gradient stops. The hall's morning light.
  fog0: "#F7F9FA",
  fog1: "#F1F4F5",
  fog2: "#ECEFF1",

  card: "#FDFEFE",
  ink: "#14181B",
  ink2: "#4A5560",
  ink3: "#8B96A0",

  line: "rgba(20,24,27,0.08)",
  lineStrong: "rgba(20,24,27,0.14)",

  court: "#0E7A5A",
  courtDeep: "#0A5C44",
  courtWash: "rgba(14,122,90,0.08)",

  // Time pressure only: walkover clocks, delay flags, rest-floor violations.
  // If it is orange, a clock is running.
  cork: "#E4572E",
  corkWash: "rgba(228,87,46,0.10)",

  // Court-line white. Only ever on green surfaces.
  chalk: "#FFFFFF",
} as const;

// One decision, held. Inner radius is outer minus its padding.
export const radius = { card: 16, control: 10 } as const;

// The 4px scale. Tight inside a card (12-16), generous between zones (24-32).
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// 1.25 from a 15px body. Label is 11 by decree, not by ratio.
// digits is the scorer's display tier, shared by both doors (casual scorer
// now, umpire console at P3).
export const size = { label: 11, body: 15, lead: 19, display: 23, hero: 29, digits: 96 } as const;

// The one form-column width. Screens centre it; 390 minus padding fits inside.
export const layout = { column: 360 } as const;

// Ratios, not pixels. React Native letterSpacing is absolute, so a consumer
// multiplies by its own size. Pinning one number here silently gives the wrong
// percentage at every other step.
export const tracking = { label: 0.08, display: -0.02 } as const;

// Light mode depth is a layered ring, never a hard border. These are the keys
// React Native's `boxShadow` accepts; `satisfies` makes a wrong one a typecheck
// failure here rather than a discovery in the first screen that uses it.
export const shadow = {
  ring: [
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: "rgba(20,24,27,0.05)" },
    { offsetX: 0, offsetY: 1, blurRadius: 2, spreadDistance: -1, color: "rgba(20,24,27,0.06)" },
    { offsetX: 0, offsetY: 2, blurRadius: 6, spreadDistance: 0, color: "rgba(20,24,27,0.05)" },
  ],
} as const satisfies { ring: readonly BoxShadowValue[] };
