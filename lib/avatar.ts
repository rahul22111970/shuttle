// Avatars: a profile carries 'preset:<key>' or 'photo:<uid>/<ts>.<ext>'.
// Presets are bundled PNGs; photos live in the public avatars bucket,
// timestamp-named so a new upload is a new URL and no cache goes stale.
import { supabase } from "./supabase";
import type { Profile } from "./profile";

export const AVATAR_PRESETS = [
  { key: "shuttle", source: require("../assets/avatars/preset-shuttle.png") },
  { key: "bolt", source: require("../assets/avatars/preset-bolt.png") },
  { key: "star", source: require("../assets/avatars/preset-star.png") },
  { key: "crown", source: require("../assets/avatars/preset-crown.png") },
  { key: "target", source: require("../assets/avatars/preset-target.png") },
  { key: "net", source: require("../assets/avatars/preset-net.png") },
  { key: "flame", source: require("../assets/avatars/preset-flame.png") },
  { key: "peak", source: require("../assets/avatars/preset-peak.png") },
  { key: "wave", source: require("../assets/avatars/preset-wave.png") },
  { key: "sun", source: require("../assets/avatars/preset-sun.png") },
  { key: "feather", source: require("../assets/avatars/preset-feather.png") },
  { key: "moon", source: require("../assets/avatars/preset-moon.png") },
] as const;

export type AvatarPresetKey = (typeof AVATAR_PRESETS)[number]["key"];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// what an <Image> can render for this avatar value, or null for initials
export function avatarSource(
  avatar: string | null | undefined
): number | { uri: string } | null {
  if (!avatar) return null;
  if (avatar.startsWith("preset:")) {
    const p = AVATAR_PRESETS.find((x) => x.key === avatar.slice(7));
    return p ? p.source : null;
  }
  if (avatar.startsWith("photo:")) {
    return { uri: supabase.storage.from("avatars").getPublicUrl(avatar.slice(6)).data.publicUrl };
  }
  return null;
}

// two letters for the empty state: first letters of the first two words
export function initialsOf(name: string): string {
  const ws = name.trim().split(/\s+/).filter(Boolean);
  return ((ws[0]?.[0] ?? "?") + (ws[1]?.[0] ?? "")).toUpperCase();
}

export async function saveAvatar(userId: string, avatar: string): Promise<Profile> {
  const res = await supabase
    .from("profiles")
    .update({ avatar })
    .eq("id", userId)
    .select()
    .single<Profile>();
  if (res.error) throw res.error;
  return res.data;
}

export class PhotoTooBigError extends Error {}
export class PhotoTypeError extends Error {}

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// picker uri -> bucket -> profile. Returns the updated profile. The type
// and size checks repeat what the bucket enforces (0019), for a message
// friendlier than a storage 4xx.
export async function uploadAvatarPhoto(userId: string, uri: string): Promise<Profile> {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > MAX_PHOTO_BYTES) throw new PhotoTooBigError();
  const ext = PHOTO_TYPES[blob.type];
  if (!ext) throw new PhotoTypeError();
  const path = `${userId}/${Date.now()}.${ext}`;
  const up = await supabase.storage.from("avatars").upload(path, blob, {
    contentType: blob.type,
  });
  if (up.error) throw up.error;
  return saveAvatar(userId, `photo:${path}`);
}
