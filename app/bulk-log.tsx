// The bulk-log controller: paste a night of scores, live parse against the
// group's members, then quickLog each parsed game in line order. Opened from
// other screens with ?group&session; falls back to the active group.
import { useCallback, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { PRESETS } from "@shuttle/score";
import BulkLogView, { previewRows } from "../components/bulk-log-view";
import { parseBulk } from "../lib/bulk";
import { foley } from "../lib/foley";
import { quickLog, type Participant } from "../lib/scoring";
import { pickActive } from "../lib/groups";
import { listGroupMembers, listGroups, nextSession, type Member } from "../lib/session";

const back = () => (router.canGoBack() ? router.back() : router.replace("/session"));

export default function BulkLog() {
  const { group, session } = useLocalSearchParams<{ group?: string; session?: string }>();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error" }
    | { kind: "no-group" }
    | { kind: "ready"; groupId: string; liveSessionId: string | null; members: Member[] }
  >({ kind: "loading" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const groupId = group ?? pickActive(await listGroups())?.id;
      if (!groupId) {
        setState({ kind: "no-group" });
        return;
      }
      const [members, sess] = await Promise.all([
        listGroupMembers(groupId),
        session ? Promise.resolve(null) : nextSession(groupId),
      ]);
      setState({
        kind: "ready",
        groupId,
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
      rows={previewRows(result, nameOf)}
      count={result.games.length}
      busy={busy}
      partial={partial}
      onAdd={async () => {
        if (busy || result.games.length === 0) return;
        setBusy(true);
        setPartial(null);
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
              PRESETS.casual1x21,
              participants,
              g.score,
              session || state.liveSessionId || undefined
            );
          } catch {
            setPartial(`Added ${i} of ${n}. Line ${g.line} failed — the rest are untouched.`);
            setBusy(false);
            return;
          }
        }
        foley.drive();
        back();
      }}
    />
  );
}
