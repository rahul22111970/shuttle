import { render, screen } from "@testing-library/react-native";
import {
  BASE_K,
  ELO_SCALE,
  INITIAL_RATING,
  PROVISIONAL_K,
  PROVISIONAL_MATCHES,
} from "@shuttle/rating";
import RatingMath from "./rating-math";

// the S1-27 acceptance: the constants players READ are the constants the
// engine EXPORTS — imported here from @shuttle/rating and matched against
// the rendered page, so a tuning change that skips the page fails loudly
it("displayed constants equal the engine's exports", async () => {
  await render(<RatingMath />);
  expect(screen.getByText(new RegExp(`Everyone starts at ${INITIAL_RATING}, in every group\\.`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`Yours is ${BASE_K}\\.`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`first ${PROVISIONAL_MATCHES} rated`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`use ${PROVISIONAL_K}, so you find`))).toBeTruthy();
  expect(screen.getByText(new RegExp(`a ${ELO_SCALE}-point gap`))).toBeTruthy();
});

it("the page speaks the voice contract, ending in a way back", async () => {
  await render(<RatingMath />);
  expect(screen.getByText("How the rating works")).toBeTruthy();
  expect(screen.getByText("Doubles")).toBeTruthy();
  expect(screen.getByText("Back")).toBeTruthy();
});
