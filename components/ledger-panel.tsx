// The money area of a live night: loads the captain's VPA and the group
// balances, derives who owes the captain, and keeps freshly settled rows
// visible with their flipped chip until the next full load.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { pairKey } from "@shuttle/split";
import { addExpense, groupBalances, recordSettlement } from "../lib/ledger";
import type { Profile } from "../lib/profile";
import type { Member } from "../lib/session";
import { supabase } from "../lib/supabase";
import LedgerView, { type DebtorRow } from "./ledger-view";

export default function LedgerPanel({
  groupId,
  sessionId,
  captainId,
  members,
  checkedIn,
  selfId,
}: {
  groupId: string;
  sessionId: string;
  captainId: string;
  members: readonly Member[];
  checkedIn: readonly string[];
  selfId: string;
}) {
  const [vpa, setVpa] = useState<string | null>(null);
  const [debtors, setDebtors] = useState<DebtorRow[]>([]);
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busyExpense, setBusyExpense] = useState(false);
  const [busyVpa, setBusyVpa] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);

  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "Player";
  const captainName = name(captainId);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("upi_vpa")
        .eq("id", captainId)
        .maybeSingle<Pick<Profile, "upi_vpa">>();
      if (error) throw error;
      setVpa(data?.upi_vpa ?? null);

      const { nets } = await groupBalances(groupId);
      const rows: DebtorRow[] = [];
      for (const member of members) {
        if (member.id === captainId) continue;
        const key = pairKey(member.id, captainId);
        const value = nets.get(key) ?? 0;
        // positive means the lexically-smaller id owes the larger one;
        // normalise to "member owes captain"
        const owes = member.id < captainId ? value : -value;
        if (owes > 0) rows.push({ id: member.id, name: member.name, amountPaise: owes, settled: false });
      }
      setDebtors(rows);
      setSettled(new Set());
      setLoaded(true);
    } catch {
      // a failed load must NOT fall through to missing-vpa: that screen
      // invites the captain to overwrite a VPA they already saved
      setLoadFailed(true);
      setLoaded(true);
    }
  }, [groupId, captainId, members]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!loaded) return null;
  if (loadFailed) return <LedgerView kind="load-error" onRetry={load} />;

  const isCaptain = selfId === captainId;

  if (!vpa) {
    return (
      <LedgerView
        kind="missing-vpa"
        isCaptain={isCaptain}
        busy={busyVpa}
        actionError={actionError}
        onSaveVpa={async (newVpa) => {
          setBusyVpa(true);
          setActionError(false);
          try {
            // one column, one update: no read-modify-write to clobber a
            // concurrent profile edit
            const { error } = await supabase
              .from("profiles")
              .update({ upi_vpa: newVpa })
              .eq("id", selfId);
            if (error) throw error;
            await load();
          } catch {
            setActionError(true);
          } finally {
            setBusyVpa(false);
          }
        }}
      />
    );
  }

  const checkedInMembers = members.filter((m) => checkedIn.includes(m.id));

  return (
    <LedgerView
      kind="ready"
      isCaptain={isCaptain}
      selfId={selfId}
      captainName={captainName}
      vpa={vpa}
      checkedInMembers={checkedInMembers}
      debtors={debtors.map((d) => (settled.has(d.id) ? { ...d, settled: true } : d))}
      busyExpense={busyExpense}
      settlingId={settlingId}
      actionError={actionError}
      onAddExpense={async (amountPaise, participantIds) => {
        setBusyExpense(true);
        setActionError(false);
        try {
          // the captain fronts the money in this panel: only the captain
          // sees the form (view gates on isCaptain), so the payer is honest
          await addExpense(groupId, amountPaise, participantIds, {
            payerId: captainId,
            sessionId,
          });
          await load();
        } catch {
          setActionError(true);
        } finally {
          setBusyExpense(false);
        }
      }}
      onMarkSettled={async (debtorId, amountPaise) => {
        setSettlingId(debtorId);
        setActionError(false);
        try {
          await recordSettlement(groupId, debtorId, captainId, amountPaise, sessionId);
          // the chip flips in place; the next load recomputes from the log
          setSettled((prev) => new Set(prev).add(debtorId));
        } catch {
          setActionError(true);
        } finally {
          setSettlingId(null);
        }
      }}
    />
  );
}
