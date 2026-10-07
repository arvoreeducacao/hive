import { test } from "node:test";
import assert from "node:assert/strict";

import { BENCH, HERE, benchOf, fleetOf, seatsOfPanel, seatOfSession } from "../fleet.mjs";

const rowOf = (seats, extra = {}) => ({
  fingerprint: "SHA256:mac-do-joao",
  at: 1000,
  panel: { v: 1, dev: "joao", at: 1000, seats, ...(extra.panel || {}) },
  ...extra
});

test("a seat on the pod is the one here, as far as the phone is concerned", () => {
  const seat = seatOfSession({ name: "revisar-prompt", title: "", state: "working", model: "opus", errand: "" });
  assert.equal(seat.where, HERE);
  assert.equal(seat.title, "revisar-prompt", "with no title, the name serves as one");
});

test("a seat of the machine at home is the Mac's, and says which machine it came from", () => {
  const seats = seatsOfPanel(rowOf([
    { name: "no-mac", where: "local", state: "working" },
    { name: "espelho-do-pod", where: "cloud", state: "idle" }
  ]), 1000);
  assert.deepEqual(seats.map((one) => one.name), ["no-mac"]);
  assert.equal(seats[0].where, BENCH, "the phone calls the machine at home mac, not local");
  assert.equal(seats[0].key, "SHA256:mac-do-joao", "without the key the phone does not know who to talk to");
  assert.equal(seats[0].asleep, false);
});

test("the fleet joins both machines, each under the name the phone uses", () => {
  const fleet = fleetOf({
    sessions: [{ name: "no-pod", state: "working" }],
    rows: [rowOf([{ name: "no-mac", where: "local", state: "idle" }])],
    pod: "joao",
    at: 1000
  });
  assert.deepEqual(fleet.sessions.map((one) => [one.name, one.where]), [["no-mac", BENCH], ["no-pod", HERE]]);
  assert.deepEqual(fleet.pod, { name: "joao", up: true });
});

test("a seat the pod and the panel both count shows up once", () => {
  const fleet = fleetOf({
    sessions: [{ name: "mesmo", state: "working" }],
    rows: [rowOf([{ name: "mesmo", where: "local", state: "idle" }])],
    at: 1000
  });
  assert.equal(fleet.sessions.length, 1, "the same seat went into the phone list twice");
  assert.equal(fleet.sessions[0].where, BENCH, "what runs on the machine at home rules what it says about itself");
});

test("a fleet with no panel at all still hands over the pod's seats", () => {
  const fleet = fleetOf({ sessions: [{ name: "sozinho", state: "idle" }], rows: [], at: 1000 });
  assert.equal(fleet.sessions.length, 1);
  assert.equal(fleet.bench, undefined, "with no machine at home there is no face to show");
});

test("the machine at home asleep stays on the list, saying it is asleep", () => {
  const rows = [rowOf([{ name: "no-mac", where: "local" }], { at: 0, panel: { avatar: "cloud/surprised/pink", wear: "hat:cap", seats: [{ name: "no-mac", where: "local" }] } })];
  const seats = seatsOfPanel(rows[0], 600000);
  assert.equal(seats[0].asleep, true, "the seat vanished instead of showing up asleep");

  const bench = benchOf(rows, 600000);
  assert.equal(bench.asleep, true);
  assert.equal(bench.avatar, "cloud/surprised/pink");
  assert.equal(bench.wear, "hat:cap", "the bench wears what the panel says");
  assert.equal(bench.key, "SHA256:mac-do-joao");
});
