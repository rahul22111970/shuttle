// The live night: the session card with checked-in chips, the rounds area,
// and the casual Score-a-game door. Owns all live-session data fetching so
// SessionView stays a planned-session concern.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useLive } from "../lib/use-live";
import { foley } from "../lib/foley";
import { defaultMatch, rulesLine, seatingLabel, type Sport } from "../lib/sport";
import { nightSummary } from "../lib/stats";
import { generateRound, nextGame, talliesForSession, type RoundGeneratedPayload } from "../lib/rounds";
import { startMatch, type Participant } from "../lib/scoring";
import {
  checkIn,
  closeSession,
  rsvpOut,
  fetchSessionEvents,
  rosterFromEvents,
  type Member,
  type Session,
} from "../lib/session";
import { supabase } from "../lib/supabase";
import { TextInput } from "react-native";
import { color, font, layout, radius, size, space, tracking } from "../theme/tokens";
import AddPlayer from "./add-player";
import LedgerPanel from "./ledger-panel";
import VoiceLog from "./voice-log";
import RoundsView, { type CourtCard, type StandingRow } from "./rounds-view";
import { Button, Card, Chip, ErrorNote } from "./ui";

type MatchLite = {
  id: string;
  status: "live" | "complete";
  snapshot: {
    score?: { a: number; b: number };
    games?: { a: number; b: number }[];
    winner?: "a" | "b" | null;
  } | null;
  match_participants?: { player_id: string; side: "a" | "b" }[];
};

