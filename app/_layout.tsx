import { Platform } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Archivo_900Black } from "@expo-google-fonts/archivo";
import { Inter_400Regular, Inter_500Medium } from "@expo-google-fonts/inter";
import { IBMPlexMono_500Medium } from "@expo-google-fonts/ibm-plex-mono";
import { AuthProvider } from "../lib/auth";
import { color } from "../theme/tokens";

// The hall's morning light: web paints the fog gradient once on <body>;
// Screen backgrounds go transparent there so it shows through.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent =
    "html, body, #root { height: 100%; margin: 0; background: transparent; }" +
    `body { background-image: linear-gradient(180deg, ${color.fog0} 0%, ${color.fog1} 55%, ${color.fog2} 100%); background-attachment: fixed; }`;
  document.head.appendChild(style);
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Archivo_900Black,
    Inter_400Regular,
    Inter_500Medium,
    IBMPlexMono_500Medium,
  });
  // error = fonts unreachable; ship the system stack rather than a blank hall
  if (!loaded && !error) return null;
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
