// The ledger verbs. Balances are never stored: every read folds the event
// log through @shuttle/split (decision 15), whose additive fold is
// permutation-invariant — which is also why seq here is client-computed
// with no lock or RPC (PM decision at S1-19, weighing the S1-18 review's
// note): a concurrent collision costs display order nothing, because the
// list sorts (seq, created_at, id) and the math cannot notice order at all.
import {
  pairwiseNets,
  totals,
  type LedgerEvent as SplitEvent,
  type PairwiseNets,
} from "@shuttle/split";
import { supabase } from "./supabase";

export type LedgerEventRow = {
  id: string;
  group_id: string;
  session_id: string | null;
  seq: number;
  type: "expense" | "settlement";
  payer_id: string;
  amount_paise: number;
  participant_ids: string[];
  created_by: string;
  created_at: string;
};

async function nextSeq(groupId: string): Promise<number> {
  const { data, error } = await supabase
    .from("ledger_events")
    .select("seq")
    .eq("group_id", groupId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle<{ seq: number }>();
  if (error) throw error;
  return (data?.seq ?? 0) + 1;
}

// Court and shuttles land here. Participants arrive explicit; the UI
// defaults them to the session roster (S1-20). The payer defaults to the
// writer but may be anyone in the group — whoever opened their wallet.
export async function addExpense(
  groupId: string,
  amountPaise: number,
  participantIds: readonly string[],
  options: { payerId?: string; sessionId?: string } = {}
): Promise<LedgerEventRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("not signed in");
  const { data, error } = await supabase
    .from("ledger_events")
    .insert({
      group_id: groupId,
      session_id: options.sessionId ?? null,
      seq: await nextSeq(groupId),
      type: "expense",
      payer_id: options.payerId ?? userData.user.id,
      amount_paise: amountPaise,
      participant_ids: [...participantIds],
      created_by: userData.user.id,
    })
    .select()
    .single<LedgerEventRow>();
  if (error) throw error;
  return data;
}

// Cash moved from one pocket to another; any member may record it (the
// captain marking a debtor settled is the common case).
export async function recordSettlement(
  groupId: string,
  fromPlayerId: string,
  toPlayerId: string,
  amountPaise: number,
  sessionId?: string
): Promise<LedgerEventRow> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("not signed in");
  const { data, error } = await supabase
    .from("ledger_events")
    .insert({
      group_id: groupId,
      session_id: sessionId ?? null,
      seq: await nextSeq(groupId),
      type: "settlement",
      payer_id: fromPlayerId,
      amount_paise: amountPaise,
      participant_ids: [toPlayerId],
      created_by: userData.user.id,
    })
    .select()
    .single<LedgerEventRow>();
  if (error) throw error;
  return data;
}

export async function fetchGroupLedger(groupId: string): Promise<LedgerEventRow[]> {
  const { data, error } = await supabase
    .from("ledger_events")
    .select("*")
    .eq("group_id", groupId)
    .order("seq", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LedgerEventRow[];
}

// Row → engine shape: settlements carry their payee as the single
// participant (the 0009 CHECK guarantees exactly one, never the payer).
export function toSplitEvents(rows: readonly LedgerEventRow[]): SplitEvent[] {
  return rows.map((row) =>
    row.type === "expense"
      ? {
          type: "expense" as const,
          payer: row.payer_id,
          amountPaise: row.amount_paise,
          participants: row.participant_ids,
        }
      : {
          type: "settlement" as const,
          from: row.payer_id,
          to: row.participant_ids[0],
          amountPaise: row.amount_paise,
        }
  );
}

export type GroupBalances = {
  nets: PairwiseNets;
  // positive = owes the group, negative = is owed
  perPlayer: Readonly<Record<string, number>>;
};

export async function groupBalances(groupId: string): Promise<GroupBalances> {
  const nets = pairwiseNets(toSplitEvents(await fetchGroupLedger(groupId)));
  return { nets, perPlayer: totals(nets) };
}