export default function LiveNight({
  session,
  groupId,
  groupName,
  sport,
  captainId,
  isCaptain,
  members,
  selfId,
  onClosed,
}: {
  session: Session;
  groupId: string;
  groupName: string;
  sport: Sport;
  // the owner: money collects to their UPI
  captainId: string;
  // owner or co-captain: runs the night
  isCaptain: boolean;
  members: readonly Member[];
  selfId: string;
  onClosed: () => void;
}) {
  const [rounds, setRounds] = useState<RoundGeneratedPayload[]>([]);
  const [checkedIn, setCheckedIn] = useState<readonly string[]>([]);
  const [matches, setMatches] = useState<Map<string, MatchLite>>(new Map());
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [busy, setBusy] = useState<"round" | "checkin" | "score" | "mark" | "deal" | null>(null);
  const [roundError, setRoundError] = useState(false);
  const [nightError, setNightError] = useState(false);
  const [dealError, setDealError] = useState(false);
  const [failed, setFailed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const name = useCallback(
    (id: string) => members.find((m) => m.id === id)?.name ?? "Player",
    [members]
  );

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const events = await fetchSessionEvents(session.id);
      const roster = rosterFromEvents(events);
      setCheckedIn(roster.checkedIn);
      const payloads = events
        .filter((e) => e.type === "round_generated")
        .map((e) => e.payload as unknown as RoundGeneratedPayload);
      setRounds(payloads);
      const { data, error } = await supabase
        .from("matches")
        .select("id, status, snapshot, match_participants(player_id, side)")
        .eq("session_id", session.id);
      if (error) throw error;
      setMatches(new Map((data ?? []).map((m) => [m.id, m as MatchLite])));
      const tallies = await talliesForSession(session.id);
      setStandings(
        Object.entries(tallies)
          .map(([id, points]) => ({ id, name: name(id), points }))
          .sort((x, y) => y.points - x.points || x.name.localeCompare(y.name))
      );
      setLoaded(true);
    } catch {
      setFailed(true);
    }
  }, [session.id, name]);

  // the tab stays mounted beneath a pushed scorer route; refetch whenever
  // the night regains focus so Done labels and standings are never stale
  useLive(load);

  // round failures draw inside the rounds card; check-in and score-a-game
  // failures draw under the night card, so no state can fail silently
  const act = (which: "round" | "checkin" | "score" | "mark" | "deal", fn: () => Promise<unknown>) => async () => {
    setBusy(which);
    setRoundError(false);
    setNightError(false);
    setDealError(false);
    try {
      await fn();
      await load();
    } catch {
      if (which === "round") setRoundError(true);
      else if (which === "deal") setDealError(true);
      else setNightError(true);
    } finally {
      setBusy(null);
    }
  };

  const current = rounds[rounds.length - 1];
  const selfCheckedIn = checkedIn.includes(selfId);
  const roundsProps = () => {
    if (checkedIn.length < 4)
      return { kind: "no-checkins" as const, checkedInCount: checkedIn.length };
    if (!current) {
      return {
        kind: "empty" as const,
        busy: busy === "round",
        actionError: roundError,
        demoted: !selfCheckedIn,
        onFirstRound: (format: "americano" | "mexicano") =>
          act("round", () =>
            generateRound(
              session.id,
              groupId,
              format,
              Math.max(1, Math.floor(checkedIn.length / 4)),
              // engines demand injected integers; the app supplies entropy
              Math.floor(Math.random() * 2147483647)
            )
          )(),
      };
    }
    // round matches are americano configs, whose engine keeps score on
    // completion — the read-games-not-score carry binds bestOf configs only
    const courts: CourtCard[] = current.round.courts.map((court, i) => {
      const match = current.matchIds[i] ? matches.get(current.matchIds[i]) : undefined;
      return {
        matchId: current.matchIds[i],
        status: match?.status ?? "live",
        aNames: court.pairs[0].map(name),
        bNames: court.pairs[1].map(name),
        score: match?.snapshot?.score ?? null,
      };
    });
    return {
      kind: "round" as const,
      roundNumber: rounds.length,
      courts,
      restingNames: current.round.resting.map(name),
      scorerName: current.round.scorer ? name(current.round.scorer) : null,
      standings,
      busy: busy === "round",
      actionError: roundError,
      demoted: !selfCheckedIn,
      onOpenMatch: (matchId: string) => router.push(`/match/${matchId}`),
      onNextRound: act("round", () =>
        generateRound(
          session.id,
          groupId,
          current.format,
          Math.max(1, Math.floor(checkedIn.length / 4)),
          Math.floor(Math.random() * 2147483647)
        )
      ),
    };
  };

  const checkedInSet = new Set(checkedIn);

  // games played tonight: every match a player was seated in, live or complete
  const gamesPlayed = new Map<string, number>();
  for (const m of matches.values())
    for (const p of m.match_participants ?? [])
      gamesPlayed.set(p.player_id, (gamesPlayed.get(p.player_id) ?? 0) + 1);
  const deal = nextGame(checkedIn, gamesPlayed);
  const pairingLine = deal
    ? `${deal.a.map(name).join(" & ")} v ${deal.b.map(name).join(" & ")}`
    : null;
  // the seating decides the format: two on court is singles, and pickleball
  // singles drops the second server
  const dealConfig = defaultMatch(sport, (deal?.a.length ?? 2) === 2);

  if (!loaded && !failed) {
    return (
      <Card>
        <Text style={styles.title}>{groupName}</Text>
        <Text style={styles.liveNote}>The night is on.</Text>
        <Text style={styles.quiet}>Fetching the night…</Text>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <Text style={styles.title}>Who's here</Text>
        <Text style={styles.liveNote}>The night is on.</Text>
        <Text style={styles.quiet}>Tap a name when they arrive.</Text>
        <View style={styles.chipRow}>
          {members.map((m) => (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`Mark ${m.name} ${checkedInSet.has(m.id) ? "out" : "here"}`}
              disabled={busy === "mark"}
              onPress={act("mark", () =>
                checkedInSet.has(m.id) ? rsvpOut(session.id, m.id) : checkIn(session.id, m.id)
              )}
            >
              <Chip label={m.name} active={checkedInSet.has(m.id)} />
            </Pressable>
          ))}
        </View>
        <Text style={styles.quiet}>{checkedIn.length} checked in</Text>
        {!selfCheckedIn ? (
          <Button
            label="I'm here"
            busy={busy === "checkin"}
            busyLabel="Checking in…"
            onPress={act("checkin", () => checkIn(session.id))}
          />
        ) : null}
        {isCaptain ? (
          addOpen ? (
            <AddPlayer groupId={groupId} onAdded={load} />
          ) : (
            <Button label="Add a player" variant="quiet" onPress={() => setAddOpen(true)} />
          )
        ) : null}
        {nightError ? (
          <ErrorNote>That did not go through. Try again.</ErrorNote>
        ) : null}
      </Card>
      {failed ? (
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
      ) : (
        <>
          <Card>
            <Text style={styles.title}>Play</Text>
            {checkedIn.length === 3 ? (
              <Text style={styles.quiet}>One more for a game.</Text>
            ) : checkedIn.length < 2 ? (
              <Text style={styles.quiet}>Check two people in to start a game.</Text>
            ) : deal ? (
              <>
                <Text style={styles.dealNames}>{pairingLine}</Text>
                <Text style={styles.quiet}>
                  {`${seatingLabel(deal.a.length)}. Fewest games first, by arrival.`}
                </Text>
                <Text style={styles.quiet}>{rulesLine(dealConfig)}</Text>
                <Button
                  label="Start this game live"
                  busy={busy === "deal"}
                  busyLabel="Setting up…"
                  onPress={act("deal", async () => {
                    const participants: Participant[] = [
                      ...deal.a.map((player_id) => ({ player_id, side: "a" as const })),
                      ...deal.b.map((player_id) => ({ player_id, side: "b" as const })),
                    ];
                    const live = await startMatch(groupId, dealConfig, participants, session.id);
                    foley.serve();
                    router.push(`/match/${live.matchId}`);
                  })}
                />
              </>
            ) : null}
            {dealError ? (
              <ErrorNote>That did not go through. Try again.</ErrorNote>
            ) : null}
            <Button
              label="Score live · pick the players"
              variant={deal ? "quiet" : "primary"}
              busy={busy === "score"}
              busyLabel="Setting up…"
              onPress={act("score", async () => {
                router.push(`/new-match?group=${groupId}&session=${session.id}`);
              })}
            />
            <Button
              label="Enter a result"
              variant="quiet"
              onPress={() => router.push(`/quick-log?group=${groupId}&session=${session.id}`)}
            />
          </Card>
          <VoiceLog
            members={members}
            groupId={groupId}
            sport={sport}
            sessionId={session.id}
            onLogged={load}
          />
          <Card>
            <Text style={styles.title}>More ways in</Text>
            <Button
              label="Paste a whole night"
              variant="quiet"
              onPress={() => router.push(`/bulk-log?group=${groupId}&session=${session.id}`)}
            />
            <Text style={styles.quiet}>
              Played already? Enter the final score. Or keep points live as they happen.
            </Text>
          </Card>
          {(() => {
            const currentIds = new Set(
              rounds.length > 0 ? rounds[rounds.length - 1].matchIds : []
            );
            const liveNow = [...matches.values()].filter(
              (m) =>
                m.status === "live" &&
                !currentIds.has(m.id) &&
                (m.match_participants?.length ?? 0) > 0
            );
            if (liveNow.length === 0) return null;
            return (
              <Card>
                <Text style={styles.title}>Live now</Text>
                {liveNow.map((m) => {
                  const sideNames = (side: "a" | "b") =>
                    (m.match_participants ?? [])
                      .filter((p) => p.side === side)
                      .map((p) => name(p.player_id))
                      .join(" & ");
                  const score = m.snapshot?.score ?? { a: 0, b: 0 };
                  return (
                    <View key={m.id} style={styles.liveRow}>
                      <View style={styles.liveRowBody}>
                        <Text style={styles.liveRowNames} numberOfLines={1}>
                          {`${sideNames("a")} · ${sideNames("b")}`}
                        </Text>
                        <Text style={styles.liveRowScore}>{`${score.a}–${score.b}`}</Text>
                      </View>
                      <Button
                        label="Continue scoring"
                        variant="quiet"
                        onPress={() => router.push(`/match/${m.id}`)}
                      />
                    </View>
                  );
                })}
              </Card>
            );
          })()}
          <RoundsView {...roundsProps()} />
          {(() => {
            const rows = nightSummary(
              [...matches.values()].map((m) => ({
                status: m.status,
                snapshot: m.snapshot,
                participants: m.match_participants ?? [],
              }))
            );
            if (rows.length === 0) return null;
            return (
              <Card testID="tonight-summary">
                <Text style={styles.title}>Tonight</Text>
                <View style={styles.sumHead}>
                  <Text style={[styles.sumCell, styles.sumName]}> </Text>
                  <Text style={styles.sumCell}>W</Text>
                  <Text style={styles.sumCell}>L</Text>
                  <Text style={styles.sumCell}>Win %</Text>
                  <Text style={styles.sumCell}>Pts</Text>
                </View>
                {rows.map((r) => (
                  <View key={r.playerId} style={styles.sumRow}>
                    <Text style={[styles.sumCellText, styles.sumName]} numberOfLines={1}>
                      {name(r.playerId)}
                    </Text>
                    <Text style={styles.sumFig}>{r.wins}</Text>
                    <Text style={styles.sumFig}>{r.losses}</Text>
                    <Text style={styles.sumFig}>{r.winPct === null ? "–" : `${r.winPct}%`}</Text>
                    <Text style={styles.sumFig}>{r.points}</Text>
                  </View>
                ))}
              </Card>
            );
          })()}
          <LedgerPanel
            groupId={groupId}
            sessionId={session.id}
            captainId={captainId}
            members={members}
            checkedIn={checkedIn}
            selfId={selfId}
          />
          {isCaptain ? (
            <Button
              label={
                closeArmed
                  ? "Close the night · no more games join it · tap again"
                  : "Close the night"
              }
              variant="quiet"
              busy={closing}
              busyLabel="Closing…"
              onPress={async () => {
                if (!closeArmed) {
                  setCloseArmed(true);
                  return;
                }
                setClosing(true);
                try {
                  await closeSession(session.id);
                  onClosed();
                } catch {
                  setNightError(true);
                } finally {
                  setClosing(false);
                  setCloseArmed(false);
                }
              }}
            />
          ) : null}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  addInput: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontFamily: font.body,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.fog1,
  },
  sumHead: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    paddingBottom: space.xs,
  },
  sumRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
  sumName: { flex: 1, textAlign: "left" },
  sumCell: {
    width: 44,
    textAlign: "right",
    fontFamily: font.medium,
    fontSize: size.label,
    color: color.ink3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sumCellText: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  sumFig: {
    width: 44,
    textAlign: "right",
    fontFamily: font.mono,
    fontSize: 13,
    color: color.ink2,
    fontVariant: ["tabular-nums"],
  },
  liveRow: { gap: space.sm, paddingVertical: space.xs },
  liveRowBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveRowNames: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  dealNames: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  liveRowScore: {
    fontFamily: font.monoBold,
    fontSize: 15,
    color: color.court,
    fontVariant: ["tabular-nums"],
  },
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  liveNote: { fontFamily: font.body, fontSize: size.body, color: color.court },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    maxWidth: layout.column,
  },
});
