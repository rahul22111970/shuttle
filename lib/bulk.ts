// Bulk score entry, the pure half: one pasted night -> parsed games plus
// per-line errors. No I/O; the screen feeds it the member list.
//
// Grammar per non-empty line: <names A> <score> <names B>. The score is the
// first \d{1,2} pair joined by -, en dash, : or a space; names are separated
// by &, comma, / or plain spaces. Tokens resolve by case-insensitive prefix
// on the member's first name; a multi-word token resolves by prefix per word
// against the full display name ("rahul d" -> Rahul Deo). Members who share
// an entire display name have been numbered by the add-player flow
// ("Rahul 2"), so their names differ here and normal matching covers them.

export type ParsedGame = {
  line: number;
  a: string[]; // member ids
  b: string[];
  score: { a: number; b: number };
};
export type LineError = { line: number; message: string };
export type BulkResult = { games: ParsedGame[]; errors: LineError[] };

type Member = { id: string; name: string };

// A score written 21-15 / 21–15 / 21:15 anywhere on the line beats a bare
// "21 15", so a numbered player ("Rahul 2") never eats a spaced score when
// an explicit one exists.
export const EXPLICIT = /(?<!\w)(\d{1,2})\s*[-–:]\s*(\d{1,2})(?!\w)/;
export const SPACED = /(?<!\w)(\d{1,2})\s+(\d{1,2})(?!\w)/;

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/\.+$/, ""))
    .filter(Boolean);

const first = (name: string) => name.split(/\s+/)[0];

const COUNT: Record<number, string> = { 2: "Two", 3: "Three", 4: "Four", 5: "Five" };

type Resolved =
  | { ok: true; id: string }
  | { ok: false; ambiguous: boolean; message: string };

function resolveToken(token: string, members: readonly Member[]): Resolved {
  const ws = words(token);
  let candidates: readonly Member[];
  if (ws.length === 1) {
    candidates = members.filter((m) => first(m.name).toLowerCase().startsWith(ws[0]));
  } else {
    candidates = members.filter((m) => {
      const nw = words(m.name);
      return nw.length >= ws.length && ws.every((w, i) => nw[i].startsWith(w));
    });
  }
  if (candidates.length > 1) {
    // an exact hit beats prefix rivals: "raj" is Raj even when Rajat plays
    const exact = candidates.filter((m) =>
      words(m.name).slice(0, ws.length).join(" ") === ws.join(" ")
    );
    if (exact.length === 1) return { ok: true, id: exact[0].id };
  }
  if (candidates.length === 1) return { ok: true, id: candidates[0].id };
  if (candidates.length === 0) {
    return {
      ok: false,
      ambiguous: false,
      message: `No one called '${token}' in this group.`,
    };
  }
  const sorted = [...candidates].sort((x, y) => x.name.localeCompare(y.name));
  const names = sorted.map((m) => m.name);
  const firsts = new Set(sorted.map((m) => first(m.name).toLowerCase()));
  if (firsts.size === 1) {
    const n = COUNT[sorted.length] ?? String(sorted.length);
    const alternates = names.map((n2) => `'${n2}'`).join(" or ");
    return {
      ok: false,
      ambiguous: true,
      message: `${n} ${first(sorted[0].name)}s in this group. Write ${alternates}.`,
    };
  }
  return {
    ok: false,
    ambiguous: true,
    message: `'${token}' could be ${names.join(" or ")}. Write more of the name.`,
  };
}

// One side of the line -> member ids. Segments split on the explicit
// separators; a space-only run is grouped greedily left to right, trying the
// two-word name first so "sai kiran gautam" seats Sai Kiran and Gautam.
// An ambiguous multi-word attempt is terminal (the player meant one name);
// only a zero-candidate attempt falls back to single words.
export function parseSide(
  text: string,
  members: readonly Member[]
): { ids: string[]; error?: string } {
  const ids: string[] = [];
  for (const seg of text.split(/[&,/]+/)) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const ws = trimmed.split(/\s+/);
    if (ws.length > 1) {
      const whole = resolveToken(trimmed, members);
      if (whole.ok) {
        ids.push(whole.id);
        continue;
      }
      if (whole.ambiguous) return { ids, error: whole.message };
    }
    let i = 0;
    while (i < ws.length) {
      if (i + 1 < ws.length) {
        const pair = resolveToken(`${ws[i]} ${ws[i + 1]}`, members);
        if (pair.ok) {
          ids.push(pair.id);
          i += 2;
          continue;
        }
        if (pair.ambiguous) return { ids, error: pair.message };
      }
      const one = resolveToken(ws[i], members);
      if (!one.ok) return { ids, error: one.message };
      ids.push(one.id);
      i += 1;
    }
  }
  return { ids };
}

export function parseBulk(text: string, members: readonly Member[]): BulkResult {
  const games: ParsedGame[] = [];
  const errors: LineError[] = [];
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "That player";

  text.split("\n").forEach((raw, idx) => {
    if (!raw.trim()) return;
    const line = idx + 1;
    const fail = (message: string) => errors.push({ line, message });

    const m = EXPLICIT.exec(raw) ?? SPACED.exec(raw);
    if (!m) return fail("No score on this line. Put it between the sides, like 21-15.");
    const score = { a: Number(m[1]), b: Number(m[2]) };

    const left = parseSide(raw.slice(0, m.index), members);
    if (left.error) return fail(left.error);
    const right = parseSide(raw.slice(m.index + m[0].length), members);
    if (right.error) return fail(right.error);
    if (left.ids.length === 0) return fail("No names before the score.");
    if (right.ids.length === 0) return fail("No names after the score.");
    if (
      left.ids.length !== right.ids.length ||
      left.ids.length > 2
    ) {
      return fail(
        `Sides must be 1v1 or 2v2, not ${left.ids.length}v${right.ids.length}.`
      );
    }
    const seen = new Map<string, "a" | "b">();
    for (const id of left.ids) {
      if (seen.has(id)) return fail(`${nameOf(id)} is listed twice.`);
      seen.set(id, "a");
    }
    for (const id of right.ids) {
      if (seen.get(id) === "a") return fail(`${nameOf(id)} is on both sides.`);
      if (seen.get(id) === "b") return fail(`${nameOf(id)} is listed twice.`);
      seen.set(id, "b");
    }
    if (score.a === score.b) {
      return fail(`${score.a}-${score.b} is a tie. One side has to win.`);
    }
    games.push({ line, a: left.ids, b: right.ids, score });
  });

  return { games, errors };
}
