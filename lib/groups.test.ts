import { getActiveGroupId, pickActive, setActiveGroupId } from "./groups";
import type { Group } from "./session";

const g = (id: string): Group =>
  ({ id, name: id, captain_id: "c", created_at: "" }) as Group;

// jest runs as native, where storage is absent: choices no-op and the
// fallback contract carries everything
it("no groups picks nothing", () => {
  expect(pickActive([])).toBeNull();
});

it("without a stored choice the first group wins (the old behaviour)", () => {
  expect(pickActive([g("a"), g("b")])?.id).toBe("a");
});

it("a stored choice that is no longer a membership falls back to first", () => {
  setActiveGroupId("gone"); // no-op off web, and harmless on it
  expect(getActiveGroupId()).toBeNull();
  expect(pickActive([g("a"), g("b")])?.id).toBe("a");
});
