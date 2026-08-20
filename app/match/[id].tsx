import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import type { MatchConfig, Side } from "@shuttle/score";
import ScorerView from "../../components/scorer-view";
import { useAuth } from "../../lib/auth";
import { announce } from "../../lib/announce";
import { foley } from "../../lib/foley";
import { recordRatings } from "../../lib/rating";
import { groupSport } from "../../lib/session";
import {
  fetchMatch,
  fetchMatchEvents,
  replayMatch,
  scorePoint,
  StaleSeqError,
  undoPoint,
  type LiveMatch,
  type MatchRow,
} from "../../lib/scoring";

export default function MatchScorer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [row, setRow] = useState<MatchRow | null>(null);
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [failed, setFailed] = useState(false);
  const [gone, setGone] = useState(false);
  const [pendingSide, setPendingSide] = useState<Side | null>(null);
  const [writeFailed, setWriteFailed] = useState(false);
  const [caughtUp, setCaughtUp] = useState(false);

  // the documented rehydration recipe: replay the log, nextSeq is
  // events.length + 1 because the RPC guarantees contiguous seqs from 1
  const load = useCallback(async () => {
    setFailed(false);
    try {
      const match = await fetchMatch(id);
      if (!match) {
        // a dead deep link is not a network problem
        setGone(true);
        return;
      }
      setRow(match);
      // a deep link into the scorer skips the group room, so the sport is
      // fetched here rather than assumed from whatever screen ran last
      foley.use(await groupSport(match.group_id));
      if (match.status === "live") {
        const events = await fetchMatchEvents(id);
        setLive({
          matchId: id,
          state: replayMatch(match.config as MatchConfig, events),
          nextSeq: events.length + 1,
        });
      }
    } catch {
      setFailed(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // the S1-26 retry surface: idempotent, so a completion whose rating
  // write failed in scorePoint's fire-and-forget gets a second chance
  // every time this screen shows the result
  const complete = row?.status === "complete" || live?.state.finished === true;
  useEffect(() => {
    if (complete) recordRatings(id).catch((e) => console.warn("rating write failed", e));
  }, [complete, id]);

  const act = async (side: Side | null) => {
    if (!live) return;
    setPendingSide(side ?? (live.state.points[live.state.points.length - 1] as Side));
    setWriteFailed(false);
    setCaughtUp(false);
    // DESIGN.md's sound contract says sub-100ms after input, and this used
    // to wait on the RPC — half a second of silence on hall wifi. The tap
    // makes the sound; the write still owns whether the point stands.
    if (side) foley.drive();
    try {
      const next = side ? await scorePoint(live, side) : await undoPoint(live);
      setLive(next);
      announce(`A ${next.state.score.a}, B ${next.state.score.b}`);
      if (next.state.finished) {
        foley.smash();
        setRow((r) => (r ? { ...r, status: "complete", snapshot: next.state } : r));
      }
    } catch (e) {
      if (e instanceof StaleSeqError) {
        await load();
        setCaughtUp(true);
      } else {
        setWriteFailed(true);
        announce("That point did not save. Tap again.", true);
      }
    } finally {
      setPendingSide(null);
    }
  };

  if (gone) return <ScorerView kind="gone" />;
  if (failed) return <ScorerView kind="error" onRetry={load} />;
  if (!row) return <ScorerView kind="loading" />;

  if (row.status === "complete") {
    const snapshot = live?.state.finished ? live.state : row.snapshot;
    return (
      <ScorerView
        kind="complete"
        games={snapshot?.games ?? []}
        winner={snapshot?.winner ?? null}
        onDone={() => router.back()}
        onNextGame={
          row.session_id
            ? () => router.replace(`/new-match?group=${row.group_id}&session=${row.session_id}`)
            : undefined
        }
      />
    );
  }

  if (!live) return <ScorerView kind="loading" />;

  return (
    <ScorerView
      kind="scoring"
      state={live.state}
      scorerName={profile?.display_name ?? ""}
      pendingSide={pendingSide}
      writeFailed={writeFailed}
      caughtUp={caughtUp}
      onTap={(side) => act(side)}
      onUndo={() => act(null)}
      onLeave={() => router.back()}
    />
  );
}
