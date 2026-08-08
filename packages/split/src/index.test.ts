import fc from "fast-check";
import {
  pairKey,
  pairwiseNets,
  perHeadShares,
  totals,
  type ExpenseEvent,
  type LedgerEvent,
} from "@shuttle/split";

const RUNS = { numRuns: 1000 };

const PLAYERS = ["asha", "bela", "chirag", "dev", "esha", "farid"];

const expenseArb: fc.Arbitrary<ExpenseEvent> = fc
  .record({
    payer: fc.constantFrom(...PLAYERS),
    amountPaise: fc.integer({ min: 1, max: 500_000 }),
    participants: fc.shuffledSubarray(PLAYERS, { minLength: 1, maxLength: PLAYERS.length }),
  })
  .map((e) => ({ type: "expense" as const, ...e }));

const settlementArb: fc.Arbitrary<LedgerEvent> = fc
  .record({
    pair: fc.shuffledSubarray(PLAYERS, { minLength: 2, maxLength: 2 }),
    amountPaise: fc.integer({ min: 1, max: 500_000 }),
  })
  .map(({ pair, amountPaise }) => ({
    type: "settlement" as const,
    from: pair[0],
    to: pair[1],
    amountPaise,
  }));

const eventsArb = fc.array(fc.oneof(expenseArb, settlementArb), { maxLength: 40 });

it("conservation: engine totals equal totals recomputed from the raw events", () => {
  fc.assert(
    fc.property(eventsArb, (events) => {
      // independent oracle: each player's position derived straight from the
      // event list, never touching the code under test. Own share of every
      // expense is owed; paying an expense is owed back; settlements move
      // cash. The engine's totals must match to the paise, and their sum is
      // zero as a consequence rather than by construction.
      const expected: Record<string, number> = {};
      const bump = (name: string, delta: number) => {
        expected[name] = (expected[name] ?? 0) + delta;
      };
      for (const event of events) {
        if (event.type === "expense") {
          const names = [...event.participants].sort();
          const base = Math.floor(event.amountPaise / names.length);
          const remainder = event.amountPaise - base * names.length;
          names.forEach((name, i) => bump(name, base + (i < remainder ? 1 : 0)));
          bump(event.payer, -event.amountPaise);
        } else {
          bump(event.from, -event.amountPaise);
          bump(event.to, event.amountPaise);
        }
      }
      const actual = totals(pairwiseNets(events));
      const clean = (r: Readonly<Record<string, number>>) =>
        Object.fromEntries(Object.entries(r).filter(([, v]) => v !== 0));
      expect(clean(actual)).toEqual(clean(expected));
      const sum = Object.values(actual).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    }),
    RUNS
  );
});

it("per-head shares sum exactly to the expense and differ by at most one paisa", () => {
  fc.assert(
    fc.property(expenseArb, (expense) => {
      const shares = perHeadShares(expense);
      const values = Object.values(shares);
      expect(values.reduce((a, b) => a + b, 0)).toBe(expense.amountPaise);
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      expect(Object.keys(shares).sort()).toEqual([...expense.participants].sort());
    }),
    RUNS
  );
});

it("the remainder lands deterministically: participant order cannot change a share", () => {
  fc.assert(
    fc.property(expenseArb, (expense) => {
      // reverse is an arbitrary reordering; shares must not notice
      const reordered: ExpenseEvent = {
        ...expense,
        participants: [...expense.participants].reverse(),
      };
      expect(perHeadShares(reordered)).toEqual(perHeadShares(expense));
      // and the same call twice is identical (no ambient anything)
      expect(perHeadShares(expense)).toEqual(perHeadShares(expense));
    }),
    RUNS
  );
});

