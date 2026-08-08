// The live night: the session card with checked-in chips, the rounds area,
// and the casual Score-a-game door. Owns all live-session data fetching so
// SessionView stays a planned-session concern.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { foley } from "../lib/foley";
import { generateRound, talliesForSession, type RoundGeneratedPayload } from "../lib/rounds";
import {
  checkIn,
  rsvpOut,
  fetchSessionEvents,
  rosterFromEvents,
  type Member,
  type Session,
} from "../lib/session";
import { supabase } from "../lib/supabase";
import { color, font, layout, radius, size, space, tracking } from "../theme/tokens";
import LedgerPanel from "./ledger-panel";
import RoundsView, { type CourtCard, type StandingRow } from "./rounds-view";
import { Button, Card, Chip, ErrorNote, Screen } from "./ui";

type MatchLite = {
  id: string;
  status: "live" | "complete";
  snapshot: { score?: { a: number; b: number } } | null;
  match_participants?: { player_id: string; side: "a" | "b" }[];
};

export default function LiveNight({
  session,
  groupId,
  groupName,
  captainId,
  members,
  selfId,
}: {
  session: Session;
  groupId: string;
  groupName: string;
  captainId: string;
  members: readonly Member[];
  selfId: string;
}) {
  const [rounds, setRounds] = useState<RoundGeneratedPayload[]>([]);
  const [checkedIn, setCheckedIn] = useState<readonly string[]>([]);
  const [matches, setMatches] = useState<Map<string, MatchLite>>(new Map());
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [busy, setBusy] = useState<"round" | "checkin" | "score" | "mark" | null>(null);
  const [roundError, setRoundError] = useState(false);
  const [nightError, setNightError] = useState(false);
  const [failed, setFailed] = useState(false);
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
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // round failures draw inside the rounds card; check-in and score-a-game
  // failures draw under the night card, so no state can fail silently
  const act = (which: "round" | "checkin" | "score" | "mark", fn: () => Promise<unknown>) => async () => {
    setBusy(which);
    setRoundError(false);
    setNightError(false);
    try {
      await fn();
      await load();
    } catch {
      if (which === "round") setRoundError(true);
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

  if (!loaded && !failed) {
    return (
      <Screen>
        <Card>
          <Text style={styles.title}>{groupName}</Text>
          <Text style={styles.liveNote}>The night is on.</Text>
          <Text style={styles.quiet}>Fetching the night…</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Text style={styles.title}>{groupName}</Text>
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
        {nightError ? (
          <ErrorNote>That did not go through. Try again.</ErrorNote>
        ) : null}
      </Card>
      {failed ? (
        <ErrorNote>Could not reach the hall. Check your network and try again.</ErrorNote>
      ) : (
        <>
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
          <LedgerPanel
            groupId={groupId}
            sessionId={session.id}
            captainId={captainId}
            members={members}
            checkedIn={checkedIn}
            selfId={selfId}
          />
        </>
      )}
      <Button
        label="Score a game"
        variant="quiet"
        busy={busy === "score"}
        busyLabel="Setting up…"
        onPress={act("score", async () => {
          router.push(`/new-match?group=${groupId}&session=${session.id}`);
        })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  liveRow: { gap: space.sm, paddingVertical: space.xs },
  liveRowBody: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveRowNames: { flex: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
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
