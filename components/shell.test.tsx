import { render, screen } from "@testing-library/react-native";
import Compete from "../app/(player)/compete";
import Today from "../app/(player)/today";

// The S0-10 placeholder tabs: empty states render with copy, and Compete
// tells the P2 truth verbatim per the spec. Session became a real screen at
// S1-10; its states are covered by name in session-view.test.tsx.
it("Today's empty state has copy", async () => {
  await render(<Today />);
  expect(screen.getByText("No sessions yet. Your group's nights will land here.")).toBeTruthy();
});

it("Compete states the P2 truth", async () => {
  await render(<Compete />);
  expect(screen.getByText("Friendly tournaments arrive later.")).toBeTruthy();
});
