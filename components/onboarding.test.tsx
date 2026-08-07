import { render, screen, userEvent } from "@testing-library/react-native";
import Onboarding from "./onboarding";

const noop = () => {};

it("labels are actions, never Submit or OK", async () => {
  await render(
    <Onboarding userId="u" email="x@y.z" onDone={noop} onSignOut={noop} />
  );
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
  expect(screen.getByText("Start playing")).toBeTruthy();
});

it("the CTA follows the chosen account type", async () => {
  await render(
    <Onboarding userId="u" email="x@y.z" onDone={noop} onSignOut={noop} />
  );
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: /Organiser/ }));
  expect(screen.getByText("Set up events")).toBeTruthy();
  await user.press(screen.getByRole("button", { name: /Player/ }));
  expect(screen.getByText("Start playing")).toBeTruthy();
});

it("draws both account types with their one-line truths", async () => {
  await render(
    <Onboarding userId="u" email="x@y.z" onDone={noop} onSignOut={noop} />
  );
  expect(screen.getByText("Player")).toBeTruthy();
  expect(screen.getByText("Organiser")).toBeTruthy();
});
