// The Members section: who is in this group. Tap a name for their stats.
// Captains (owner or co-captain) add people and remove them with a
// confirming tap. Only the owner promotes or demotes co-captains; matches
// already played always stay.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useLive } from "../lib/use-live";
import { listGroups, type Group } from "../lib/session";
import { supabase } from "../lib/supabase";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import AddPlayer from "./add-player";
import { Button, Card, Chip, ErrorNote } from "./ui";

type MemberRow = { id: string; name: string; isCaptain: boolean };
type Candidate = { id: string; name: string };

export default function MembersSection({ group, selfId }: { group: Group; selfId: string }) {
  const owner = group.captain_id === selfId;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "ready"; members: MemberRow[]; candidates: Candidate[]; canManage: boolean }
  >({ kind: "loading" });
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [quickError, setQuickError] = useState(false);
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await supabase
        .from("group_members")
        .select("group_id, player_id, is_captain, profiles!inner(display_name)")
        .eq("group_id", group.id);
      if (res.error) throw res.error;
      const members = res.data
        .map((r) => ({
          id: r.player_id,
          name: (r.profiles as unknown as { display_name: string }).display_name,
          isCaptain: r.is_captain,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const canManage = owner || members.some((m) => m.id === selfId && m.isCaptain);
      // one-tap candidates: people from my other groups, captains only
      let candidates: Candidate[] = [];
      if (canManage) {
        const groups = (await listGroups()).filter((g) => g.id !== group.id);
        if (groups.length > 0) {
          const other = await supabase
            .from("group_members")
            .select("player_id, profiles!inner(display_name)")
            .in("group_id", groups.map((g) => g.id));
          if (other.error) throw other.error;
          const inGroup = new Set(members.map((m) => m.id));
          const seen = new Set<string>();
          candidates = other.data
            .map((r) => ({
              id: r.player_id,
              name: (r.profiles as unknown as { display_name: string }).display_name,
            }))
            .filter((c) => {
              if (inGroup.has(c.id) || seen.has(c.id)) return false;
              seen.add(c.id);
              return true;
            });
        }
      }
      setState({ kind: "ready", members, candidates, canManage });
    } catch {
      setState({ kind: "error" });
    }
  }, [group.id, owner, selfId]);

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

  const { members, candidates, canManage } = state;

  const setCaptain = async (playerId: string, next: boolean) => {
    setRowBusy(true);
    setRowError(false);
    try {
      const res = await supabase
        .from("group_members")
        .update({ is_captain: next })
        .eq("group_id", group.id)
        .eq("player_id", playerId);
      if (res.error) throw res.error;
      await load();
    } catch {
      setRowError(true);
    } finally {
      setRowBusy(false);
    }
  };

  return (
    <>
      <Card testID="members-card">
        <Text style={styles.title}>
          {members.length} {members.length === 1 ? "player" : "players"}
        </Text>
        <Text style={styles.quiet}>Tap a name for their stats.</Text>
        {members.map((m) => {
          const armed = removeArmed === m.id;
          const isOwnerRow = m.id === group.captain_id;
          return (
            <View key={m.id} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${m.name}`}
                style={styles.rowNameHit}
                onPress={() => router.push(`/player/${m.id}`)}
              >
                <Text style={styles.rowName} numberOfLines={1}>
                  {m.name}
                </Text>
              </Pressable>
              {isOwnerRow ? <Chip label="Captain" active /> : null}
              {!isOwnerRow && m.isCaptain ? <Chip label="Co-captain" active /> : null}
              {m.id === selfId ? <Chip label="You" /> : null}
              {owner && !isOwnerRow ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={m.isCaptain ? `Demote ${m.name}` : `Make ${m.name} captain`}
                  disabled={rowBusy}
                  style={styles.rowBtn}
                  onPress={() => setCaptain(m.id, !m.isCaptain)}
                >
                  <Text style={styles.rowBtnText}>{m.isCaptain ? "Demote" : "Make captain"}</Text>
                </Pressable>
              ) : null}
              {canManage && !isOwnerRow && m.id !== selfId ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={armed ? `Really remove ${m.name}` : `Remove ${m.name}`}
                  disabled={rowBusy}
                  style={[styles.rowBtn, armed && styles.rowBtnArmed]}
                  onPress={async () => {
                    if (!armed) {
                      setRemoveArmed(m.id);
                      setRowError(false);
                      return;
                    }
                    setRowBusy(true);
                    try {
                      const res = await supabase
                        .from("group_members")
                        .delete()
                        .eq("group_id", group.id)
                        .eq("player_id", m.id);
                      if (res.error) throw res.error;
                      await load();
                    } catch {
                      setRowError(true);
                    } finally {
                      setRowBusy(false);
                      setRemoveArmed(null);
                    }
                  }}
                >
                  <Text style={[styles.rowBtnText, armed && styles.rowBtnTextArmed]}>
                    {armed ? "Sure? Tap again" : "Remove"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        {rowError ? <ErrorNote>That did not go through. Try again.</ErrorNote> : null}
        {canManage ? (
          <Text style={styles.quiet}>Removing someone keeps the games they played.</Text>
        ) : null}
        {owner ? (
          <Text style={styles.quiet}>
            Co-captains can do everything you can, except wipe data or change captains.
          </Text>
        ) : null}
        <Text style={styles.codeLine}>
          Group code: <Text style={styles.code}>{group.code}</Text>
        </Text>
        <Text style={styles.quiet}>
          Everyone here signs in with their number and this code.
        </Text>
      </Card>
      {canManage ? (
        <Card testID="add-player-card">
          <Text style={styles.title}>Add a player</Text>
          <Text style={styles.quiet}>
            Their account exists the moment you add them. Share the group code and they
            are in.
          </Text>
          {candidates.length > 0 ? (
            <>
              <Text style={styles.quiet}>From your other groups, one tap:</Text>
              <View style={styles.pickWrap}>
                {candidates.map((c) => (
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
  codeLine: {
    fontFamily: font.body,
    fontSize: size.body,
    color: color.ink2,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  code: { fontFamily: font.monoBold, color: color.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: space.sm,
  },
  rowNameHit: { flex: 1 },
  rowName: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  rowBtn: {
    borderRadius: radius.control,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: color.inkWash,
  },
  rowBtnArmed: { backgroundColor: color.corkWash },
  rowBtnText: { fontFamily: font.bold, fontSize: 12, color: color.ink2 },
  rowBtnTextArmed: { color: color.cork },
  pickWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pick: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    backgroundColor: color.inkWash,
  },
  pickName: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
});
