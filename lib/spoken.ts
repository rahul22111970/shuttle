// Spoken score entry, the pure half: one utterance -> one parsed game.
// The grammar is the sentence people actually say at the hall:
//
//   "Rahul and Sai versus Baibhab and Rajat, Rahul won 21-16"
//
// plus the shorter forms "Rahul beat Gautam 21-12" and the bulk line
// "Rahul & Sai 21-15 Deo & Gautam". Speech recognition mangles names, but
// resolution only has to pick among the group's few members, so the bulk
// parser's fuzzy prefix matcher recovers most of it. The score the winner
// speaks first is the winner's points.
import { EXPLICIT, SPACED, parseBulk, parseSide, type ParsedGame } from "./bulk";

type Member = { id: string; name: string };

export type SpokenResult =
  | { ok: true; game: ParsedGame }
  | { ok: false; message: string };

const HINT = "Say it like: Rahul and Sai versus Deo and Gautam, Rahul won 21-16.";

// small spoken numbers -> digits ("twenty one" -> 21), for recognisers
// that write words. Applied token-wise before parsing.
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30 };

function digitise(text: string): string {
  const out: string[] = [];
  const ws = text.split(/\s+/);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i].toLowerCase();
    if (w in TENS) {
      const next = ws[i + 1]?.toLowerCase();
      if (next && next in UNITS && UNITS[next] < 10) {
        out.push(String(TENS[w] + UNITS[next]));
        i++;
      } else {
        out.push(String(TENS[w]));
      }
    } else if (w in UNITS) {
      out.push(String(UNITS[w]));
    } else {
      out.push(ws[i]);
    }
  }
  return out.join(" ");
}

// drop connector words so "rahul and sai" reads as a plain name run the
// side parser already understands
const stripAnd = (s: string) => s.replace(/\b(?:and|n|plus|with)\b/gi, " ");

const clean = (s: string) =>
  s.replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();

function scoreFrom(text: string): { hi: number; lo: number; rest: string } | null {
  const m = EXPLICIT.exec(text) ?? SPACED.exec(text);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return {
    hi: Math.max(x, y),
    lo: Math.min(x, y),
    rest: (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim(),
  };
}

export function parseSpoken(transcript: string, members: readonly Member[]): SpokenResult {
  const text = clean(digitise(transcript));
  if (!text) return { ok: false, message: HINT };

  // form 1: <A> versus <B> ... <winner> won <score>
  const vs = text.split(/\s+(?:vs\.?|versus|against|v)\s+/i);
  if (vs.length === 2) {
    const sideA = parseSide(stripAnd(vs[0]), members);
    if (sideA.error || sideA.ids.length === 0) {
      return { ok: false, message: sideA.error ?? `Didn't catch the first pair. ${HINT}` };
    }
    const wonSplit = vs[1].split(/\s+(?:won|wins|win|took it|take it)\s*/i);
    if (wonSplit.length >= 2) {
      const score = scoreFrom(wonSplit.slice(1).join(" "));
      if (!score) return { ok: false, message: `Heard the winner but not the score. ${HINT}` };
      // the tail tokens before "won" name the winner; peel 1-3 tokens off
      // the end until the rest parses as side B and the peel resolves to
      // players already seated on one side
      const tokens = stripAnd(clean(wonSplit[0])).split(/\s+/).filter(Boolean);
      for (let take = 1; take <= Math.min(4, tokens.length - 1); take++) {
        const winnerText = tokens.slice(tokens.length - take).join(" ");
        const sideBText = tokens.slice(0, tokens.length - take).join(" ");
        const sideB = parseSide(sideBText, members);
        if (sideB.error || sideB.ids.length === 0) continue;
        const winner = parseSide(winnerText, members);
        if (winner.error || winner.ids.length === 0) continue;
        const inA = winner.ids.every((id) => sideA.ids.includes(id));
        const inB = winner.ids.every((id) => sideB.ids.includes(id));
        if (!inA && !inB) continue;
        const aWon = inA;
        return {
          ok: true,
          game: {
            line: 1,
            a: sideA.ids,
            b: sideB.ids,
            score: aWon ? { a: score.hi, b: score.lo } : { a: score.lo, b: score.hi },
          },
        };
      }
      return { ok: false, message: `Couldn't tell the winner from the second pair. ${HINT}` };
    }
    // no "won": maybe "<A> versus <B> 21-16" — winner unstated, refuse
    return { ok: false, message: `Say who won. ${HINT}` };
  }

  // form 2: <A> beat <B> <score>
  const beat = text.split(/\s+(?:beat|beats|defeated|thrashed)\s+/i);
  if (beat.length === 2) {
    const score = scoreFrom(beat[1]);
    if (!score) return { ok: false, message: `Heard who won but not the score. ${HINT}` };
    const sideA = parseSide(stripAnd(beat[0]), members);
    if (sideA.error || sideA.ids.length === 0) {
      return { ok: false, message: sideA.error ?? `Didn't catch the winners. ${HINT}` };
    }
    const sideB = parseSide(stripAnd(score.rest), members);
    if (sideB.error || sideB.ids.length === 0) {
      return { ok: false, message: sideB.error ?? `Didn't catch the losers. ${HINT}` };
    }
    return {
      ok: true,
      game: { line: 1, a: sideA.ids, b: sideB.ids, score: { a: score.hi, b: score.lo } },
    };
  }

  // form 3: the bulk line "<A> 21-15 <B>"
  const bulk = parseBulk(stripAnd(text), members);
  if (bulk.games.length === 1 && bulk.errors.length === 0) {
    return { ok: true, game: bulk.games[0] };
  }
  // bulk's errors only help if the utterance was at least score-shaped;
  // pure chatter gets the teaching hint instead
  if (/\d/.test(text) && bulk.errors.length > 0) {
    return { ok: false, message: bulk.errors[0].message };
  }
  return { ok: false, message: HINT };
}
