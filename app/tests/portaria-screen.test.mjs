import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const pod = readFileSync(join(HERE, "src", "app", "pod.js"), "utf8");
const panel = readFileSync(join(HERE, "src", "panels", "portaria.jsx"), "utf8");

const st = await state();
await views();
const { closePortaria, openPortaria, portariaViewModel } = await app("pod");
const { beatOn } = await app("core");
const { mountPortaria } = await import(new URL("../src/views.js", import.meta.url).href);

const body = document.getElementById("pt-body");
let view = null;

function screen(portaria, link = "") {
  st.portaria = portaria;
  st.portariaLink = link;
  st.portariaSaid = "";
  view?.dispose();
  view = mountPortaria(body);
  view.show(portariaViewModel());
  return body;
}

const zoneOf = (which) => body.querySelectorAll(".pt-zone")[which];

const NOW = Date.now();
const phone = (extra = {}) => ({
  fingerprint: "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  name: "iPhone de João", kind: "phone", pairedAt: NOW - 86400000 * 22, lastSeen: NOW - 60000,
  revoked: false, online: false, ...extra
});
const mac = { fingerprint: "SHA256:mac", name: "este mac", kind: "mac", pairedAt: NOW, lastSeen: NOW, revoked: false };
const full = (extra = {}) => ({
  me: { url: "https://pod-joao.hive.hive.example" },
  devices: [phone(), mac], peers: [], invites: [], used: [], pairing: null,
  phone: { enrolled: true, host: "https://pod-joao.hive.hive.example/sync", running: true, following: [], why: "", error: "" },
  ...extra
});

test("a phone row says when it paired, whether it is reading, and offers only to take it out", () => {
  const devices = screen(full()) && zoneOf(0);
  const row = devices.querySelector(".pt-row");
  assert.match(row.textContent, /iPhone de João/);
  assert.match(row.querySelector("small").textContent, /paired/);
  assert.equal(row.querySelector('[data-pt="build"]'), null, "the phone build button outlived the phone app");
  assert.ok(row.querySelector('[data-pt="revoke"]'), "a phone cannot be taken out from the screen");
  assert.equal(devices.querySelector(".pt-foot"), null);
  const reading = screen(full({ devices: [phone({ online: true })] })) && zoneOf(0);
  assert.equal(reading.querySelector(".pt-pill").textContent, "reading");
});

test("when the phones could not be listed the foot says why", () => {
  const devices = screen(full({ devices: [mac], phone: { enrolled: false, host: "", running: false, following: [], why: "", error: "no server to pair the phone with" } })) && zoneOf(0);
  assert.match(devices.querySelector(".pt-foot").textContent, /no server to pair the phone with/);
});

test("the open code is on screen with its countdown, and vanishes when there is none", () => {
  const open = screen(full({ pairing: { code: "KRQ7F2MJ", expiresAt: NOW + 277000 } })) && zoneOf(0);
  assert.equal(open.querySelector(".pt-code .num").textContent, "KRQ7F2MJ");
  assert.match(open.querySelector(".pt-code small").textContent, /4:3\d left/);
  assert.match(open.querySelector(".pt-code small").textContent, /works once · five wrong tries close it/);
  assert.equal(screen(full()).querySelector(".pt-code"), null);
});

test("no device at all shows the empty state, not a lonely heading", () => {
  const devices = screen(full({ devices: [] })) && zoneOf(0);
  assert.match(devices.querySelector(".pt-empty").textContent, /no device of yours is here/);
  assert.equal(devices.querySelector(".pt-rows"), null);
});

test("a person who is in can be taken out by key, and an open invite carries its link twice", () => {
  const people = screen(full({
    peers: [{ fingerprint: "SHA256:vitor", name: "vitor", knownAt: NOW - 3600000, fromFile: false }],
    invites: [{ at: NOW - 259200000, expiresAt: NOW + 345600000, link: "https://pod-joao/join?key=SHA256:x&token=t" }]
  })) && zoneOf(1);
  assert.equal(people.querySelector('[data-pt="forget"]').dataset.key, "SHA256:vitor");
  assert.equal(people.querySelector('[data-pt="copy"]').dataset.link, "https://pod-joao/join?key=SHA256:x&token=t");
  assert.equal(people.querySelector('[data-pt="cancel"]').dataset.link, "https://pod-joao/join?key=SHA256:x&token=t");
  assert.match(people.textContent, /closes in 4 days/);
});

test("the invite that was never used by a person says so — and stops saying it once someone has", () => {
  assert.match(screen(full()).textContent, /nobody has come in this way yet/);
  assert.ok(!screen(full({ used: [{ at: NOW - 1000, usedAt: NOW, by: "vitor" }] })).textContent.includes("nobody has come in this way yet"));
});

test("every button the screen paints lands either in the handler or on a door the server knows", () => {
  screen(full({
    peers: [{ fingerprint: "SHA256:vitor", name: "vitor", knownAt: NOW, fromFile: false }],
    invites: [{ at: NOW, expiresAt: NOW + 345600000, link: "https://pod-joao/join?key=k&token=t" }],
    pairing: { code: "KRQ7F2MJ", expiresAt: NOW + 277000 }
  }));
  const asked = [...new Set([...body.querySelectorAll("[data-pt]")].map((one) => one.dataset.pt))];
  assert.ok(asked.length >= 6, `only ${asked.length} actions found — this test lost its subject`);
  const handler = pod.slice(pod.indexOf('$("pt-body").addEventListener("click"'));
  const lost = asked.filter((one) => !handler.includes(`"${one}"`) && !server.includes(`op === "${one}"`));
  assert.deepEqual(lost, [], `the screen paints these and nothing on either side catches them: ${lost.join(", ")}`);
});

