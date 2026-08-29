import { AVATAR_PRESETS, avatarSource, initialsOf } from "./avatar";

it("avatarSource resolves presets, photos and junk", () => {
  expect(avatarSource("preset:shuttle")).toBe(AVATAR_PRESETS[0].source);
  expect(avatarSource("preset:nope")).toBeNull();
  const photo = avatarSource("photo:u1/1.jpg");
  expect(photo && typeof photo === "object" && "uri" in photo).toBe(true);
  expect(avatarSource(null)).toBeNull();
  expect(avatarSource("javascript:alert(1)")).toBeNull();
});

it("initials take the first two words, uppercased", () => {
  expect(initialsOf("Rahul Pareek")).toBe("RP");
  expect(initialsOf("Gautam")).toBe("G");
  expect(initialsOf("  sai  kiran ")).toBe("SK");
  expect(initialsOf("")).toBe("?");
});
