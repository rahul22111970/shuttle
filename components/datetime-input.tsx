// Native fallback until the EAS build gets a real wheel: plain text in
// the same "YYYY-MM-DDTHH:mm" format the web input produces. The pilot
// runs on web, where datetime-input.web.tsx replaces this file.
import { TextInput } from "react-native";
import { color, font, radius, size, space } from "../theme/tokens";

export default function DateTimeInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      placeholder="2026-08-09T19:00"
      placeholderTextColor={color.ink3}
      style={{
        borderWidth: 1,
        borderColor: color.lineStrong,
        borderRadius: radius.control,
        padding: space.md,
        fontFamily: font.body,
        fontSize: size.body,
        color: color.ink,
        backgroundColor: color.fog1,
      }}
    />
  );
}
