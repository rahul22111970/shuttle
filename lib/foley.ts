// Shuttle foley, per the DESIGN.md sound contract: four sounds mapped to
// meaning, never to navigation. Drive rotates three cuts with ±4% pitch
// jitter — anything that can fire 40 times a night must never repeat
// identically. Web-only for the pilot; native waits for expo-audio at the
// EAS build (ponytail: the phones tonight are all on the web build).
//
// One bank per sport. A shuttle cracks high and dry; a perforated plastic
// ball on a honeycomb paddle pops lower and rings a little. Same four
// meanings either way, so nothing at a call site changes — the screen that
// knows the group calls use() and every later sound follows.
import { Platform } from "react-native";
import type { Sport } from "./sport";
import drive1 from "../assets/foley/drive1.mp3";
import drive2 from "../assets/foley/drive2.mp3";
import drive3 from "../assets/foley/drive3.mp3";
import drop from "../assets/foley/drop.mp3";
import serve from "../assets/foley/serve.mp3";
import smash from "../assets/foley/smash.mp3";
import pDrive1 from "../assets/foley/pickleball/drive1.mp3";
import pDrive2 from "../assets/foley/pickleball/drive2.mp3";
import pDrive3 from "../assets/foley/pickleball/drive3.mp3";
import pDrop from "../assets/foley/pickleball/drop.mp3";
import pServe from "../assets/foley/pickleball/serve.mp3";
import pSmash from "../assets/foley/pickleball/smash.mp3";

const webOnly = Platform.OS === "web" && typeof window !== "undefined";

type Cut = { el: HTMLAudioElement } | null;

function load(src: unknown): Cut {
  if (!webOnly) return null;
  const el = new window.Audio(String(src));
  el.preload = "auto";
  return { el };
}

type Bank = {
  drives: Cut[];
  smash: Cut;
  drop: Cut;
  serve: Cut;
};

const BANKS: Record<Sport, Bank> = {
  badminton: {
    drives: [load(drive1), load(drive2), load(drive3)],
    smash: load(smash),
    drop: load(drop),
    serve: load(serve),
  },
  pickleball: {
    drives: [load(pDrive1), load(pDrive2), load(pDrive3)],
    smash: load(pSmash),
    drop: load(pDrop),
    serve: load(pServe),
  },
};

// badminton until a screen says otherwise: the pilot groups are all
// badminton and an unset sport must never fall silent
let sport: Sport = "badminton";
let driveAt = 0;

function play(cut: Cut, rate = 1): void {
  if (!cut) return;
  try {
    // clone so rapid taps overlap instead of restarting one element
    const el = cut.el.cloneNode(true) as HTMLAudioElement;
    el.playbackRate = rate;
    void el.play().catch(() => {});
  } catch {
    // sound is garnish; a blocked autoplay never surfaces as an error
  }
}

export const foley = {
  // whichever sport the screen is showing; every later sound follows
  use(next: Sport): void {
    sport = next;
  },
  // point scored, match logged
  drive(): void {
    const { drives } = BANKS[sport];
    driveAt = (driveAt + 1) % drives.length;
    play(drives[driveAt], 0.96 + Math.random() * 0.08);
  },
  // game won, match won
  smash(): void {
    play(BANKS[sport].smash);
  },
  // money settled, quiet confirms
  drop(): void {
    play(BANKS[sport].drop);
  },
  // match called to a court
  serve(): void {
    play(BANKS[sport].serve);
  },
};
