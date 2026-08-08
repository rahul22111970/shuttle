import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { color, radius, size, space, tracking } from "./tokens";

// The whole palette is the contract with DESIGN.md, not just the famous five.
// A typo in courtDeep or either wash would otherwise ship silently.
it("matches the palette in DESIGN.md exactly", () => {
  expect(color).toEqual({
    fog0: "#F7F9FA",
    fog1: "#F1F4F5",
    fog2: "#ECEFF1",
    card: "#FDFEFE",
    ink: "#14181B",
    ink2: "#4A5560",
    ink3: "#8B96A0",
    line: "rgba(20,24,27,0.08)",
    lineStrong: "rgba(20,24,27,0.14)",
    court: "#0E7A5A",
    courtDeep: "#0A5C44",
    courtWash: "rgba(14,122,90,0.08)",
    cork: "#E4572E",
    corkWash: "rgba(228,87,46,0.10)",
    chalk: "#FFFFFF",
    inkWash: "rgba(20,24,27,0.05)",
    inkWash2: "rgba(20,24,27,0.12)",
  });
});

it("holds the scale decisions", () => {
  expect(radius).toEqual({ card: 16, control: 10 });
  expect(space.xs).toBe(4);
  // 15 * 1.25^n, rounded. Label is 11 by decree, not by ratio.
  // digits is the scorer display tier, off the 1.25 ratio by decree (S1-15)
  expect(size).toEqual({ label: 11, body: 15, lead: 19, display: 23, hero: 29, digits: 96 });
  expect(tracking).toEqual({ label: 0.08, display: -0.02 });
});

// Hex, short hex, hex with alpha, and the functional notations. The washes in
// this palette are rgba(), which is exactly what a builder is most likely to
// paste inline, so a hex-only lint would be blind to the likeliest mistake.
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/;

const SKIP = new Set(["node_modules", ".git", ".expo", "dist", "theme", "ios", "android", "coverage", "assets"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Positive control. Without this the suite passes identically if the pattern
// were nonsense, and the criterion it exists to enforce would have no teeth.
it("detects colour literals in every form the palette uses", () => {
  for (const bad of ['"#FF00FF"', '"#fff"', '"#14181BFF"', "rgba(1,2,3,0.5)", "hsl(200 10% 50%)"]) {
    expect(COLOUR_LITERAL.test(bad)).toBe(true);
  }
  expect(COLOUR_LITERAL.test("const rest = 30")).toBe(false);
});

// The rule that keeps the system whole: colour lives in theme/ only. Walks the
// whole repo, not just the routes folder, so directories added later are
// covered the day they appear rather than the day someone remembers.
it("finds no colour literal outside theme/", () => {
  const offenders = walk(join(__dirname, ".."))
    .filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/.test(f))
    .filter((f) => COLOUR_LITERAL.test(readFileSync(f, "utf8")))
    .map((f) => f.split("/").slice(-2).join("/"));

  expect(offenders).toEqual([]);
});
