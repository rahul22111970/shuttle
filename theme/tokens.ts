// The design system, from DESIGN.md. Colour lives here and nowhere else, and
// tokens.test.ts fails the build on a colour literal found outside this folder.
// Radii, spacing and type sizes live here too, but nothing lints those yet.

import { Platform } from "react-native";
import type { BoxShadowValue } from "react-native";

const light = {
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

  // neutral fills from the mockup: chips at rest, L badges, tool buttons
  inkWash: "rgba(20,24,27,0.05)",
  inkWash2: "rgba(20,24,27,0.12)",
} as const;

// The hall after lights-out, from mockup/shuttle-matchday.html. courtDeep is
// derived (the mockup has none): court darkened one step, same hue.
const dark = {
  fog0: "#101517",
  fog1: "#0C1113",
  fog2: "#0C1113",

  card: "#171D20",
  ink: "#E7ECEE",
  ink2: "#A9B4BC",
  ink3: "#6E7A83",

  line: "rgba(231,236,238,0.09)",
  lineStrong: "rgba(231,236,238,0.16)",

  court: "#2FA37F",
  courtDeep: "#26866A",
  courtWash: "rgba(47,163,127,0.12)",

  cork: "#F0693F",
  corkWash: "rgba(240,105,63,0.13)",

  chalk: "#FFFFFF",

  inkWash: "rgba(231,236,238,0.07)",
  inkWash2: "rgba(231,236,238,0.16)",
} as const satisfies Record<keyof typeof light, string>;

export const PALETTES = { light, dark } as const;

function asVars<T extends Record<string, string>>(p: T): Record<keyof T, string> {
  const out = {} as Record<keyof T, string>;
  for (const k in p) out[k] = `var(--sh-${k})`;
  return out;
}

// On web every token is a CSS custom property; the root layout writes both
// palettes onto :root and flipping [data-theme] re-colours every StyleSheet
// untouched. Native stays static light hex until the EAS build carries dark.
export const color: Record<keyof typeof light, string> =
  Platform.OS === "web" ? asVars(light) : light;

// One decision, held. Inner radius is outer minus its padding.
export const radius = { card: 16, control: 10 } as const;

// The 4px scale. Tight inside a card (12-16), generous between zones (24-32).
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// 1.25 from a 15px body. Label is 11 by decree, not by ratio.
// digits is the scorer's display tier, shared by both doors (casual scorer
// now, umpire console at P3).
export const size = { label: 11, body: 15, lead: 19, display: 23, hero: 29, digits: 96 } as const;

// The type voices, from DESIGN.md: Archivo for display, Inter for body,
// IBM Plex Mono (tabular) for every live numeral. Loaded in the root layout.
export const font = {
  display: "Archivo_900Black",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  heavy: "Inter_800ExtraBold",
  mono: "IBMPlexMono_500Medium",
  monoBold: "IBMPlexMono_700Bold",
} as const;

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
