// The captain's add-a-player form: name + 10-digit number, account minted
// the moment it saves, sign-in works immediately with number + group code.
// Lives on the Groups screen and on the live night.
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { supabase } from "../lib/supabase";
import { color, font, radius, size, space } from "../theme/tokens";
import { Button, ErrorNote } from "./ui";

export default function AddPlayer({
  groupId,
  onAdded,
}: {
  groupId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Their name"
        accessibilityLabel="New player name"
        placeholderTextColor={color.ink3}
      />
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Their number"
        accessibilityLabel="New player number"
        inputMode="tel"
        placeholderTextColor={color.ink3}
      />
      <Button
        label="Add to the group"
        busy={busy}
        busyLabel="Adding…"
        disabled={!name.trim() || phone.replace(/\D/g, "").length < 10}
        onPress={async () => {
          setBusy(true);
          setNote(null);
          setFailed(null);
          try {
            const token = (await supabase.auth.getSession()).data.session?.access_token;
            const r = await fetch("/api/add-player", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ groupId, name, phone }),
            });
            const body = await r.json();
            if (!r.ok) throw new Error(body.error ?? "failed");
            setNote(`${body.name} is in. They sign in with their number and the group code.`);
            setName("");
            setPhone("");
            onAdded();
          } catch (e) {
            setFailed(
              e instanceof Error && e.message !== "failed"
                ? e.message
                : "Could not add them. Try again."
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {note ? <Text style={styles.quiet}>{note}</Text> : null}
      {failed ? <ErrorNote>{failed}</ErrorNote> : null}
    </>
  );
}

const styles = StyleSheet.create({
  quiet: { fontFamily: font.body, fontSize: size.label, color: color.ink3 },
  input: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: radius.control,
    padding: space.md,
    fontFamily: font.body,
    fontSize: size.body,
    color: color.ink,
    backgroundColor: color.fog1,
  },
});
