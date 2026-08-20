// The group room: everything about one group behind one door, the same
// four sections for every group — Night, Games, Stats, Members. The group
// in the URL is the context; no hidden active-group state.
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { setActiveGroupId } from "../../lib/groups";
import { foley } from "../../lib/foley";
import { asSport } from "../../lib/sport";
import { listGroups, type Group } from "../../lib/session";
import { useAuth } from "../../lib/auth";
import { color, font, layout, space } from "../../theme/tokens";
import GamesSection from "../../components/games-section";
import MembersSection from "../../components/members-section";
import NightSection from "../../components/night-section";
import StatsSection from "../../components/stats-section";
import ElasticTabs from "../../components/elastic-tabs";
import { BackBar, Button, ErrorNote, Screen, Skeleton, SKEL } from "../../components/ui";

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
  // a pull has to refresh what you are LOOKING at, not the room's own row;
  // the sections poll on their own, and this bumps them off-schedule
  const [nonce, setNonce] = useState(0);
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
      // and the sound of the room follows the sport it plays
      foley.use(asSport(group.sport));
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
        <Skeleton bars={SKEL.card} />
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
    <Screen
      testID="group-room"
      onRefresh={async () => {
        setNonce((n) => n + 1);
        await load();
      }}
    >
      <BackBar title={group.name} onBack={back} />
      <ElasticTabs sections={SECTIONS} value={section} onPick={setSection} />
      {section === "night" ? <NightSection group={group} selfId={selfId} nonce={nonce} /> : null}
      {section === "games" ? <GamesSection group={group} selfId={selfId} nonce={nonce} /> : null}
      {section === "stats" ? <StatsSection groupId={group.id} nonce={nonce} /> : null}
      {section === "members" ? <MembersSection group={group} selfId={selfId} nonce={nonce} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quiet: { fontFamily: font.body, fontSize: 12.5, color: color.ink3 },
});
