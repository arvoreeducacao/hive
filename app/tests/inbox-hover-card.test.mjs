import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

let hive = null;
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (url) => {
  if (String(url).includes("/api/hive") && hive) return Promise.resolve(answered(JSON.parse(JSON.stringify(hive.data))));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
hive = st;
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { setStructure } = await app("structure");

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const SEATS = {
  login: { state: "needs", title: "login redirect", model: "claude-opus-5-5", trees: [{ repo: "acme-web", branch: "demo/login-redirect", path: "/tmp/wt/login" }], finish: { seq: 1, at: ago(2), text: "Login now sends people back to the page they came from. Open the PR?" } },
  docs: { state: "idle", title: "readme setup", where: "cloud", model: "claude-sonnet-5-5", finish: { seq: 2, at: ago(60), text: "The README now covers install and env vars." } }
};

function lay() {
  const names = Object.keys(SEATS);
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => ({ name, where: "local", kind: "chat", structured: true, ...SEATS[name] })), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: names }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.prs = [{ session: "login", repo: "acme/acme-web", number: 41, title: "send people back after login", url: "https://github.com/acme/acme-web/pull/41", key: "pr41" }];
  st.team = { me: "juno", devs: [{ dev: "juno", key: "k-me", seats: [] }] };
  render();
}

const root = () => $("structure-root");
const rowEl = (key) => root().querySelector(`.tx-row[data-key="${key}"]`);
const card = () => root().querySelector(".tx-hovercard");
const over = (el) => el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));

lay();
setStructure("inbox", { quiet: true });

test("resting on a row opens the card after a beat, with the chat's project, machine, branch, model, last words and pull request", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  over(rowEl("login"));
  assert.equal(card(), null, "a pointer passing over a row does not flash a card");
  t.mock.timers.tick(500);
  const shown = card();
  assert.ok(shown, "the card is up after the delay");
  assert.equal(shown.getAttribute("role"), "tooltip");
  assert.equal(shown.querySelector(".tx-hc-title").textContent, "login redirect");
  const lines = [...shown.querySelectorAll(".tx-hc-lines .tx-hc-line")].map((el) => el.textContent);
  assert.deepEqual(lines, ["acme-web", "this machine", "demo/login-redirect", "Opus 5.5"]);
  assert.match(shown.querySelector(".tx-hc-last").textContent, /Open the PR\?/);
  assert.match(shown.querySelector(".tx-hc-prs").textContent, /#41 send people back after login/);
  root().dispatchEvent(new MouseEvent("pointerleave"));
  assert.equal(card(), null, "leaving the inbox takes the card away");
  t.mock.timers.reset();
});

test("with a card up, moving to the next row swaps it at once, and a row with no repo or branch leaves those lines out", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  over(rowEl("login"));
  t.mock.timers.tick(500);
  over(rowEl("docs"));
  const shown = card();
  assert.equal(shown.querySelector(".tx-hc-title").textContent, "readme setup");
  const lines = [...shown.querySelectorAll(".tx-hc-lines .tx-hc-line")].map((el) => el.textContent);
  assert.deepEqual(lines, ["cloud", "Sonnet 5.5"]);
  assert.equal(shown.querySelector(".tx-hc-prs"), null);
  rowEl("docs").click();
  assert.equal(card(), null, "a click on the row takes the card away");
  t.mock.timers.reset();
});

test("the pointer leaving the rows before the delay never opens a card", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  over(rowEl("login"));
  over(root());
  t.mock.timers.tick(1000);
  assert.equal(card(), null);
  t.mock.timers.reset();
});

test("the row carries no native tooltip on top of the card", () => {
  assert.equal(rowEl("login").hasAttribute("title"), false);
});
