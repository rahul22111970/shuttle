import { rosterFromEvents, type SessionEvent } from "./session";

let n = 0;
const ev = (
  type: SessionEvent["type"],
  actor: string,
  payload: Record<string, unknown> = {}
): SessionEvent => ({
  id: `e${++n}`,
  session_id: "s1",
  seq: n,
  type,
  actor_id: actor,
  payload,
  created_at: new Date(2026, 7, 9, 6, 0, n).toISOString(),
});

// the subject defaults to the actor: the original self-service semantics
it("self events mark the actor", () => {
  const r = rosterFromEvents([ev("rsvp_in", "a"), ev("check_in", "b")]);
  expect([...r.attending].sort()).toEqual(["a", "b"]);
  expect(r.checkedIn).toEqual(["b"]);
});

// arrivals logged from someone else's phone: the payload names the subject,
// the actor stays whoever tapped
it("a payload player_id marks that player, not the actor", () => {
  const r = rosterFromEvents([
    ev("check_in", "captain", { player_id: "stub1" }),
    ev("check_in", "captain", { player_id: "stub2" }),
  ]);
  expect([...r.checkedIn].sort()).toEqual(["stub1", "stub2"]);
  expect(r.attending).not.toContain("captain");
});

it("marking someone out via payload removes them and only them", () => {
  const r = rosterFromEvents([
    ev("check_in", "captain", { player_id: "stub1" }),
    ev("check_in", "captain"),
    ev("rsvp_out", "captain", { player_id: "stub1" }),
  ]);
  expect(r.checkedIn).toEqual(["captain"]);
});

it("a non-string payload player_id falls back to the actor", () => {
  const r = rosterFromEvents([ev("check_in", "a", { player_id: 7 })]);
  expect(r.checkedIn).toEqual(["a"]);
});
