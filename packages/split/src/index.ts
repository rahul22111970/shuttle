// @shuttle/split: the night's money as arithmetic. Amounts are paise
// integers, always. Balances are a pure fold of ledger events; the fold is
// additive, so event order can never change a balance.
//
// BACKLOG decision 9: pairwise nets carried across sessions, no debt-graph
// simplification. Who owes whom stays exactly who owes whom.

export type ExpenseEvent = {
  readonly type: "expense";
  readonly payer: string;
  readonly amountPaise: number;
  // who shares the expense; the payer may or may not be among them
  readonly participants: readonly string[];
};

export type SettlementEvent = {
  readonly type: "settlement";
  readonly from: string;
  readonly to: string;
  readonly amountPaise: number;
};

export type LedgerEvent = ExpenseEvent | SettlementEvent;

// Pair keys are canonical: "x|y" with x < y. A positive net means x owes y;
// negative means y owes x.
export type PairwiseNets = ReadonlyMap<string, number>;

export const pairKey = (x: string, y: string): string => {
  // the key format is load-bearing: a name containing the separator would
  // silently split into three segments and corrupt balances
  if (x.includes("|") || y.includes("|")) {
    throw new Error("player names must not contain '|'");
  }
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

function assertPaise(amount: number, what: string): void {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error(`${what} must be a positive integer of paise, got ${amount}`);
  }
}

// Equal split with a deterministic remainder: everyone pays floor(n-th),
// and the leftover paise land on the first names in lexicographic order,
// so the same expense always splits the same way regardless of how the
// participant list happened to be ordered.
//
// The lex-first bias is ≤1 paisa per expense and stays. Do not "fix" it by
// rotating on fold state (expense count etc.) — that breaks permutation
// invariance. The only safe de-bias is a pure function of the expense
// itself, e.g. offsetting by amountPaise % n.
export function perHeadShares(expense: ExpenseEvent): Readonly<Record<string, number>> {
  validateExpense(expense);
  const names = [...expense.participants].sort();
  const base = Math.floor(expense.amountPaise / names.length);
  const remainder = expense.amountPaise - base * names.length;
  const shares: Record<string, number> = {};
  names.forEach((name, i) => {
    shares[name] = base + (i < remainder ? 1 : 0);
  });
  return shares;
}

function validateExpense(e: ExpenseEvent): void {
  assertPaise(e.amountPaise, "expense amount");
  if (e.participants.length === 0) throw new Error("an expense needs participants");
  if (new Set(e.participants).size !== e.participants.length) {
    throw new Error("participants must be unique");
  }
  if (!e.payer) throw new Error("an expense needs a payer");
}

function validateSettlement(e: SettlementEvent): void {
  assertPaise(e.amountPaise, "settlement amount");
  if (!e.from || !e.to) throw new Error("a settlement needs both sides");
  if (e.from === e.to) throw new Error("a settlement needs two different people");
}

// Fold the log into pairwise nets. Every event is a sum of per-pair deltas,
// so the fold commutes: any ordering of the same events gives the same nets.
export function pairwiseNets(events: readonly LedgerEvent[]): PairwiseNets {
  const nets = new Map<string, number>();
  const add = (x: string, y: string, xOwesYDelta: number) => {
    // store against the canonical key, sign flipped when the key reverses
    const key = pairKey(x, y);
    const signed = x < y ? xOwesYDelta : -xOwesYDelta;
    nets.set(key, (nets.get(key) ?? 0) + signed);
  };

  for (const event of events) {
    if (event.type === "expense") {
      const shares = perHeadShares(event);
      for (const [name, share] of Object.entries(shares)) {
        if (name !== event.payer) add(name, event.payer, share);
      }
    } else {
      validateSettlement(event);
      // cash moved from -> to, so from's debt to to shrinks by that much
      add(event.from, event.to, -event.amountPaise);
    }
  }

  // drop settled-to-zero pairs so "no balance" and "zero balance" look alike
  for (const [key, value] of nets) {
    if (value === 0) nets.delete(key);
  }
  return nets;
}

// Per-player totals: positive = owes the group, negative = is owed.
export function totals(nets: PairwiseNets): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const [key, value] of nets) {
    const [x, y] = key.split("|");
    out[x] = (out[x] ?? 0) + value;
    out[y] = (out[y] ?? 0) - value;
  }
  return out;
}
