// The bulk-log controller: paste a night of scores, live parse against the
// group's members, then quickLog each parsed game in line order. Opened from
// other screens with ?group&session; falls back to the active group.
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import BulkLogView, { previewRows } from "../components/bulk-log-view";
import { parseBulk, suggest } from "../lib/bulk";
import { foley } from "../lib/foley";
import { quickLog, type Participant } from "../lib/scoring";
import { pickActive } from "../lib/groups";
import { defaultMatch, type Sport } from "../lib/sport";
import {
  groupSport,
  listGroupMembers,
  listGroups,
  nextSession,
  type Member,
} from "../lib/session";

const back = () => (router.canGoBack() ? router.back() : router.replace("/groups"));

export default function BulkLog() {
  const { group, session } = useLocalSearchParams<{ group?: string; session?: string }>();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "no-group" }
    | {
        kind: "ready";
        groupId: string;
        sport: Sport;
        liveSessionId: string | null;
        members: Member[];
      }
  >({ kind: "loading" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const [partial, setPartial] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const groupId = group ?? pickActive(await listGroups())?.id;
      if (!groupId) {
        setState({ kind: "no-group" });
        return;
      }
      const [members, sess, sport] = await Promise.all([
        listGroupMembers(groupId),
        session ? Promise.resolve(null) : nextSession(groupId),
        groupSport(groupId),
      ]);
      foley.use(sport);
      setState({
        kind: "ready",
        groupId,
        sport,
        liveSessionId: sess && sess.status === "live" ? sess.id : null,
        members,
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [group]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.kind === "loading") return <BulkLogView kind="loading" />;
  if (state.kind === "error") return <BulkLogView kind="error" onRetry={load} />;
  if (state.kind === "no-group") return <BulkLogView kind="no-group" onBack={back} />;

  const result = parseBulk(text, state.members);
  const nameOf = (id: string) =>
    state.members.find((m) => m.id === id)?.name ?? "Player";

  return (
    <BulkLogView
      kind="ready"
      onBack={back}
      text={text}
      onText={(v) => {
        setText(v);
        setPartial(null);
      }}
      suggestions={suggest(text, state.members)}
      onPick={(s) => {
        setText(text.slice(0, text.length - s.matched.length) + s.name + " ");
        setPartial(null);
      }}
      rows={previewRows(result, nameOf)}
      count={result.games.length}
      busy={busy}
      progress={progress}
      saved={saved}
      partial={partial}
      onAdd={async () => {
        if (busy || result.games.length === 0) return;
        setBusy(true);
        setPartial(null);
        setProgress(0);
        const n = result.games.length;
        for (let i = 0; i < n; i++) {
          const g = result.games[i];
          const participants: Participant[] = [
            ...g.a.map((id) => ({ player_id: id, side: "a" as const })),
            ...g.b.map((id) => ({ player_id: id, side: "b" as const })),
          ];
          try {
            await quickLog(
              state.groupId,
              defaultMatch(state.sport, participants.length === 4),
              participants,
              g.score,
              session || state.liveSessionId || undefined
            );
            setProgress(i + 1);
          } catch {
            setPartial(`Added ${i} of ${n}. Line ${g.line} failed — the rest are untouched.`);
            setBusy(false);
            return;
          }
        }
        // say it landed, then leave: the silent instant exit read as "did
        // anything happen?" at the hall
        foley.drive();
        setBusy(false);
        setSaved(n);
        setTimeout(back, 1200);
      }}
    />
  );
}
