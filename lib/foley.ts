// Shuttle foley, per the DESIGN.md sound contract: four sounds mapped to
// meaning, never to navigation. Drive rotates three cuts with ±4% pitch
// jitter — anything that can fire 40 times a night must never repeat
// identically. Web-only for the pilot; native waits for expo-audio at the
// EAS build (ponytail: the phones tonight are all on the web build).
import { Platform } from "react-native";
import drive1 from "../assets/foley/drive1.mp3";
import drive2 from "../assets/foley/drive2.mp3";
import drive3 from "../assets/foley/drive3.mp3";
import drop from "../assets/foley/drop.mp3";
import serve from "../assets/foley/serve.mp3";
import smash from "../assets/foley/smash.mp3";

const webOnly = Platform.OS === "web" && typeof window !== "undefined";

type Cut = { el: HTMLAudioElement } | null;

function load(src: unknown): Cut {
  if (!webOnly) return null;
  const el = new window.Audio(String(src));
  el.preload = "auto";
  return { el };
}

const drives = [load(drive1), load(drive2), load(drive3)];
const cuts = { smash: load(smash), drop: load(drop), serve: load(serve) };
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
  // point scored, match logged
  drive(): void {
    driveAt = (driveAt + 1) % drives.length;
    play(drives[driveAt], 0.96 + Math.random() * 0.08);
  },
  // game won, match won
  smash(): void {
    play(cuts.smash);
  },
  // money settled, quiet confirms
  drop(): void {
    play(cuts.drop);
  },
  // match called to a court
  serve(): void {
    play(cuts.serve);
  },
};
