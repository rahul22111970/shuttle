// Say the score. One tap, one sentence, one confirming tap. The browser's
// own speech recognition does the listening (free, on-device where the
// platform allows); lib/spoken turns the utterance into a game against the
// group's member list. Nothing is written until the human approves the
// card, and a typed fallback covers quiet rooms and unsupported browsers.
import { useRef, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { PRESETS } from "@shuttle/score";
import { foley } from "../lib/foley";
import { quickLog, type Participant } from "../lib/scoring";
import { parseSpoken } from "../lib/spoken";
import type { ParsedGame } from "../lib/bulk";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import { Button, Card, ErrorNote } from "./ui";

type Member = { id: string; name: string };

type Phase =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "review"; game: ParsedGame; heard: string }
  | { kind: "refused"; message: string; heard: string }
  | { kind: "typing" }
  | { kind: "logged"; line: string };

// minimal typing for the web speech engines; native builds hide the mic
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceLog({
  members,
  groupId,
  sessionId,
  onLogged,
}: {
  members: readonly Member[];
  groupId: string;
  sessionId?: string | null;
  onLogged: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  const Ctor = recognitionCtor();
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "Player";
  const line = (g: ParsedGame) => {
    const aWon = g.score.a > g.score.b;
    const w = (aWon ? g.a : g.b).map(nameOf).join(" & ");
    const l = (aWon ? g.b : g.a).map(nameOf).join(" & ");
    const hi = Math.max(g.score.a, g.score.b);
    const lo = Math.min(g.score.a, g.score.b);
    return `${w} d. ${l} · ${hi}–${lo}`;
  };

  const handle = (transcript: string) => {
    const r = parseSpoken(transcript, members);
    if (r.ok) setPhase({ kind: "review", game: r.game, heard: transcript });
    else setPhase({ kind: "refused", message: r.message, heard: transcript });
  };

  const listen = () => {
    if (!Ctor) return;
    setFailed(false);
    const rec = new Ctor();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 4;
    let done = false;
    rec.onresult = (e) => {
      done = true;
      // try each alternative until one parses; show the first otherwise
      const alts = Array.from(e.results[0] ?? []).map((a) => a.transcript);
      for (const alt of alts) {
        const r = parseSpoken(alt, members);
        if (r.ok) {
          setPhase({ kind: "review", game: r.game, heard: alt });
          return;
        }
      }
      handle(alts[0] ?? "");
    };
    rec.onerror = () => {
      if (!done) setPhase({ kind: "idle" });
    };
    rec.onend = () => {
      if (!done) setPhase({ kind: "idle" });
    };
    setPhase({ kind: "listening" });
    rec.start();
  };

  const log = async (g: ParsedGame) => {
    setBusy(true);
    setFailed(false);
    try {
      const participants: Participant[] = [
        ...g.a.map((player_id) => ({ player_id, side: "a" as const })),
        ...g.b.map((player_id) => ({ player_id, side: "b" as const })),
      ];
      await quickLog(groupId, PRESETS.casual1x21, participants, g.score, sessionId ?? undefined);
      foley.drive();
      setTyped("");
      setPhase({ kind: "logged", line: line(g) });
      onLogged();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="voice-log">
      <Text style={styles.title}>Say the score</Text>
      {phase.kind === "idle" || phase.kind === "logged" ? (
        <>
          {phase.kind === "logged" ? (
            <Text style={styles.logged}>{`In. ${phase.line}`}</Text>
          ) : null}
          {Ctor ? (
            <>
              <Button label="Hold court · say the score" onPress={listen} />
              <Text style={styles.quiet}>
                Like: Rahul and Sai versus Deo and Gautam, Rahul won 21-16.
              </Text>
            </>
          ) : (
            <Text style={styles.quiet}>
              This browser can't listen. Type the score instead.
            </Text>
          )}
          <Button
            label="Type it instead"
            variant="quiet"
            onPress={() => setPhase({ kind: "typing" })}
          />
        </>
      ) : null}
      {phase.kind === "listening" ? (
        <>
          <Text style={styles.listening}>Listening…</Text>
          <Text style={styles.quiet}>
            Say it in one line: names, versus, names, who won, the score.
          </Text>
          <Button
            label="Stop"
            variant="quiet"
            onPress={() => {
              recRef.current?.stop();
              setPhase({ kind: "idle" });
            }}
          />
        </>
      ) : null}
      {phase.kind === "typing" ? (
        <>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder="Rahul & Sai vs Deo & Gautam, Rahul won 21-16"
            accessibilityLabel="Spoken score"
            placeholderTextColor={color.ink3}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label="Check it"
            disabled={!typed.trim()}
            onPress={() => handle(typed)}
          />
          <Button label="Never mind" variant="quiet" onPress={() => setPhase({ kind: "idle" })} />
        </>
      ) : null}
      {phase.kind === "review" ? (
        <>
          <Text style={styles.reviewLine}>{line(phase.game)}</Text>
          <Text style={styles.quiet}>{`Heard: "${phase.heard}"`}</Text>
          <Button
            label="Log it"
            busy={busy}
            busyLabel="Logging…"
            onPress={() => log(phase.game)}
          />
          {Ctor ? <Button label="Say it again" variant="quiet" onPress={listen} /> : null}
          <Button
            label="Type it instead"
            variant="quiet"
            onPress={() => setPhase({ kind: "typing" })}
          />
        </>
      ) : null}
      {phase.kind === "refused" ? (
        <>
          <ErrorNote>{phase.message}</ErrorNote>
          <Text style={styles.quiet}>{`Heard: "${phase.heard}"`}</Text>
          {Ctor ? <Button label="Say it again" onPress={listen} /> : null}
          <Button
            label="Type it instead"
            variant="quiet"
            onPress={() => setPhase({ kind: "typing" })}
          />
        </>
      ) : null}
      {failed ? <ErrorNote>That did not go through. Try again.</ErrorNote> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  listening: { fontFamily: font.bold, fontSize: 16, color: color.court },
  reviewLine: { fontFamily: font.bold, fontSize: 15.5, color: color.ink },
  logged: { fontFamily: font.bold, fontSize: size.body, color: color.court },
  input: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontFamily: font.body,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.fog1,
  },
});
