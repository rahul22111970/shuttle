// Home: your groups, like chats. Each row says what's happening in that
// group right now; tap it and the whole group is inside. One list, one
// mental model, nothing hidden.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useLive } from "../../lib/use-live";
import { getActiveSport, setActiveSport } from "../../lib/groups";
import { asSport, SPORT_NAME, SPORTS, type Sport } from "../../lib/sport";
import { createGroup, listGroups, type Group, type Session } from "../../lib/session";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { color, font, layout, radius, shadow, size, space, tracking } from "../../theme/tokens";
import Settle from "../../components/settle";
import { AppBar, Button, Card, Chip, ErrorNote, Screen, Skeleton, SKEL } from "../../components/ui";

type Row = Group & { members: number; next: Session | null };

function nightLabel(next: Session | null): { text: string; live: boolean } {
  if (!next) return { text: "Nothing planned", live: false };
  if (next.status === "live") return { text: "Playing now", live: true };
  return {
    text: new Date(next.starts_at).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }),
    live: false,
  };
}

// Two chips, one choice. Used for picking which sport to look at and for
// picking the sport a new group will play.
function SportPicker({
  value,
  onPick,
}: {
  value: Sport | null;
  onPick: (sport: Sport) => void;
}) {
  return (
    <View style={styles.sportRow}>
      {SPORTS.map((s) => (
        <Pressable
          key={s}
          accessibilityRole="button"
          accessibilityState={{ selected: value === s }}
          style={[styles.sportChip, value === s && styles.sportChipOn]}
          onPress={() => onPick(s)}
        >
          <Text style={[styles.sportChipText, value === s && styles.sportChipTextOn]}>
            {SPORT_NAME[s]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Groups() {
  const { session } = useAuth();
  const selfId = session?.user.id ?? "";
  // null until the user picks, and only ever asked for when they hold both
  const [sport, setSport] = useState<Sport | null>(getActiveSport);
  const [newSport, setNewSport] = useState<Sport | null>(null);
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; rows: Row[] }
  >({ kind: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    try {
      const groups = await listGroups();
      let counts = new Map<string, number>();
      const nexts = new Map<string, Session>();
      if (groups.length > 0) {
        const ids = groups.map((g) => g.id);
        const [membersRes, sessionsRes] = await Promise.all([
          supabase.from("group_members").select("group_id").in("group_id", ids),
          supabase
            .from("sessions")
            .select("*")
            .in("group_id", ids)
            .in("status", ["planned", "live"])
            // "live" sorts before "planned"; then soonest first — so the
            // first row seen per group is the one that matters
            .order("status", { ascending: true })
            .order("starts_at", { ascending: true }),
        ]);
        if (membersRes.error) throw membersRes.error;
        if (sessionsRes.error) throw sessionsRes.error;
        counts = (membersRes.data ?? []).reduce(
          (m, r) => m.set(r.group_id, (m.get(r.group_id) ?? 0) + 1),
          new Map<string, number>()
        );
        for (const s of (sessionsRes.data ?? []) as Session[]) {
          if (!nexts.has(s.group_id)) nexts.set(s.group_id, s);
        }
      }
      setState({
        kind: "ready",
        rows: groups.map((g) => ({
          ...g,
          members: counts.get(g.id) ?? 0,
          next: nexts.get(g.id) ?? null,
        })),
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useLive(load);

  if (state.kind === "loading") {
    return (
      <Screen testID="groups-screen">
        <AppBar title="Groups" />
        <Skeleton bars={SKEL.rows} />
      </Screen>
    );
  }

  if (state.kind === "error") {
    return (
      <Screen testID="groups-screen">
        <AppBar title="Groups" />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }

  // one sport in the list means no question to ask; two means the sport is
  // the first choice, and the group list waits behind it
  const held = new Set(state.rows.map((g) => asSport(g.sport)));
  const bothSports = held.size > 1;
  const onlySport = held.size === 1 ? ([...held][0] as Sport) : null;
  const chosen = bothSports ? (sport !== null && held.has(sport) ? sport : null) : onlySport;
  const rows = chosen ? state.rows.filter((g) => asSport(g.sport) === chosen) : [];
  const createSport = newSport ?? chosen ?? "badminton";

  return (
    <Screen testID="groups-screen" onRefresh={load}>
      <AppBar
        title="Groups"
        sub={
          bothSports && chosen === null
            ? "Pick a sport"
            : state.rows.length > 0
              ? "Tap a group to play"
              : undefined
        }
      />
      {bothSports ? (
        <SportPicker
          value={chosen}
          onPick={(s) => {
            setSport(s);
            setActiveSport(s);
            setNewSport(null);
          }}
        />
      ) : null}
      {state.rows.length === 0 ? (
        <Card>
          <Text style={styles.title}>No group yet</Text>
          <Text style={styles.copy}>
            A group is your regular crew. Nights, scores and money all live in it.
          </Text>
        </Card>
      ) : bothSports && chosen === null ? (
        <Card>
          <Text style={styles.title}>Two sports</Text>
          <Text style={styles.copy}>Pick the one you are playing. Your groups follow.</Text>
        </Card>
      ) : (
        rows.map((g, i) => {
          const night = nightLabel(g.next);
          return (
            <Settle key={g.id} index={i}>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push(`/group/${g.id}`)}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {g.name}
                </Text>
                <Text style={[styles.rowNight, night.live && styles.rowNightLive]}>
                  {night.text}
                </Text>
                <Text style={styles.quiet}>
                  {g.members} {g.members === 1 ? "player" : "players"}
                </Text>
              </View>
              {bothSports ? <Chip label={SPORT_NAME[asSport(g.sport)]} /> : null}
              {g.captain_id === selfId ? <Chip label="Captain" active /> : null}
              <Text style={styles.rowGo}>›</Text>
            </Pressable>
            </Settle>
          );
        })
      )}
      <Card>
        <Text style={styles.title}>Start a new group</Text>
        <Text style={styles.quiet}>
          A group plays one sport. It cannot change later, so pick now.
        </Text>
        <SportPicker value={createSport} onPick={setNewSport} />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          accessibilityLabel="New group name"
          placeholderTextColor={color.ink3}
        />
        <Button
          label="Start the group"
          busy={busy}
          busyLabel="Starting…"
          disabled={!name.trim()}
          onPress={async () => {
            setBusy(true);
            setActionError(false);
            try {
              const g = await createGroup(name.trim(), createSport);
              setName("");
              setSport(createSport);
              setActiveSport(createSport);
              setNewSport(null);
              await load();
              router.push(`/group/${g.id}`);
            } catch {
              setActionError(true);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Text style={styles.quiet}>
          Your friends sign in with their number and the group code.
        </Text>
        {actionError ? <ErrorNote>That did not go through. Try again.</ErrorNote> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  row: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    boxShadow: [...shadow.ring],
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: color.card,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontFamily: font.bold, fontSize: 15.5, color: color.ink },
  rowNight: { fontFamily: font.semibold, fontSize: 13, color: color.ink2 },
  rowNightLive: { color: color.court },
  rowGo: { fontFamily: font.bold, fontSize: 20, color: color.ink3 },
  sportRow: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    gap: space.sm,
  },
  sportChip: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 9,
    backgroundColor: color.inkWash,
  },
  sportChipOn: { backgroundColor: color.ink },
  sportChipText: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  sportChipTextOn: { color: color.fog0 },
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
