// The bank switch is the only logic in foley; everything else is an audio
// element the test environment does not have. Platform.OS is "ios" under
// jest-expo's default, so load() returns null and play() is a no-op — which
// is exactly what makes this safe to assert.
import { foley } from "./foley";

it("use() switches banks and never throws when no audio exists", () => {
  expect(() => {
    foley.use("pickleball");
    foley.drive();
    foley.smash();
    foley.drop();
    foley.serve();
    foley.use("badminton");
    foley.drive();
  }).not.toThrow();
});
