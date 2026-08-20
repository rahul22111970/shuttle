// Pattern 79 from ATELIER PRIME, react-aria's model.
//
// react-native-web ships AccessibilityInfo.announceForAccessibility as an
// empty function, so on the web build nothing this app does is announced at
// all. That matters more since the scorer became seven segments: the score
// is now a pile of Views with a clipped number beside it, and a clipped
// number that changes silently tells a screen-reader user nothing.
//
// Two rules from the source, both load-bearing. Two regions, polite and
// assertive, created once — swapping modes on one region is unreliable.
// And APPEND a node per message, never overwrite the text: a swap that
// lands in the same tick as the last one is dropped by most readers.
import { AccessibilityInfo } from "react-native";

const LIFE_MS = 7000;
let root: HTMLElement | null = null;

// the presence of a document IS the web test here, rather than Platform.OS:
// it is the thing this code actually needs, and it is true under jsdom
function region(mode: "polite" | "assertive"): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!root) {
    root = document.createElement("div");
    root.style.cssText =
      "position:absolute;width:1px;height:1px;overflow:hidden;" +
      "clip-path:inset(50%);white-space:nowrap;";
    for (const m of ["polite", "assertive"] as const) {
      const r = document.createElement("div");
      r.dataset.mode = m;
      r.setAttribute("role", "log");
      r.setAttribute("aria-live", m);
      r.setAttribute("aria-relevant", "additions");
      root.append(r);
    }
    document.body.append(root);
  }
  return root.querySelector(`[data-mode="${mode}"]`);
}

export function announce(message: string, assertive = false): void {
  if (!message) return;
  const target = region(assertive ? "assertive" : "polite");
  if (!target) {
    // native has a real implementation; only the web one is a stub
    AccessibilityInfo.announceForAccessibility?.(message);
    return;
  }
  const node = document.createElement("div");
  node.textContent = message;
  target.append(node);
  // garbage collection, never a swap
  setTimeout(() => node.remove(), LIFE_MS);
}

// test seam: the regions are module state and jsdom keeps them between tests
export function resetAnnouncer(): void {
  root?.remove();
  root = null;
}
