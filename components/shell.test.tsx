import { render, screen } from "@testing-library/react-native";
import Compete from "../app/(player)/compete";
import Session from "../app/(player)/session";
import Today from "../app/(player)/today";

// The S0-10 placeholder tabs: empty states render with copy, and Compete
// tells the P2 truth verbatim per the spec.
it("Today's empty state has copy", async () => {
  await render(<Today />);
  expect(screen.getByText("No sessions yet. Your group's nights will land here.")).toBeTruthy();
});

it("Session's empty state has copy", async () => {
  await render(<Session />);
  expect(screen.getByText("Nothing planned. Your next session shows up here.")).toBeTruthy();
});

it("Compete states the P2 truth", async () => {
  await render(<Compete />);
  expect(screen.getByText("Friendly tournaments arrive later.")).toBeTruthy();
});
