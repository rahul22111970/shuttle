// Indian mobile numbers only, per the P0 schema decision: E.164 +91, self-
// declared. Accepts the ways people actually type them (bare 10 digits,
// 91-prefixed, 0-prefixed, spaces and dashes) and refuses everything else.
export function parseIndianPhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "");
  const m = digits.match(/^(?:\+91|91|0)?([6-9][0-9]{9})$/);
  return m ? `+91${m[1]}` : null;
}
