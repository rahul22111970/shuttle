import { render, screen } from "@testing-library/react-native";
import RoundsView from "./rounds-view";

const noop = () => {};

it("renders the no-checkins state by name, with the count", async () => {
  await render(<RoundsView kind="no-checkins" checkedInCount={3} />);
  expect(screen.getByText("Check people in, then deal fair games. 3 checked in.")).toBeTruthy();
});

it("empty state before round 1 has copy and both formats", async () => {
  await render(
    <RoundsView kind="empty" busy={false} actionError={false} demoted={false} onFirstRound={noop} />
  );
  expect(screen.getByText("Everyone in? Pick tonight's format.")).toBeTruthy();
  expect(screen.getByText("Americano")).toBeTruthy();
  expect(screen.getByText("Mexicano")).toBeTruthy();
});

it("court cards carry pairings, results, resume, resting, scorer and standings", async () => {
  await render(
    <RoundsView
      kind="round"
      roundNumber={2}
      courts={[
        {
          matchId: "m1",
          status: "complete",
          aNames: ["Asha", "Bela"],
          bNames: ["Chirag", "Dev"],
          score: { a: 14, b: 10 },
        },
        {
          matchId: "m2",
          status: "live",
          aNames: ["Esha", "Farid"],
          bNames: ["Gita", "Hari"],
          score: null,
        },
      ]}
      restingNames={["Indu"]}
      scorerName="Indu"
      standings={[
        { id: "u1", name: "Asha", points: 26 },
        { id: "u3", name: "Chirag", points: 22 },
      ]}
      busy={false}
      actionError={false}
      demoted={false}
      onOpenMatch={noop}
      onNextRound={noop}
    />
  );
  expect(screen.getByText("Round 2")).toBeTruthy();
  expect(screen.getByText("Asha & Bela")).toBeTruthy();
  expect(screen.getByText("14–10")).toBeTruthy();
  expect(screen.getByText("Done")).toBeTruthy();
  expect(screen.getByText("Resume scoring")).toBeTruthy();
  expect(screen.getByText("Resting: Indu")).toBeTruthy();
  expect(screen.getByText("Indu holds the phone")).toBeTruthy();
  expect(screen.getByText("Next round")).toBeTruthy();
  expect(screen.getByText("26")).toBeTruthy();
});

it("labels are actions, never Submit or OK", async () => {
  await render(
    <RoundsView kind="empty" busy={false} actionError={false} demoted={false} onFirstRound={noop} />
  );
  expect(screen.queryByText(/^(Submit|OK)$/i)).toBeNull();
});
