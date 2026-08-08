// The night ledger, presentational and pure. Court and shuttles presets,
// per-head arithmetic straight from @shuttle/split, one UPI link per
// debtor, paid chips that flip on settle. Renders POSITION in any list,
// never raw seq (S1-19 carry).
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { perHeadShares } from "@shuttle/split";
import type { Member } from "../lib/session";
import { color, font, radius, size, space, tracking } from "../theme/tokens";
import { Button, Card, Chip, ErrorNote } from "./ui";

export type DebtorRow = {
  id: string;
  name: string;
  amountPaise: number;
  settled: boolean;
};

export type LedgerViewProps =
  | { kind: "load-error"; onRetry: () => void }
  | {
      kind: "missing-vpa";
      isCaptain: boolean;
      busy: boolean;
      actionError: boolean;
      onSaveVpa: (vpa: string) => void;
    }
  | {
      kind: "ready";
      isCaptain: boolean;
      selfId: string;
      captainName: string;
      vpa: string;
      checkedInMembers: readonly Member[];
      debtors: readonly DebtorRow[];
      busyExpense: boolean;
      settlingId: string | null;
      actionError: boolean;
      onAddExpense: (amountPaise: number, participantIds: readonly string[], note: string) => void;
      onMarkSettled: (debtorId: string, amountPaise: number) => void;
    };

// every pending link shares one fixed note: the debt is an aggregate of
// nets, so no single expense note applies
const LINK_NOTE = "Shuttle night";

// UPI apps parse + literally in pn/tn; percent-encoding is the safe form
const enc = encodeURIComponent;

export const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function upiLink(vpa: string, captainName: string, amountPaise: number, note: string): string {
  return (
    `upi://pay?pa=${enc(vpa)}&pn=${enc(captainName)}` +
    `&am=${(amountPaise / 100).toFixed(2)}&tn=${enc(note)}&cu=INR`
  );
}

// light shape check: something@something, the form every VPA takes
export const looksLikeVpa = (v: string) => /^[\w.\-]+@[\w\-]+$/.test(v);

