import { render, screen } from "@testing-library/react-native";
import Index from "./index";

// Smoke test. Proves the router entry screen mounts under the test runner,
// which is the only thing S0-01 promises.
// render() is async in @testing-library/react-native v14; without the await,
// screen stays unbound and every query throws notImplemented.
it("renders the entry screen", async () => {
  await render(<Index />);
  expect(screen.getByText("SHUTTLE")).toBeTruthy();
});
