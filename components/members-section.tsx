// The Members section: who is in this group. Everyone sees the list; the
// captain adds people (one tap from another group, or name + number) and
// removes them with a second confirming tap. Matches already played stay.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLive } from "../lib/use-live";
import { listGroups, type Group } from "../lib/session";
import { supabase } from "../lib/supabase";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import AddPlayer from "./add-player";
import { Button, Card, Chip, ErrorNote } from "./ui";

type MemberRow = { id: string; name: string };
type Candidate = { id: string; name: string };

export default function MembersSection({ group, selfId }: { group: Group; selfId: string }) {
  const captain = group.captain_id === selfId;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; members: MemberRow[]; candidates: Candidate[] }
  >({ kind: "loading" });
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [quickError, setQuickError] = useState(false);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState(false);

  const load = useCallback(async () => {
    try {
      // one membership fetch across all my groups feeds both the list and
      // the one-tap candidates (people I play with elsewhere, not in here)
      const groups = captain ? await listGroups() : [group];
      const res = await supabase
        .from("group_members")
        .select("group_id, player_id, profiles!inner(display_name)")
        .in("group_id", groups.map((g) => g.id));
      if (res.error) throw res.error;
      const rows = res.data.map((r) => ({
        group_id: r.group_id,
        id: r.player_id,
        name: (r.profiles as unknown as { display_name: string }).display_name,
      }));
      const members = rows
        .filter((r) => r.group_id === group.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const inGroup = new Set(members.map((m) => m.id));
      const seen = new Set<string>();
      const candidates = rows.filter((r) => {
        if (r.group_id === group.id || inGroup.has(r.id) || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      setState({ kind: "ready", members, candidates });
    } catch {
      setState({ kind: "error" });
    }
  }, [group, captain]);

  useLive(load);

  if (state.kind === "loading") {
    return <Text style={styles.quiet}>Fetching the group…</Text>;
  }
  if (state.kind === "error") {
    return (
      <>
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={load} />
      </>
    );
  }

  return (
    <>
      <Card testID="members-card">
        <Text style={styles.title}>
          {state.members.length} {state.members.length === 1 ? "player" : "players"}
        </Text>
        {state.members.map((m) => {
          const armed = removeArmed === m.id;
          return (
            <View key={m.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>
                {m.name}
              </Text>
              {m.id === group.captain_id ? <Chip label="Captain" active /> : null}
              {m.id === selfId ? <Chip label="You" /> : null}
              {captain && m.id !== group.captain_id ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={armed ? `Really remove ${m.name}` : `Remove ${m.name}`}
                  disabled={removeBusy}
                  style={[styles.remove, armed && styles.removeArmed]}
                  onPress={async () => {
                    if (!armed) {
                      setRemoveArmed(m.id);
                      setRemoveError(false);
                      return;
                    }
                    setRemoveBusy(true);
                    try {
                      const res = await supabase
                        .from("group_members")
                        .delete()
                        .eq("group_id", group.id)
                        .eq("player_id", m.id);
                      if (res.error) throw res.error;
                      await load();
                    } catch {
                      setRemoveError(true);
                    } finally {
                      setRemoveBusy(false);
                      setRemoveArmed(null);
                    }
                  }}
                >
                  <Text style={[styles.removeText, armed && styles.removeTextArmed]}>
                    {armed ? "Sure? Tap again" : "Remove"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {removeError ? <ErrorNote>That did not go through. Try again.</ErrorNote> : null}
        {captain ? (
          <Text style={styles.quiet}>Removing someone keeps the games they played.</Text>
        ) : null}
      </Card>
      {captain ? (
        <Card testID="add-player-card">
          <Text style={styles.title}>Add a player</Text>
          <Text style={styles.quiet}>
            Their account exists the moment you add them. Share the group code and they
            are in.
          </Text>
          {state.candidates.length > 0 ? (
            <>
              <Text style={styles.quiet}>From your other groups, one tap:</Text>
              <View style={styles.pickWrap}>
                {state.candidates.map((c) => (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${c.name}`}
                    disabled={quickBusy !== null}
                    style={[styles.pick, quickBusy === c.id && { opacity: 0.5 }]}
                    onPress={async () => {
                      setQuickBusy(c.id);
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
                          body: JSON.stringify({ groupId: group.id, playerId: c.id }),
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
              {quickError ? <ErrorNote>That did not go through. Try again.</ErrorNote> : null}
            </>
          ) : null}
          <AddPlayer groupId={group.id} onAdded={load} />
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  rowName: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  remove: {
    borderRadius: radius.control,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: color.inkWash,
  },
  removeArmed: { backgroundColor: color.corkWash },
  removeText: { fontFamily: font.bold, fontSize: 12, color: color.ink2 },
  removeTextArmed: { color: color.cork },
  pickWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pick: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: color.inkWash,
  },
  pickName: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
});
