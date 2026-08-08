import { render, screen } from "@testing-library/react-native";
import Compete from "../app/(player)/compete";

// The S0-10 placeholder tabs: Compete tells the P2 truth verbatim per the
// spec. Session became real at S1-10, Today at S1-21; their states live in
// session-view.test.tsx and today-view.test.tsx.

it("Compete states the P2 truth", async () => {
  await render(<Compete />);
  expect(screen.getByText("Friendly tournaments arrive later.")).toBeTruthy();
});
