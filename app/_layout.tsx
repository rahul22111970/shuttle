import { Platform } from "react-native";
import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { useFonts } from "expo-font";
import { Archivo_900Black } from "@expo-google-fonts/archivo";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import { IBMPlexMono_500Medium, IBMPlexMono_700Bold } from "@expo-google-fonts/ibm-plex-mono";
import { AuthProvider } from "../lib/auth";
import { applyStoredTheme } from "../lib/theme";
import { PALETTES, color } from "../theme/tokens";

// The hall's morning light: web paints the fog gradient once on <body>;
// Screen backgrounds go transparent there so it shows through. Every token
// is a --sh-* custom property; system dark is the default and an explicit
// data-theme (persisted by lib/theme) wins over it.
if (Platform.OS === "web" && typeof document !== "undefined") {
  applyStoredTheme();
  const vars = (p: Record<string, string>) =>
    Object.entries(p)
      .map(([k, v]) => `--sh-${k}: ${v};`)
      .join(" ");
  const style = document.createElement("style");
  style.textContent =
    `:root { ${vars(PALETTES.light)} }` +
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars(PALETTES.dark)} } }` +
    `:root[data-theme="dark"] { ${vars(PALETTES.dark)} }` +
    "html, body, #root { height: 100%; margin: 0; background: transparent; }" +
    `body { background-image: linear-gradient(180deg, ${color.fog0} 0%, ${color.fog1} 55%, ${color.fog2} 100%); background-attachment: fixed; }`;
  document.head.appendChild(style);
}

// On web the navigation container must not paint: its default grey card sat
// over the body gradient, which is what flips with the theme. Native keeps
// the static light fog.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Platform.OS === "web" ? "transparent" : color.fog0,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    IBMPlexMono_500Medium,
    IBMPlexMono_700Bold,
  });
  // error = fonts unreachable; ship the system stack rather than a blank hall
  if (!loaded && !error) return null;
  return (
    <AuthProvider>
      <ThemeProvider value={navTheme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </AuthProvider>
  );
}
