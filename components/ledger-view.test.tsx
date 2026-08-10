import { render, screen } from "@testing-library/react-native";
import LedgerView, { upiLink } from "./ledger-view";

const noop = () => {};

it("missing-VPA state renders for the captain, with the save action", async () => {
  await render(
    <LedgerView kind="missing-vpa" isCaptain={true} busy={false} actionError={false} onSaveVpa={noop} />
  );
  expect(screen.getByText("Add your UPI ID so the group can pay you.")).toBeTruthy();
  expect(screen.getByText("Save UPI ID")).toBeTruthy();
});

it("missing-VPA state renders for a member, without the form", async () => {
  await render(
    <LedgerView kind="missing-vpa" isCaptain={false} busy={false} actionError={false} onSaveVpa={noop} />
  );
  expect(screen.getByText("The captain has not added a UPI ID yet.")).toBeTruthy();
  expect(screen.queryByText("Save UPI ID")).toBeNull();
});

it("ready state draws presets, participants, debtors and chips", async () => {
  await render(
    <LedgerView
      kind="ready"
      isCaptain={true}
      selfId="u1"
      captainName="Asha"
      vpa="asha@upi"
      checkedInMembers={[
        { id: "u1", name: "Asha", is_captain: false },
        { id: "u2", name: "Bela", is_captain: false },
      ]}
      debtors={[
        { id: "u2", name: "Bela", amountPaise: 30000, settled: false },
        { id: "u3", name: "Chirag", amountPaise: 25000, settled: true },
      ]}
      busyExpense={false}
      settlingId={null}
      actionError={false}
      onAddExpense={noop}
      onMarkSettled={noop}
    />
  );
  expect(screen.getByText("Court")).toBeTruthy();
  expect(screen.getByText("Shuttles")).toBeTruthy();
  expect(screen.getByText("Collect ₹300")).toBeTruthy();
  expect(screen.getByText("Pending")).toBeTruthy();
  expect(screen.getByText("Paid")).toBeTruthy();
  expect(screen.getByText("Settled")).toBeTruthy();
});

it("empty debtor list has copy", async () => {
  await render(
    <LedgerView
      kind="ready"
      isCaptain={true}
      selfId="u1"
      captainName="Asha"
      vpa="asha@upi"
      checkedInMembers={[]}
      debtors={[]}
      busyExpense={false}
      settlingId={null}
      actionError={false}
      onAddExpense={noop}
      onMarkSettled={noop}
    />
  );
  expect(screen.getByText("Nobody owes you tonight.")).toBeTruthy();
});

it("upiLink carries pa, am and tn, percent-encoded never plus-encoded", () => {
  const href = upiLink("asha@upi", "Asha Rao", 25700, "Shuttle night");
  expect(href.startsWith("upi://pay?")).toBe(true);
  // UPI apps parse + literally; spaces must be %20
  expect(href).toContain("pn=Asha%20Rao");
  expect(href).toContain("tn=Shuttle%20night");
  expect(href).not.toContain("+");
  expect(href).toContain("pa=asha%40upi");
  expect(href).toContain("am=257.00");
  expect(href).toContain("cu=INR");
});

it("the debtor sees their own row with a Pay link, not the captain console", async () => {
  await render(
    <LedgerView
      kind="ready"
      isCaptain={false}
      selfId="u2"
      captainName="Asha"
      vpa="asha@upi"
      checkedInMembers={[]}
      debtors={[{ id: "u2", name: "Bela", amountPaise: 30000, settled: false }]}
      busyExpense={false}
      settlingId={null}
      actionError={false}
      onAddExpense={noop}
      onMarkSettled={noop}
    />
  );
  expect(screen.getByText("You owe ₹300")).toBeTruthy();
  expect(screen.getByText("Pay ₹300")).toBeTruthy();
  expect(screen.queryByText("Add court expense")).toBeNull();
});

it("a settled-up member sees the quiet truth", async () => {
  await render(
    <LedgerView
      kind="ready"
      isCaptain={false}
      selfId="u9"
      captainName="Asha"
      vpa="asha@upi"
      checkedInMembers={[]}
      debtors={[]}
      busyExpense={false}
      settlingId={null}
      actionError={false}
      onAddExpense={noop}
      onMarkSettled={noop}
    />
  );
  expect(screen.getByText("You are settled up.")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(
    <LedgerView kind="missing-vpa" isCaptain={true} busy={false} actionError={false} onSaveVpa={noop} />
  );
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});
