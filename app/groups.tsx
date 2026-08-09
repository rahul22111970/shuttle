// Groups: every crew you play in, one active at a time. Tap to switch —
// Today, the session tab, dealing and logging all follow the choice.
// Pushed from the Session header.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { getActiveGroupId, setActiveGroupId } from "../lib/groups";
import { createGroup, listGroups, type Group } from "../lib/session";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import AddPlayer from "../components/add-player";
import { BackBar, Button, Card, Chip, ErrorNote, Screen } from "../components/ui";

type Row = Group & { members: number };

export default function Groups() {
  const { session } = useAuth();
  const selfId = session?.user.id ?? "";
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | {
        kind: "ready";
        rows: Row[];
        membership: { group_id: string; player_id: string; name: string }[];
        active: string | null;
      }
  >({ kind: "loading" });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [quickError, setQuickError] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/session"));

  const load = useCallback(async () => {
    try {
      const groups = await listGroups();
      let counts = new Map<string, number>();
      let membership: { group_id: string; player_id: string; name: string }[] = [];
      if (groups.length > 0) {
        const res = await supabase
          .from("group_members")
          .select("group_id, player_id, profiles!inner(display_name)")
          .in("group_id", groups.map((g) => g.id));
        if (res.error) throw res.error;
        membership = res.data.map((r) => ({
          group_id: r.group_id,
          player_id: r.player_id,
          name: (r.profiles as unknown as { display_name: string }).display_name,
        }));
        counts = membership.reduce(
          (m, r) => m.set(r.group_id, (m.get(r.group_id) ?? 0) + 1),
          new Map<string, number>()
        );
      }
      setState({
        kind: "ready",
        rows: groups.map((g) => ({ ...g, members: counts.get(g.id) ?? 0 })),
        membership,
        active: getActiveGroupId() ?? groups[0]?.id ?? null,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <Screen>
        <BackBar title="Groups" onBack={back} />
        <Text style={styles.quiet}>Fetching your groups…</Text>
      </Screen>
    );
  }

  if (state.kind === "error") {
    return (
      <Screen>
        <BackBar title="Groups" onBack={back} />
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }

  return (
    <Screen testID="groups-screen">
      <BackBar title="Groups" onBack={back} />
      <Card>
        <Text style={styles.title}>Your groups</Text>
        {state.rows.length === 0 ? (
          <Text style={styles.copy}>No groups yet. Start one below.</Text>
        ) : (
          state.rows.map((g) => {
            const active = g.id === state.active;
            return (
              <Pressable
                key={g.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => {
                  setActiveGroupId(g.id);
                  setState({ ...state, active: g.id });
                }}
              >
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {g.name}
                  </Text>
                  <Text style={styles.quiet}>
                    {g.members} {g.members === 1 ? "player" : "players"}
                  </Text>
                </View>
                {g.captain_id === selfId ? <Chip label="Captain" active /> : null}
                {active ? <Chip label="Active" active /> : null}
              </Pressable>
            );
          })
        )}
        <Text style={styles.quiet}>The active group is what Today and Session show.</Text>
      </Card>
      {(() => {
        const active = state.rows.find((r) => r.id === state.active);
        if (!active || active.captain_id !== selfId) return null;
        return (
          <Card testID="add-player-card">
            <Text style={styles.title}>{`Add a player to ${active.name}`}</Text>
            <Text style={styles.quiet}>
              Their account exists the moment you add them. Share the group code and they
              are in.
            </Text>
            {(() => {
              const inGroup = new Set(
                state.membership.filter((m) => m.group_id === active.id).map((m) => m.player_id)
              );
              const seen = new Set<string>();
              const candidates = state.membership.filter((m) => {
                if (m.group_id === active.id || inGroup.has(m.player_id) || seen.has(m.player_id))
                  return false;
                seen.add(m.player_id);
                return true;
              });
              if (candidates.length === 0) return null;
              return (
                <>
                  <Text style={styles.quiet}>From your other groups, one tap:</Text>
                  <View style={styles.pickWrap}>
                    {candidates.map((c) => (
                      <Pressable
                        key={c.player_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${c.name}`}
                        disabled={quickBusy !== null}
                        style={[styles.pick, quickBusy === c.player_id && { opacity: 0.5 }]}
                        onPress={async () => {
                          setQuickBusy(c.player_id);
                          setQuickError(false);
                          try {
                            const token = (await supabase.auth.getSession()).data.session
                              ?.access_token;
                            const r = await fetch("/api/add-player", {
                              method: "POST",
                              headers: {
                                "content-type": "application/json",
                                authorization: `Bearer ${token}`,
                              },
                              body: JSON.stringify({ groupId: active.id, playerId: c.player_id }),
                            });
                            if (!r.ok) throw new Error("failed");
                            await load();
                          } catch {
                            setQuickError(true);
                          } finally {
                            setQuickBusy(null);
                          }
                        }}
                      >
                        <Text style={styles.pickName}>{`${c.name} +`}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {quickError ? (
                    <ErrorNote>That did not go through. Try again.</ErrorNote>
                  ) : null}
                </>
              );
            })()}
            <AddPlayer groupId={active.id} onAdded={load} />
          </Card>
        );
      })()}
      <Card>
        <Text style={styles.title}>Start a new group</Text>
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
              const g = await createGroup(name.trim());
              setActiveGroupId(g.id);
              setName("");
              await load();
            } catch {
              setActionError(true);
            } finally {
              setBusy(false);
            }
          }}
        />
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
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.control,
    padding: space.md,
    backgroundColor: color.inkWash,
  },
  rowActive: { backgroundColor: color.courtWash },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontFamily: font.bold, fontSize: 14.5, color: color.ink },
  pickWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pick: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: color.inkWash,
  },
  pickName: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
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
