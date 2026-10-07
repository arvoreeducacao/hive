import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { teamRailViewModel, railViewModel } = await app("mirror");
const { mountTeamRail } = await import(new URL("../src/views.js", import.meta.url).href);

const dev = (over = {}) => { const one = { dev: "guilherme", up: true, seats: [], ...over }; return { key: `k-${one.dev}`, machine: one.dev, ...one }; };
const seats = (n) => Array.from({ length: n }, (_, i) => ({ name: `s${i}`, state: "needs" }));
const team = (...devs) => { st.team = { me: "rick", sharing: true, poke: true, devs }; };
const onlyGroup = () => { const g = teamRailViewModel().groups; return g.find((one) => one.devs.length) || g[0]; };
const tallyOf = (d) => { team(d); return onlyGroup().devs[0].tally; };

test("a mate's row carries a face, a name and a number — nothing about their work", () => {
  team(dev({ seats: seats(2) }));
  const host = document.getElementById("rail-team");
  const view = mountTeamRail(host);
  view.show(teamRailViewModel());
  const row = host.querySelector(".item.team");
  assert.equal(row.dataset.dev, "guilherme");
  assert.ok(row.querySelector(".team-av svg"), "the row wears a face");
  assert.equal(row.querySelector(".name").textContent, "guilherme");
  assert.equal(row.querySelector(".n").textContent, "2");
  assert.equal(row.getAttribute("data-state"), null);
  for (const leak of ["needs", "calls", "✋", "stalled", "summary", "★"]) {
    assert.ok(!row.outerHTML.includes(leak), `the row must not mention ${leak}`);
  }
  const [one] = onlyGroup().devs;
  assert.deepEqual(Object.keys(one).sort(), ["avatar", "dev", "here", "hint", "key", "mine", "name", "quiet", "tally"]);
  view.dispose();
});

test("the number is how many seats are up, never how many are calling", () => {
  assert.equal(tallyOf(dev({ seats: seats(3) })), "3");
  assert.equal(tallyOf(dev({ seats: seats(3), needs: 3 })), tallyOf(dev({ seats: seats(3) })));
  team(dev({ seats: seats(3) }), dev({ dev: "ana", seats: [] }));
  assert.equal(onlyGroup().count, 1, "the title counts the mates with something running");
});

test("vigil still reads: nothing running, and a pod asleep", () => {
  assert.equal(tallyOf(dev({ seats: [], up: true })), "—");
  assert.equal(tallyOf(dev({ seats: [], up: false })), "zzz");
  team(dev({ seats: [], up: true }));
  assert.equal(onlyGroup().devs[0].quiet, true);
});

test("what changes often is written in place, so a face keeps breathing", () => {
  team(dev({ seats: seats(1) }));
  const host = document.getElementById("rail-team");
  const view = mountTeamRail(host);
  view.show(teamRailViewModel());
  const face = host.querySelector(".team-av");
  team(dev({ seats: seats(4) }));
  view.show(teamRailViewModel());
  assert.equal(host.querySelector(".team-av"), face, "the face node survives a poll");
  assert.equal(host.querySelector(".n").textContent, "4");
  view.dispose();
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [] };
  st.blocks = [];
  st.block = 0;
  st.archOpen = false;
  const rail = JSON.stringify(railViewModel());
  assert.ok(!rail.includes("guilherme"), "the seat rail's model carries no team row");
});

test("the face list is only rebuilt when the roster or a face changes", () => {
  const host = document.getElementById("rail-team");
  const view = mountTeamRail(host, { actions: { go() {}, menu() {} } });
  try {
    team(dev({ seats: seats(1) }));
    view.show(teamRailViewModel());
    const first = host.querySelector('.item.team[data-dev="guilherme"]');
    assert.equal(first.querySelector(".n").textContent, "1");

    team(dev({ seats: seats(5), up: false }));
    view.show(teamRailViewModel());
    assert.equal(host.querySelector('.item.team[data-dev="guilherme"]'), first, "a seat opening or closing must not rebuild the faces");
    assert.equal(first.querySelector(".n").textContent, "5");

    team(dev(), dev({ dev: "ana" }));
    view.show(teamRailViewModel());
    assert.equal(host.querySelector('.item.team[data-dev="guilherme"]'), first, "the mate already on the rail keeps the row that was drawn for them");
    assert.equal(host.querySelectorAll(".item.team").length, 2, "a mate joining the roster gets a row of their own");
    assert.deepEqual(onlyGroup().devs.map((one) => one.key), ["k-guilherme", "k-ana"], "the rows are keyed by the machine, so a face redraws only the row it belongs to");
  } finally {
    view.dispose();
  }
});
