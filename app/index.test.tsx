import { render, screen } from "@testing-library/react-native";
import { AuthProvider } from "../lib/auth";
import Index from "./index";

// render() is async in @testing-library/react-native v14; without the await,
// screen stays unbound and every query throws notImplemented.
it("renders the pilot-first login", async () => {
  await render(
    <AuthProvider>
      <Index />
    </AuthProvider>
  );
  // findByText waits out the initial session check before the screen draws.
  expect(await screen.findByText("Step on court")).toBeTruthy();

  expect(screen.getByText("SHUTTLE")).toBeTruthy();
  expect(screen.getByText("The night runs on your phone.")).toBeTruthy();
  expect(screen.getByLabelText("Your number")).toBeTruthy();
  expect(screen.getByPlaceholderText("Group code")).toBeTruthy();

  // the email door stays open, demoted to quiet
  expect(screen.getByText("Email me a sign-in link")).toBeTruthy();
  expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();

  // providers are honest placeholders: labelled, disabled, marked Soon
  expect(screen.getAllByText("Soon")).toHaveLength(2);
  for (const name of ["Google", "Apple"]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
  }
});
