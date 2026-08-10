// The group room: everything about one group behind one door, the same
// four sections for every group — Night, Games, Stats, Members. The group
// in the URL is the context; no hidden active-group state.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { setActiveGroupId } from "../../lib/groups";
import { listGroups, type Group } from "../../lib/session";
import { useAuth } from "../../lib/auth";
import { color, font, layout, space } from "../../theme/tokens";
import GamesSection from "../../components/games-section";
import MembersSection from "../../components/members-section";
import NightSection from "../../components/night-section";
import StatsSection from "../../components/stats-section";
import { BackBar, Button, ErrorNote, Screen } from "../../components/ui";

const SECTIONS = [
  { key: "night", label: "Night" },
  { key: "games", label: "Games" },
  { key: "stats", label: "Stats" },
  { key: "members", label: "Members" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export default function GroupRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const selfId = session?.user.id ?? "";
  const [section, setSection] = useState<SectionKey>("night");
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; group: Group }
  >({ kind: "loading" });

  const back = () => (router.canGoBack() ? router.back() : router.replace("/groups"));

  const load = useCallback(async () => {
    try {
      const group = (await listGroups()).find((g) => g.id === id);
      if (!group) {
        setState({ kind: "error" });
        return;
      }
      // remember the last opened group: Me and the quick-log default follow
      setActiveGroupId(group.id);
      setState({ kind: "ready", group });
    } catch {
      setState({ kind: "error" });
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <Screen testID="group-room">
        <BackBar title="Group" onBack={back} />
        <Text style={styles.quiet}>Opening the group…</Text>
      </Screen>
    );
  }
  if (state.kind === "error") {
    return (
      <Screen testID="group-room">
        <BackBar title="Group" onBack={back} />
        <ErrorNote>Could not open this group. Check your network and try again.</ErrorNote>
        <Button label="Try again" onPress={load} />
      </Screen>
    );
  }

  const { group } = state;
  return (
    <Screen testID="group-room">
      <BackBar title={group.name} onBack={back} />
      <View style={styles.tabs}>
        {SECTIONS.map((s) => {
          const on = section === s.key;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
              onPress={() => setSection(s.key)}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {section === "night" ? <NightSection group={group} selfId={selfId} /> : null}
      {section === "games" ? <GamesSection group={group} selfId={selfId} /> : null}
      {section === "stats" ? <StatsSection groupId={group.id} /> : null}
      {section === "members" ? <MembersSection group={group} selfId={selfId} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quiet: { fontFamily: font.body, fontSize: 12.5, color: color.ink3 },
  tabs: {
    width: "100%",
    maxWidth: layout.column,
    flexDirection: "row",
    gap: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: color.inkWash,
  },
  tabOn: { backgroundColor: color.ink },
  tabText: { fontFamily: font.bold, fontSize: 13, color: color.ink2 },
  tabTextOn: { color: color.fog0 },
});
