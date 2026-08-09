// The planned-night body, presentational and pure: every state arrives as
// a prop, so tests can render each by name. Chrome (back, group name,
// section chips) belongs to the group room that mounts this.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Member, Roster, Session } from "../lib/session";
import { color, font, layout, size, space, tracking } from "../theme/tokens";
import DateTimeInput from "./datetime-input";
import { Button, Card, Chip, ErrorNote } from "./ui";

export type SessionViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | {
      kind: "no-session";
      busy: boolean;
      actionError: boolean;
      onPlanSession: (startsAtISO: string) => void;
    }
  | {
      kind: "session";
      session: Session;
      members: readonly Member[];
      roster: Roster;
      selfId: string;
      busyAction: "in" | "out" | "start" | null;
      actionError: boolean;
      onRsvpIn: () => void;
      onRsvpOut: () => void;
      onStartNight: () => void;
    };

// Suggestions fill the picker; the picker is the truth; one button plans.
// "YYYY-MM-DDTHH:mm" is the input's native local format.
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function suggestions(): { label: string; local: string }[] {
  const at = (daysAhead: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return toLocalInput(d);
  };
  return [
    { label: "Tonight 7 pm", local: at(0, 19) },
    { label: "Tomorrow 7 am", local: at(1, 7) },
    { label: "Tomorrow 7 pm", local: at(1, 19) },
  ].filter((p) => new Date(p.local) > new Date());
}

function sessionDateLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SessionView(props: SessionViewProps) {
  const [when, setWhen] = useState<string>(() => suggestions()[0]?.local ?? toLocalInput(new Date(Date.now() + 3600000)));

  if (props.kind === "loading") {
    return <Text style={styles.quiet}>Loading the night…</Text>;
  }

  if (props.kind === "error") {
    return (
      <>
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </>
    );
  }

  if (props.kind === "no-session") {
    const chosen = new Date(when);
    const valid = !Number.isNaN(chosen.getTime()) && chosen > new Date();
    return (
      <Card>
        <Text style={styles.title}>Plan a night</Text>
        <Text style={styles.copy}>Nothing planned. Pick a night.</Text>
        <View style={styles.presetRow}>
          {suggestions().map((p) => (
            <Pressable
              key={p.label}
              accessibilityRole="button"
              accessibilityState={{ selected: when === p.local }}
              style={[styles.preset, when === p.local && styles.presetOn]}
              onPress={() => setWhen(p.local)}
            >
              <Text style={[styles.presetText, when === p.local && styles.presetTextOn]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <DateTimeInput value={when} onChange={setWhen} label="Pick a date and time" />
        <Button
          label={valid ? `Plan ${sessionDateLabel(chosen.toISOString())}` : "Pick a time to come"}
          busy={props.busy}
          busyLabel="Planning…"
          disabled={!valid}
          onPress={() => props.onPlanSession(chosen.toISOString())}
        />
        <Text style={styles.quiet}>The group sees it and taps I'm in.</Text>
        {props.actionError ? (
          <ErrorNote>That did not go through. Try again.</ErrorNote>
        ) : null}
      </Card>
    );
  }

  const { session, members, roster, selfId, busyAction } = props;
  const attending = new Set(roster.attending);
  const selfIn = attending.has(selfId);

  return (
    <>
      <Card>
        <Text style={styles.title}>Next night</Text>
        <Text style={styles.sessionWhen}>{sessionDateLabel(session.starts_at)}</Text>
        <View style={styles.chipRow}>
          {members.map((m) => (
            <Chip key={m.id} label={m.name} active={attending.has(m.id)} />
          ))}
        </View>
        <Text style={styles.quiet}>
          {roster.attending.length} in · {members.length} in the group
        </Text>
      </Card>
      {props.actionError ? (
        <ErrorNote>That did not go through. Try again.</ErrorNote>
      ) : null}
      {session.status === "planned" ? (
        selfIn ? (
          <>
            <Button
              label="Start the night"
              busy={busyAction === "start"}
              busyLabel="Starting…"
              disabled={busyAction !== null && busyAction !== "start"}
              onPress={props.onStartNight}
            />
            <Button
              label="Can't make it"
              variant="quiet"
              busy={busyAction === "out"}
              busyLabel="Dropping out…"
              disabled={busyAction !== null && busyAction !== "out"}
              onPress={props.onRsvpOut}
            />
          </>
        ) : (
          <Button
            label="I'm in"
            busy={busyAction === "in"}
            busyLabel="Joining…"
            onPress={props.onRsvpIn}
          />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sessionWhen: { fontFamily: font.bold, fontSize: 15.5, color: color.ink },
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  preset: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: color.inkWash,
  },
  presetOn: { backgroundColor: color.courtWash },
  presetText: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  presetTextOn: { color: color.court },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    maxWidth: layout.column,
  },
});
