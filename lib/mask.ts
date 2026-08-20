// Pattern 43 from ATELIER PRIME: diff the VALUE, never read a key.
//
// Two bugs this exists to kill. First the source pattern's: a controlled
// formatted field reformats to the same string when you backspace over a
// literal, so the caret jumps back and the keypress appears to do nothing.
// The rule is theirs — when only literals were deleted, eat the digit the
// literal was hiding behind.
//
// Second, one this field has that theirs did not: "+91" is a literal made
// of DIGITS. Keep it inside the input and every reparse swallows it back
// into the number, so "9" becomes "+91 9" becomes "+91 919". The country
// code is a static label beside the field, never in it.
//
// The full pattern also rebuilds the caret in digit-space for mid-string
// edits. That is DOM selection work react-native TextInput does not hand us
// portably, and a phone number is typed left to right, so it is left out on
// purpose rather than faked.

// Indian mobiles are ten digits and everyone writes them five and five.
const GROUPS = [5, 5];
export const PHONE_DIGITS = GROUPS.reduce((n, g) => n + g, 0);

// Accepts what people paste, per lib/phone's rules: a bare ten, a 91- or
// 0-prefixed one. The prefix only comes off when what is left is exactly
// ten, because 9176543210 is itself a legal number.
export function digitsOf(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.length === PHONE_DIGITS + 2 && d.startsWith("91")) return d.slice(2);
  if (d.length === PHONE_DIGITS + 1 && d.startsWith("0")) return d.slice(1);
  return d.slice(0, PHONE_DIGITS);
}

export function formatIndianPhone(digits: string): string {
  const raw = digits.slice(0, PHONE_DIGITS);
  const parts: string[] = [];
  let at = 0;
  for (const g of GROUPS) {
    if (at >= raw.length) break;
    parts.push(raw.slice(at, at + g));
    at += g;
  }
  return parts.join(" ");
}

// What the field should become, given what it was and what the platform
// handed back. Callers keep the formatted string and read digitsOf() when
// they need the number.
export function maskPhone(previous: string, next: string): string {
  const before = digitsOf(previous);
  let after = digitsOf(next);
  // shorter text, same digits: only a literal went, so take the digit it hid
  if (next.length < previous.length && after === before) after = after.slice(0, -1);
  return formatIndianPhone(after);
}
