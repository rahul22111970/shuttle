// Night-time liveness: a screen that shows other phones' actions must not
// wait for a tab switch. useLive = refetch on focus, every POLL_MS while
// the screen stays focused and the browser tab visible, and immediately
// when the tab becomes visible again.
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "expo-router";

export const POLL_MS = 8000;

export function useLive(load: () => void | Promise<void>): void {
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      load();
      const timer = setInterval(() => {
        if (
          Platform.OS !== "web" ||
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          load();
        }
      }, POLL_MS);
      return () => {
        focused.current = false;
        clearInterval(timer);
      };
    }, [load])
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const wake = () => {
      if (document.visibilityState === "visible" && focused.current) load();
    };
    document.addEventListener("visibilitychange", wake);
    return () => document.removeEventListener("visibilitychange", wake);
  }, [load]);
}