test("every element the screen reaches for exists in the page", () => {
  const wiring = pod.slice(pod.indexOf("const portariaOnScreen ="));
  const wanted = [...new Set([...wiring.matchAll(/\$\("([a-z-]+)"\)/g)].map((hit) => hit[1]))];
  assert.ok(wanted.length >= 4, "no element lookups found — this test lost its subject");
  const fromPanel = [...new Set([...panel.matchAll(/id="([a-z-]+)"/g)].map((hit) => hit[1]))];
  const missing = wanted.filter((id) => !page.includes(`id="${id}"`) && !fromPanel.includes(id));
  assert.deepEqual(missing, [], `the code reaches for these ids and the page has none: ${missing.join(", ")}`);
});

test("the two doors the screen knocks on are open on the server", () => {
  assert.match(server, /registerPortariaRoutes\(on,/);
  assert.doesNotMatch(server, /url\.pathname === "\/api\/portaria/);
  for (const op of ["pair", "unpair", "revoke", "invite", "cancel", "forget"]) {
    assert.ok(server.includes(`op === "${op}"`), `the server does not know how to ${op}`);
  }
});

test("opening the screen starts both clocks and closing it stops them", () => {
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => full() });
  screen(full());
  openPortaria();
  assert.equal(beatOn("portaria"), true);
  assert.equal(beatOn("portaria-tick"), true);
  closePortaria();
  assert.equal(beatOn("portaria"), false);
  assert.equal(beatOn("portaria-tick"), false);
  assert.equal(document.getElementById("portaria").hidden, true);
  globalThis.fetch = was;
});

test("the people count counts people who are in, not invites nobody used", () => {
  const people = screen(full({ invites: [{ at: NOW, expiresAt: NOW + 604800000, link: "https://x/join?key=k&token=t" }] })) && zoneOf(1);
  assert.equal(people.querySelector("h3 em").textContent, "0", "a key that never came in was counted as a person inside");
  assert.ok(people.querySelector(".pt-pill.wait"));
});

test("a key that only the signers file knows says so, instead of posing as someone who came in", () => {
  const people = screen(full({ peers: [{ fingerprint: "SHA256:abcdefghij", name: "peer", knownAt: 0, fromFile: true }] })) && zoneOf(1);
  const row = people.querySelector(".pt-row");
  assert.match(row.querySelector("small").textContent, /allowed by the signers file/);
  assert.ok(!row.textContent.includes("in since"));
  assert.equal(row.querySelector("b").textContent, "abcdefghij", "a nameless key should show its key, not the word peer");
  assert.equal(row.querySelector(".pt-pill").className, "pt-pill wait");
});

test("the people half has a place to paste an invite someone sent, always", () => {
  for (const one of [full(), full({ peers: [{ fingerprint: "SHA256:v", name: "vitor", knownAt: NOW, fromFile: false }] })]) {
    const people = screen(one) && zoneOf(1);
    assert.ok(people.querySelector("#pt-link"), "there is nowhere to paste a link that was sent to me");
    assert.ok(people.querySelector('[data-pt="join"]'));
  }
});

test("an invite that arrived by link waits in the box, and survives the screen repainting", () => {
  const link = "hive://join?at=https%3A%2F%2Fhive-ada.hive.example&key=SHA256%3Ax&token=t1";
  assert.equal(screen(full(), link).querySelector("#pt-link").getAttribute("value"), link);
  assert.equal(screen(full()).querySelector("#pt-link").getAttribute("value"), "");
});

test("an invite link puts the invite in the box and opens the door, without letting anyone in", async () => {
  const was = globalThis.fetch;
  const dialled = [];
  globalThis.fetch = async (url) => { dialled.push(url); return { ok: true, json: async () => full() }; };
  const link = "hive://join?at=https%3A%2F%2Fhive-ada.hive.example&key=SHA256%3Ax&token=t1";
  await app("tour");
  document.getElementById("portaria").hidden = true;
  st.portaria = full();
  window.hiveOpenJoin({ link, at: "https://hive-ada.hive.example" });
  assert.equal(st.portariaLink, link);
  assert.match(st.portariaSaid, /hive-ada\.hive\.example/);
  assert.equal(document.getElementById("portaria").hidden, false, "the door screen never opened");
  assert.deepEqual(dialled, ["/api/portaria"], "clicking a link must never let anyone in on its own — going in stays a click of the person's");
  closePortaria();
  globalThis.fetch = was;
});

test("a link with nothing in it leaves the box alone", async () => {
  await app("tour");
  document.getElementById("portaria").hidden = true;
  st.portariaLink = "";
  st.portariaSaid = "";
  window.hiveOpenJoin({ link: "", at: "" });
  assert.equal(st.portariaLink, "");
  assert.equal(st.portariaSaid, "");
  assert.equal(document.getElementById("portaria").hidden, true);
});
