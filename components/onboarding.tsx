import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { parseIndianPhone } from "../lib/phone";
import { upsertProfile, type AccountType, type Profile } from "../lib/profile";
import { color, layout, radius, shadow, size, space, tracking } from "../theme/tokens";

const TYPES: { value: AccountType; label: string; detail: string }[] = [
  { value: "player", label: "Player", detail: "Play nights, score games, settle up." },
  { value: "organiser", label: "Organiser", detail: "Run real events with entries and draws." },
];

export default function Onboarding({
  userId,
  email,
  onDone,
  onSignOut,
}: {
  userId: string;
  email: string;
  onDone: (profile: Profile) => void;
  onSignOut: () => void;
}) {
  const [accountType, setAccountType] = useState<AccountType>("player");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      setError("Add your name.");
      return;
    }
    const parsed = parseIndianPhone(phone);
    if (!parsed) {
      setError("That number does not look right. 10 digits, starts 6-9.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const profile = await upsertProfile({
        id: userId,
        display_name: name.trim(),
        phone: parsed,
        account_type: accountType,
      });
      onDone(profile);
    } catch {
      setError("Could not save. Try again.");
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Text style={styles.mark}>SHUTTLE</Text>
      <Text style={styles.signedInAs}>
        {email} · <Text style={styles.signOut} accessibilityRole="link" onPress={onSignOut}>Sign out</Text>
      </Text>
      <View style={styles.typeRow}>
        {TYPES.map((t) => (
          <Pressable
            key={t.value}
            accessibilityRole="button"
            style={[styles.typeCard, accountType === t.value && styles.typeCardOn]}
            onPress={() => setAccountType(t.value)}
          >
            <Text style={styles.typeLabel}>{t.label}</Text>
            <Text style={styles.typeDetail}>{t.detail}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={color.ink3}
        autoComplete="name"
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone (+91)"
        placeholderTextColor={color.ink3}
        autoComplete="tel"
        inputMode="tel"
      />
      <Pressable style={[styles.button, saving && styles.buttonBusy]} onPress={save} disabled={saving}>
        <Text style={styles.buttonText}>
          {saving ? "Saving…" : accountType === "player" ? "Start playing" : "Set up events"}
        </Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
    backgroundColor: color.fog0,
  },
  mark: {
    fontSize: size.display,
    letterSpacing: size.display * tracking.label,
    color: color.ink,
  },
  signedInAs: { fontSize: size.label, color: color.ink3 },
  signOut: { color: color.court },
  typeRow: { flexDirection: "row", gap: space.md, alignSelf: "stretch", maxWidth: layout.column, marginHorizontal: "auto" },
  typeCard: {
    flex: 1,
    // depth is the ring, never a hard border; the border only marks selection
    boxShadow: [...shadow.ring],
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
    backgroundColor: color.card,
  },
  typeCardOn: { borderColor: color.court, backgroundColor: color.courtWash },
  typeLabel: { fontSize: size.body, color: color.ink },
  typeDetail: { fontSize: size.label, color: color.ink2 },
  input: {
    alignSelf: "stretch",
    maxWidth: layout.column,
    marginHorizontal: "auto",
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.card,
  },
  button: {
    backgroundColor: color.court,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  buttonBusy: { backgroundColor: color.courtDeep },
  buttonText: { color: color.chalk, fontSize: size.body },
  error: { fontSize: size.body, color: color.cork, textAlign: "center" },
});
