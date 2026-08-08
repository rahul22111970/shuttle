// The theme choice, web only: a localStorage key and a data-theme stamp on
// <html>. The root layout's stylesheet does the rest. Native ignores all of
// this and ships static light until the EAS build carries dark.
export type ThemeChoice = "auto" | "light" | "dark";

const KEY = "shuttle-theme";

export function getThemeChoice(): ThemeChoice {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "auto";
}

function stamp(c: ThemeChoice) {
  if (typeof document === "undefined") return;
  // "auto" removes the attribute so the prefers-color-scheme rule decides
  if (c === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = c;
}

export function setThemeChoice(c: ThemeChoice) {
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, c);
  stamp(c);
}

export function applyStoredTheme() {
  stamp(getThemeChoice());
}
