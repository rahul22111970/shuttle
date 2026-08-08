// The Session tab, presentational and pure: every state the screen can be
// in arrives as a prop, so tests can render each by name.
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { Member, Roster, Session } from "../lib/session";
import { color, layout, radius, size, space } from "../theme/tokens";
import { Button, Card, ErrorNote, Screen, Wordmark } from "./ui";

export type SessionViewProps =
  | { kind: "loading" }
  | { kind: "error"; onRetry: () => void }
  | { kind: "no-group"; busy: boolean; actionError: boolean; onCreateGroup: (name: string) => void }
  | {
      kind: "no-session";
      groupName: string;
      busy: boolean;
      actionError: boolean;
      onPlanSession: (startsAtISO: string) => void;
    }
  | {
      kind: "session";
      groupName: string;
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

// Planning presets instead of a date picker: four honest choices cover a
// group night, and nothing can be typed wrong. Past presets filter out, so
// "Today 7 pm" disappears at 7. ponytail: groups whose nights vary need a
// pick-another-time escape hatch eventually; build it when a real group asks.
function presets(): { label: string; iso: string }[] {
  const at = (daysAhead: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  return [
    { label: "Today 7 pm", iso: at(0, 19) },
    { label: "Tomorrow 7 am", iso: at(1, 7) },
    { label: "Tomorrow 7 pm", iso: at(1, 19) },
    { label: "Sunday 7 am", iso: (() => {
        const d = new Date();
        d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
        d.setHours(7, 0, 0, 0);
        return d.toISOString();
      })() },
  ].filter((p) => new Date(p.iso) > new Date());
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
  const [groupName, setGroupName] = useState("");

  if (props.kind === "loading") {
    return (
      <Screen>
        <Wordmark />
        <Text style={styles.quiet}>Loading your group…</Text>
      </Screen>
    );
  }

  if (props.kind === "error") {
    return (
      <Screen>
        <Wordmark />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={props.onRetry} />
      </Screen>
    );
  }

  if (props.kind === "no-group") {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>No group yet</Text>
          <Text style={styles.copy}>
            A group is your regular crew. Sessions, scores and money all live in it.
          </Text>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Group name"
            accessibilityLabel="Group name"
            placeholderTextColor={color.ink3}
          />
          <Button
            label="Start the group"
            busy={props.busy}
            busyLabel="Starting…"
            disabled={!groupName.trim()}
            onPress={() => props.onCreateGroup(groupName.trim())}
          />
          {props.actionError ? (
            <ErrorNote>That did not go through. Try again.</ErrorNote>
          ) : null}
        </Card>
      </Screen>
    );
  }

  if (props.kind === "no-session") {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>{props.groupName}</Text>
          <Text style={styles.copy}>Nothing planned. Pick a night.</Text>
          <View style={styles.presetRow}>
            {presets().map((p) => (
              <Pressable
                key={p.label}
                accessibilityRole="button"
                accessibilityState={{ disabled: props.busy }}
                style={[styles.preset, props.busy && styles.presetBusy]}
                disabled={props.busy}
                onPress={() => props.onPlanSession(p.iso)}
              >
                <Text style={styles.presetText}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          {props.actionError ? (
            <ErrorNote>That did not go through. Try again.</ErrorNote>
          ) : null}
        </Card>
      </Screen>
    );
  }

  const { session, members, roster, selfId, busyAction } = props;
  const attending = new Set(roster.attending);
  const selfIn = attending.has(selfId);

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{props.groupName}</Text>
        <Text style={styles.copy}>{sessionDateLabel(session.starts_at)}</Text>
        {session.status === "live" ? (
          <Text style={styles.liveNote}>The night is on.</Text>
        ) : null}
        <View style={styles.chipRow}>
          {members.map((m) => (
            <View
              key={m.id}
              style={[styles.chip, attending.has(m.id) && styles.chipIn]}
            >
              <Text style={[styles.chipText, attending.has(m.id) && styles.chipTextIn]}>
                {m.name}
              </Text>
            </View>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: size.lead, color: color.ink },
  copy: { fontSize: size.body, color: color.ink2 },
  quiet: { fontSize: size.label, color: color.ink3 },
  liveNote: { fontSize: size.body, color: color.court },
  input: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.fog1,
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  preset: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  presetBusy: { opacity: 0.4 },
  presetText: { fontSize: size.body, color: color.ink },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    maxWidth: layout.column,
  },
  chip: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    backgroundColor: color.card,
  },
  chipIn: { borderColor: color.court, backgroundColor: color.courtWash },
  chipText: { fontSize: size.body, color: color.ink2 },
  chipTextIn: { color: color.courtDeep },
});
