// The active group: one choice, stored on the device, honored everywhere.
// Every controller that used to grab listGroups()[0] asks pickActive
// instead, so switching in /groups changes the whole app.
import { Platform } from "react-native";
import type { Group } from "./session";
import type { Sport } from "./sport";

const KEY = "shuttle-active-group";
const SPORT_KEY = "shuttle-active-sport";

const storage = () =>
  Platform.OS === "web" && typeof localStorage !== "undefined" ? localStorage : null;

export function getActiveGroupId(): string | null {
  return storage()?.getItem(KEY) ?? null;
}

export function setActiveGroupId(id: string): void {
  storage()?.setItem(KEY, id);
}

// the stored choice wins while it is still one of the user's groups;
// otherwise the first group, matching the old behaviour
export function pickActive(groups: readonly Group[]): Group | null {
  if (groups.length === 0) return null;
  const stored = getActiveGroupId();
  return groups.find((g) => g.id === stored) ?? groups[0];
}

// The chosen sport, same shape as the active group: stored on the device,
// only ever asked for when the user actually has groups in both sports.
export function getActiveSport(): Sport | null {
  const stored = storage()?.getItem(SPORT_KEY);
  return stored === "badminton" || stored === "pickleball" ? stored : null;
}

export function setActiveSport(sport: Sport): void {
  storage()?.setItem(SPORT_KEY, sport);
}