it("a settlement of X reduces that pair's |net| by exactly X", () => {
  fc.assert(
    fc.property(eventsArb, (events) => {
      const nets = pairwiseNets(events);
      // find any indebted pair and settle part of it in the owing direction
      const entry = [...nets.entries()].find(([, v]) => v !== 0);
      if (!entry) return;
      const [key, value] = entry;
      const [x, y] = key.split("|");
      const from = value > 0 ? x : y; // the ower pays
      const to = value > 0 ? y : x;
      const amount = Math.max(1, Math.floor(Math.abs(value) / 2));
      const settled = pairwiseNets([
        ...events,
        { type: "settlement", from, to, amountPaise: amount },
      ]);
      const before = Math.abs(value);
      const after = Math.abs(settled.get(key) ?? 0);
      expect(after).toBe(before - amount);

      // and overpaying flips the pair: the surplus becomes reverse debt
      const over = before + 7;
      const flipped = pairwiseNets([
        ...events,
        { type: "settlement", from, to, amountPaise: over },
      ]);
      const flippedValue = flipped.get(key) ?? 0;
      expect(Math.abs(flippedValue)).toBe(7);
      expect(Math.sign(flippedValue)).toBe(-Math.sign(value));
    }),
    RUNS
  );
});

it("event order never changes the nets", () => {
  fc.assert(
    fc.property(
      eventsArb.chain((events) =>
        fc.record({
          events: fc.constant(events),
          shuffledEvents: fc.shuffledSubarray(events, {
            minLength: events.length,
            maxLength: events.length,
          }),
        })
      ),
      ({ events, shuffledEvents }) => {
        expect(pairwiseNets(shuffledEvents)).toEqual(pairwiseNets(events));
      }
    ),
    RUNS
  );
});

it("worked example: court and shuttles across three players", () => {
  // asha pays 600 court for all three; bela pays 250 shuttles for all three;
  // chirag settles his court share with asha
  const events: LedgerEvent[] = [
    { type: "expense", payer: "asha", amountPaise: 600, participants: ["asha", "bela", "chirag"] },
    { type: "expense", payer: "bela", amountPaise: 250, participants: ["asha", "bela", "chirag"] },
    { type: "settlement", from: "chirag", to: "asha", amountPaise: 200 },
  ];
  const nets = pairwiseNets(events);
  // 600/3 = 200 each; 250/3 = 84/83/83 with the extra paisa to asha (lex first)
  expect(nets.get(pairKey("bela", "asha"))).toBeDefined();
  // bela owes asha 200 (court), asha owes bela 84 (shuttles) -> bela owes 116
  expect(nets.get(pairKey("asha", "bela"))).toBe(-116);
  // chirag owed asha 200 court, settled 200 -> pair dropped as zero
  expect(nets.get(pairKey("asha", "chirag"))).toBeUndefined();
  // chirag owes bela his shuttle share
  expect(nets.get(pairKey("bela", "chirag"))).toBe(-83);
  const t = totals(nets);
  expect(t.asha).toBe(-116);
  expect(t.chirag).toBe(83);
  expect(t.bela).toBe(116 - 83);
});

it("refuses bad money", () => {
  expect(() =>
    perHeadShares({ type: "expense", payer: "a", amountPaise: 0, participants: ["a"] })
  ).toThrow("positive integer");
  expect(() =>
    perHeadShares({ type: "expense", payer: "a", amountPaise: 10.5, participants: ["a"] })
  ).toThrow("positive integer");
  expect(() =>
    perHeadShares({ type: "expense", payer: "a", amountPaise: 10, participants: [] })
  ).toThrow("participants");
  expect(() =>
    perHeadShares({ type: "expense", payer: "a", amountPaise: 10, participants: ["b", "b"] })
  ).toThrow("unique");
  expect(() =>
    pairwiseNets([{ type: "settlement", from: "a", to: "a", amountPaise: 10 }])
  ).toThrow("different people");
  expect(() =>
    pairwiseNets([{ type: "settlement", from: "a", to: "b", amountPaise: -5 }])
  ).toThrow("positive integer");
  expect(() =>
    pairwiseNets([{ type: "settlement", from: "a|b", to: "c", amountPaise: 5 }])
  ).toThrow("must not contain");
});
