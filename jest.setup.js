// Fake Supabase env so components importing lib/supabase mount under jest.
// Unit tests make no network calls; the values only need to exist. ??= so the
// integration runner can inject the real project env instead.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= "sb_publishable_fake";

// jest-expo stubs fetch with a mock that answers nothing, which is right for
// unit tests and fatal for integration runs. INTEGRATION=1 swaps in a real
// fetch before any module captures the stub. node-fetch is already in the
// tree via react-native-web → fbjs → cross-fetch; if any hop drops it, this
// line fails loudly and node-fetch becomes an explicit devDependency.
if (process.env.INTEGRATION) {
  global.fetch = require("node-fetch");
}

// Feather icons load a font through expo-asset at render time, which the
// jest asset registry cannot serve; the tests care about labels, not glyphs.
jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  const { createElement } = require("react");
  return { Feather: (props) => createElement(Text, props, props.name) };
});
