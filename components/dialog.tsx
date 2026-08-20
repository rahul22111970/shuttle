// Patterns 84 (dialog in 2026) and 07 (the exit contract), which belong
// together: a dialog is the thing most often removed before its exit has
// finished playing.
//
// The platform does the hard half. react-native-web's Modal is a real
// portal with a focus trap, aria-modal, and Escape wired to onRequestClose,
// so none of that is re-implemented here.
//
// What is ported is the contract: no duration lives in the caller. The
// caller flips `open` and this component decides when the node actually
// goes. A generation counter covers the reopen-mid-exit case the source
// pattern names — flip it back open while the exit is playing and the stale
// completion must not remove anything.
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { prefersReducedMotion, SETTLE, SPRING, timing } from "../lib/motion";
import { announce } from "../lib/announce";
import { color, font, layout, radius, size, space, tracking } from "../theme/tokens";
import { Button } from "./ui";

export default function Dialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Never mind",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const t = useRef(new Animated.Value(0)).current;
  const gen = useRef(0);

  useEffect(() => {
    const mine = ++gen.current;
    if (open) {
      setMounted(true);
      timing(t, 1, SPRING, false).start();
      announce(title, true);
      return;
    }
    if (!mounted) return;
    timing(t, 0, SETTLE, false).start(({ finished }) => {
      // stale: it was reopened while this exit was playing
      if (!finished || mine !== gen.current) return;
      setMounted(false);
    });
  }, [open, mounted, t, title]);

  if (!mounted) return null;

  const lift = prefersReducedMotion()
    ? 0
    : t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <Modal transparent animationType="none" visible onRequestClose={onCancel}>
      <Animated.View style={[styles.scrim, { opacity: t }]}>
        {/* tapping the scrim is the same as cancelling, which is what
            closedby="any" gives you on a real dialog element */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          onPress={onCancel}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[styles.plate, { opacity: t, transform: [{ translateY: lift }] }]}
        >
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Button label={confirmLabel} busy={busy} busyLabel="Working…" onPress={onConfirm} />
          <Button label={cancelLabel} variant="quiet" onPress={onCancel} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    backgroundColor: color.scrim,
  },
  plate: {
    width: "100%",
    maxWidth: layout.column,
    gap: space.md,
    borderRadius: radius.card,
    padding: space.lg,
    backgroundColor: color.card,
  },
  title: {
    fontFamily: font.display,
    fontSize: size.display,
    color: color.ink,
    letterSpacing: size.display * tracking.display,
  },
  body: { fontFamily: font.body, fontSize: size.body, color: color.ink2 },
});
