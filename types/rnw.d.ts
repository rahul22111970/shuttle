// react-native-web accepts dataSet on View and renders it as data-* on the
// DOM node; react-native's own types do not know the prop exists. Declared
// here rather than cast at each call site, because there is exactly one use
// (pattern 85's forced-colours opt-out) and a cast would hide it.
import "react-native";

declare module "react-native" {
  interface ViewProps {
    dataSet?: Record<string, string | number | undefined>;
  }
}