export default function LedgerView(props: LedgerViewProps) {
  const [vpaText, setVpaText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState<"Court" | "Shuttles">("Court");
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  if (props.kind === "load-error") {
    return (
      <Card>
        <Text style={styles.title}>Money</Text>
        <ErrorNote>Could not load the ledger. Check your network and try again.</ErrorNote>
        <Button label="Try again" variant="quiet" onPress={props.onRetry} />
      </Card>
    );
  }

  if (props.kind === "missing-vpa") {
    return (
      <Card>
        <Text style={styles.title}>Money</Text>
        {props.isCaptain ? (
          <>
            <Text style={styles.copy}>Add your UPI ID so the group can pay you.</Text>
            <TextInput
              style={styles.input}
              value={vpaText}
              onChangeText={setVpaText}
              placeholder="you@upi"
              accessibilityLabel="UPI ID"
              autoCapitalize="none"
              placeholderTextColor={color.ink3}
            />
            <Button
              label="Save UPI ID"
              busy={props.busy}
              busyLabel="Saving…"
              disabled={!looksLikeVpa(vpaText.trim())}
              onPress={() => props.onSaveVpa(vpaText.trim())}
            />
            {props.actionError ? (
              <ErrorNote>That did not save. Try again.</ErrorNote>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>The captain has not added a UPI ID yet.</Text>
        )}
      </Card>
    );
  }

  // non-captains get their own money truth: what they owe and one Pay link
  if (!props.isCaptain) {
    const own = props.debtors.find((d) => d.id === props.selfId);
    return (
      <Card>
        <Text style={styles.title}>Money</Text>
        {own && !own.settled ? (
          <View style={styles.debtorRow}>
            <Text style={styles.debtorName}>You owe {rupees(own.amountPaise)}</Text>
            <Text
              accessibilityRole="link"
              {...({ href: upiLink(props.vpa, props.captainName, own.amountPaise, LINK_NOTE) } as Record<string, unknown>)}
              style={styles.collect}
            >
              Pay {rupees(own.amountPaise)}
            </Text>
          </View>
        ) : (
          <Text style={styles.quiet}>You are settled up.</Text>
        )}
      </Card>
    );
  }

  const participants = props.checkedInMembers.filter((m) => !excluded.has(m.id));
  const parsed = Number.parseFloat(amountText);
  const amountPaise = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  const shares =
    amountPaise > 0 && participants.length > 0
      ? perHeadShares({
          type: "expense",
          payer: "preview",
          amountPaise,
          participants: participants.map((m) => m.id),
        })
      : null;
  const perHead = shares ? Math.max(...Object.values(shares)) : 0;

  return (
    <Card>
      <Text style={styles.title}>Money</Text>
      <View style={styles.presetRow}>
        {(["Court", "Shuttles"] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            style={[styles.preset, note === p && styles.presetOn]}
            onPress={() => setNote(p)}
          >
            <Text style={[styles.presetText, note === p && styles.presetTextOn]}>{p}</Text>
          </Pressable>
        ))}
        <TextInput
          style={[styles.input, styles.amount]}
          value={amountText}
          onChangeText={setAmountText}
          placeholder="₹"
          accessibilityLabel="Amount in rupees"
          inputMode="decimal"
          placeholderTextColor={color.ink3}
        />
      </View>
      <View style={styles.chipRow}>
        {props.checkedInMembers.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityLabel={`Toggle ${m.name}`}
            onPress={() =>
              setExcluded((prev) => {
                const next = new Set(prev);
                if (next.has(m.id)) next.delete(m.id);
                else next.add(m.id);
                return next;
              })
            }
          >
            <Chip label={m.name} active={!excluded.has(m.id)} />
          </Pressable>
        ))}
      </View>
      {shares ? (
        <Text style={styles.copy}>
          {rupees(perHead)} a head · {participants.length} sharing
        </Text>
      ) : null}
      <Button
        label={`Add ${note.toLowerCase()} expense`}
        busy={props.busyExpense}
        busyLabel="Adding…"
        disabled={!(amountPaise > 0) || participants.length === 0 || props.settlingId !== null}
        onPress={() =>
          props.onAddExpense(
            amountPaise,
            participants.map((m) => m.id),
            note
          )
        }
      />
      {props.debtors.length > 0 ? (
        <View style={styles.debtors}>
          {props.debtors.map((d) => (
            <View key={d.id} style={styles.debtorRow}>
              <Text style={styles.debtorName}>{d.name}</Text>
              <Chip label={d.settled ? "Paid" : "Pending"} active={d.settled} />
              {d.settled ? null : (
                <>
                  <Text
                    accessibilityRole="link"
                    // RNW renders this as an anchor and passes href through;
                    // core RN types do not know the prop
                    {...({ href: upiLink(props.vpa, props.captainName, d.amountPaise, LINK_NOTE) } as Record<string, unknown>)}
                    style={styles.collect}
                  >
                    Collect {rupees(d.amountPaise)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${d.name} settled`}
                    disabled={props.settlingId !== null || props.busyExpense}
                    style={[
                      styles.settle,
                      (props.settlingId !== null || props.busyExpense) && styles.settleOff,
                    ]}
                    onPress={() => props.onMarkSettled(d.id, d.amountPaise)}
                  >
                    <Text style={styles.settleText}>
                      {props.settlingId === d.id ? "Settling…" : "Settled"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.quiet}>Nobody owes you tonight.</Text>
      )}
      {props.actionError ? (
        <ErrorNote>That did not go through. Try again.</ErrorNote>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.medium, fontSize: size.label, color: color.ink3, textTransform: "uppercase", letterSpacing: size.label * tracking.label },
  copy: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  input: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.fog1,
  },
  presetRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  preset: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  presetOn: { borderColor: color.court, backgroundColor: color.courtWash },
  presetText: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
  presetTextOn: { color: color.courtDeep },
  amount: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  debtors: { gap: space.sm },
  debtorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexWrap: "wrap",
  },
  debtorName: { fontFamily: font.body, fontSize: size.body, color: color.ink, flexShrink: 1 },
  collect: { fontFamily: font.body, fontSize: size.body, color: color.court },
  settle: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  settleOff: { opacity: 0.4 },
  settleText: { fontFamily: font.body, fontSize: size.label, color: color.ink2 },
});
