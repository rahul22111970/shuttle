// A player's card: the shared analytics component under a back bar. The
// name arrives with the data, so the bar starts generic and settles.
import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import PlayerAnalytics from "../../components/player-analytics";
import { BackBar, Screen } from "../../components/ui";

export default function PlayerCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("Player");
  const back = () => (router.canGoBack() ? router.back() : router.replace("/groups"));
  return (
    <Screen testID="player-card">
      <BackBar title={name} onBack={back} />
      <PlayerAnalytics playerId={id as string} onName={setName} />
    </Screen>
  );
}
