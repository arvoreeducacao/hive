import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SRC = fileURLToPath(new URL("../src/app/", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const canopyRoutes = readFileSync(join(HERE, "routes/canopy.mjs"), "utf8");
const seatRoutes = readFileSync(join(HERE, "routes/seats.mjs"), "utf8");
const modules = readdirSync(SRC).filter((one) => one.endsWith(".js"));

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Electron/30.0.0 hive", configurable: true });

const st = await state();
const { cockpitUrlOf, frameUrlOf, paintCanopyOfChat, paintCockpitOfChat } = await app("chat-and-panes");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const tile = (name) => {
  const el = document.createElement("article");
  el.dataset.name = name;
  el.innerHTML = '<button class="t-canopy" hidden><span></span><i></i></button><button class="t-shot" hidden><img alt=""><span></span></button>';
  document.body.append(el);
  return el;
};

test("the frame of a seat is asked through the hive, bucketed so the card only reloads at the daemon's pace", () => {
  assert.equal(frameUrlOf("cockpit-seats", "", 7), "/api/canopy/frame?seat=cockpit-seats&t=7");
  assert.equal(frameUrlOf("a b", "tab 1", 7), "/api/canopy/frame?seat=a%20b&tab=tab%201&t=7");
  const now = Math.floor(Date.now() / 8000);
  assert.match(frameUrlOf("x"), new RegExp(`&t=(${now}|${now + 1})$`));
});

test("the frame proxy adds the bearer on the server and never forwards the seat's words as a path", () => {
  const route = cut(canopyRoutes, 'on(null, "/api/canopy/frame"', "\n  });\n", "routes/canopy.mjs");
  assert.match(route, /isSeatName\(seat\)/);
  assert.match(route, /canopyCall\(`\/tabs\/\$\{encodeURIComponent\(tab\.id\)\}\/frame`\)/);
  assert.doesNotMatch(route, /token/);
  const kill = cut(seatRoutes, 'on("POST", "/api/kill"', "return reply({ ok: true });", "routes/seats.mjs");
  assert.match(kill, /killSeatWindow\(name, where\)/);
  const window = cut(server, "async function killSeatWindow(", "\n}\n", "server.mjs");
  assert.match(window, /endCanopySession\(name\)/, "archiving a seat would leave its cockpit open");
});

test("the fleet payload carries the canopy tabs of each seat, so the card needs no second poll", () => {
  const built = cut(server, "function build(name, where, lines, statusText", "\nlet cache =", "server.mjs");
  assert.match(built, /canopy: canopyOfSeat\(name\)/);
});

test("a seat with tabs shows the chip and the last frame, and a seat with none shows neither", () => {
  const el = tile("cockpit-seats");
  paintCanopyOfChat(el, { name: "cockpit-seats", canopy: { tabs: 2, live: 1, held: 0, title: "hive" } });
  const chip = el.querySelector(".t-canopy");
  const shot = el.querySelector(".t-shot");
  assert.equal(chip.hidden, false);
  assert.equal(chip.classList.contains("live"), true);
  assert.equal(shot.querySelector("span").textContent, "hive");
  assert.equal(shot.querySelector("img").getAttribute("src"), frameUrlOf("cockpit-seats", ""));
  paintCanopyOfChat(el, { name: "cockpit-seats", canopy: { tabs: 0 } });
  assert.equal(chip.hidden, true);
  assert.equal(shot.hidden, true);
  el.remove();
});

test("the frame only reloads when its address changed", () => {
  const el = tile("cockpit-seats");
  const s = { name: "cockpit-seats", canopy: { tabs: 1, live: 0, held: 1, title: "hive" } };
  paintCanopyOfChat(el, s);
  const img = el.querySelector(".t-shot img");
  const first = img.getAttribute("src");
  img.dataset.reloads = "0";
  paintCanopyOfChat(el, s);
  assert.equal(img.getAttribute("src"), first);
  assert.equal(img.dataset.here, first);
  el.remove();
});

test("clicking the chip of a seat opens its cockpit", () => {
  const el = tile("cockpit-seats");
  st.cockChat = null;
  st.open = null;
  paintCanopyOfChat(el, { name: "cockpit-seats", canopy: { tabs: 2, live: 1, held: 0, title: "hive" } });
  el.querySelector(".t-canopy").click();
  assert.equal(st.cockChat, "cockpit-seats");
  st.cockChat = null;
  el.remove();
});

test("the cockpit opens filtered to the seat, whatever the seat is called", () => {
  assert.equal(cockpitUrlOf("http://127.0.0.1:4664", "cockpit-seats"), "http://127.0.0.1:4664/?session=cockpit-seats");
  assert.equal(cockpitUrlOf("https://canopy.example/", "a b&c"), "https://canopy.example/?session=a%20b%26c");
});

test("the canopy base comes from the env, loopback by default", () => {
  const { canopyBaseOf } = new Function(cut(server, "function canopyBaseOf(env) {", "\nasync function canopyStateOf", "server.mjs") + "return { canopyBaseOf };")();
  assert.equal(canopyBaseOf({}), "http://127.0.0.1:4664");
  assert.equal(canopyBaseOf({ CANOPY_PORT: "5000" }), "http://127.0.0.1:5000");
  assert.equal(canopyBaseOf({ CANOPY_URL: "https://canopy.example/" }), "https://canopy.example");
});

test("the canopy routes never carry a token", () => {
  assert.doesNotMatch(canopyRoutes, /token/);
});

test("the canopy probe never hands the token to the page", () => {
  const probe = cut(server, "async function canopyStateOf() {", "\n}\n", "server.mjs");
  assert.match(probe, /return \{ url, up: r\.ok \}/);
  assert.doesNotMatch(probe, /token[^\n]*up:/);
});

test("the panes left on the frame leave the cockpit alone, so the webview survives a repaint", () => {
  for (const one of modules) {
    assert.doesNotMatch(readFileSync(join(SRC, one), "utf8"), /function paintArtOfChat/, `${one}: the artifact pane is gone — the artifact is a tab of the browser`);
  }
  const el = tile("cockpit-seats");
  st.cockChat = "cockpit-seats";
  st.open = "cockpit-seats";
  paintCockpitOfChat(el, { name: "cockpit-seats", canopy: { tabs: 2 } });
  const stage = el.querySelector(".art.cockpit .art-stage");
  const frame = stage.firstElementChild;
  assert.equal(frame.dataset.here, cockpitUrlOf("http://127.0.0.1:4664", "cockpit-seats"));
  paintCockpitOfChat(el, { name: "cockpit-seats", canopy: { tabs: 3 } });
  assert.equal(stage.firstElementChild, frame, "the repaint threw the webview away");
  st.cockChat = null;
  paintCockpitOfChat(el, { name: "cockpit-seats", canopy: { tabs: 3 } });
  assert.equal(el.querySelector(".art.cockpit"), null);
  st.open = null;
  el.remove();
});
