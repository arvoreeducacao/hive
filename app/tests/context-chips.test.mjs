import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, state } from "./dom.mjs";

const st = await state();
const { chipSpans, giveImageChipItsPicture, inkChips, paintSaidChips, wireChips } = await app("context-chips");

const sessions = [
  { name: "uma-coisa-que-tem", title: "Chips de contexto", state: "working", where: "local" },
  { name: "chat-1771", title: "", state: "idle", where: "local" }
];
const devs = [{ dev: "rafa", state: "idle" }];
const PR = "https://github.com/acme/hive/pull/790";

const painted = (text) => {
  const el = document.createElement("div");
  el.textContent = text;
  return paintSaidChips(el, { sessions, devs });
};

test("each thing the words point at is found once, in order, by its kind", () => {
  const said = `vê #chips-de-contexto e ~rafa: ${PR}, @app/src/ e @app/server.mjs com [Image #1]`;
  assert.deepEqual(chipSpans(said, { sessions, devs }).map((one) => [one.kind, said.slice(one.start, one.end)]), [
    ["chat", "#chips-de-contexto"],
    ["person", "~rafa"],
    ["pr", PR],
    ["folder", "@app/src/"],
    ["file", "@app/server.mjs"],
    ["image", "[Image #1]"]
  ]);
});

test("a # or ~ that names nobody, a half-typed handle and an e-mail stay words", () => {
  const said = "o card #1287, #chips-de e ~ninguem, alguem@example.com";
  assert.deepEqual(chipSpans(said, { sessions, devs }), []);
});

test("a chat is found by the name it goes by and by the name the machine gave it", () => {
  assert.equal(chipSpans("#chat-1771", { sessions, devs })[0]?.seat.name, "chat-1771");
  assert.equal(chipSpans("#uma-coisa-que-tem", { sessions, devs })[0]?.seat.name, "uma-coisa-que-tem");
});

test("a folder is a path that ends in a slash or whose last piece has no extension", () => {
  assert.deepEqual(chipSpans("@app/src/ @app/src @app/a.test.mjs", {}).map((one) => one.kind), ["folder", "folder", "file"]);
});

test("in the sent bubble a PR reads as repo#number, colored by the state the hive knows", () => {
  st.prs = [{ key: "acme/hive#790", state: "merged", title: "chips" }];
  const el = document.createElement("div");
  el.innerHTML = `olha <a href="${PR}">${PR}</a>`;
  paintSaidChips(el, { sessions, devs });
  const chip = el.querySelector("a.ctx-chip");
  assert.equal(chip.getAttribute("href"), PR, "the link stays a link, so it still opens inside the hive");
  assert.equal(chip.textContent, "hive#790");
  assert.equal(chip.dataset.state, "merged");
  assert.match(chip.title, /chips/);
  st.prs = [];
});

test("a link someone named in words is left as they wrote it", () => {
  const el = document.createElement("div");
  el.innerHTML = `<a href="${PR}">o PR</a>`;
  paintSaidChips(el, {});
  assert.equal(el.querySelector(".ctx-chip"), null);
});

test("a PR whose state changes after it was sent is repainted with the new one", () => {
  st.prs = [];
  const el = document.createElement("div");
  el.innerHTML = `<a href="${PR}">${PR}</a>`;
  paintSaidChips(el, {});
  assert.equal(el.querySelector(".ctx-chip").dataset.state, "unknown");
  st.prs = [{ key: "acme/hive#790", state: "open" }];
  wireChips(el);
  assert.equal(el.querySelector(".ctx-chip").dataset.state, "open");
  st.prs = [];
});

test("a chat chip shows the chat's name and keeps the seat it stands for", () => {
  const chip = painted("fala com #chips-de-contexto").querySelector(".ctx-chip[data-kind=chat]");
  assert.equal(chip.textContent, "Chips de contexto");
  assert.equal(chip.dataset.seat, "uma-coisa-que-tem");
});

test("a path chip shows the last piece and keeps the whole path for the tooltip", () => {
  const el = painted("lê @app/src/app/context-chips.js e @app/assets/");
  const [file, folder] = el.querySelectorAll(".ctx-chip");
  assert.equal(file.textContent, "context-chips.js");
  assert.equal(file.title, "app/src/app/context-chips.js");
  assert.equal(folder.textContent, "assets/");
  assert.equal(folder.dataset.kind, "folder");
  assert.equal(el.textContent, "lê context-chips.js e assets/");
});

test("an image chip keeps the start and the end of a long file name, and the whole name for the tooltip", () => {
  const name = "queria-fazer-um-ajuste-no-livro-1792761723958-0.png";
  const hold = document.createElement("div");
  hold.innerHTML = giveImageChipItsPicture(painted("[Image #1] olha isso").innerHTML, 1, { src: "data:image/png;base64,", name, path: `/tmp/${name}` });
  const chip = hold.querySelector(".ctx-chip[data-kind=image]");
  assert.equal(chip.textContent, "queria-faze…723958-0.png");
  assert.equal(chip.title, name);
});

test("the box tints the same pieces, with the PR in the color of its state", () => {
  st.data = { sessions };
  st.team = { devs, me: "" };
  st.prs = [{ key: "acme/hive#790", state: "closed" }];
  assert.deepEqual(inkChips(`#chat-1771 ${PR}`).map((one) => one.cls), ["ink-chip ink-chat", "ink-chip ink-pr-closed"]);
  st.prs = [];
});

test("the box only tints: a chip there never takes room the textarea does not see", () => {
  const css = readFileSync(new URL("../assets/context-chips.css", import.meta.url), "utf8");
  const ink = css.match(/\.sv-ink \.ink-chip \{[^}]*\}/)?.[0] || "";
  assert.ok(ink, "the box has its own rule");
  assert.doesNotMatch(ink, /padding|border:|margin|font-size|font-weight/);
});
