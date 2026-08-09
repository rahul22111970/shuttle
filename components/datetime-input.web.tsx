// The OS's own date-time wheel, free: on web builds this renders a real
// <input type="datetime-local">, which every mobile browser turns into
// its native picker. The .web.tsx suffix keeps native builds on the
// plain-text fallback next door.
import { color, font, radius, size, space } from "../theme/tokens";

export default function DateTimeInput({
  value,
  onChange,
  label,
}: {
  // "YYYY-MM-DDTHH:mm", the input's native format
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="datetime-local"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: `1px solid ${color.lineStrong}`,
        borderRadius: radius.control,
        padding: space.md,
        fontFamily: font.body,
        fontSize: size.body,
        color: color.ink,
        background: color.fog1,
        // mobile Safari gives datetime-local an intrinsic width that beats
        // width:100% until the native appearance is reset; the min/max pair
        // stops the field pushing its card sideways on small phones
        WebkitAppearance: "none",
        appearance: "none",
        display: "block",
        width: "100%",
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
        colorScheme: "light dark",
      }}
    />
  );
}
