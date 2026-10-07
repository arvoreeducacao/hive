import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, views } from "./dom.mjs";

await views();

const { attachFilesToDraft, discardDraft, draftFrom, draftInFocus, drafts, newDraft, sendDraft } = await app("draft-seat");
const st = await app("core").then((m) => m.st);
await app("drag-files");

const SHOT = { name: "tela.png", data: "data:image/png;base64,iVBORw0KGgo=" };

function wire(answers) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    asked.push({ url, body });
    const said = answers[url] ?? { ok: true };
    return { ok: true, json: async () => (typeof said === "function" ? said(body) : said) };
  };
  return asked;
}

function bench(answers = {}) {
  const asked = wire({ "/api/catalog?agent=claude": { ok: true, data: { models: [] } }, ...answers });
  const d = newDraft();
  document.body.appendChild(d.e.host);
  return { d, asked, box: d.e.host.querySelector("textarea"), tray: d.e.host.querySelector(".sv-attach") };
}

const shut = (b) => { b.d.e.host.remove(); drafts.delete(b.d.id); };

test("an image dropped on an empty chat becomes a chip and a mark in the first message", async () => {
  const b = bench({ "/api/attach": { ok: true, paths: ["/hub/.hive/assets/mission-tela-1.png"] } });
  b.box.value = "olha essa tela";
  await attachFilesToDraft(b.d, [SHOT]);
  assert.equal(b.tray.querySelectorAll(".att").length, 1, "nothing to see: the person cannot tell the image arrived");
  assert.ok(b.tray.classList.contains("on"));
  assert.match(b.box.value, /\[Image #1\]/);
  const attach = b.asked.find((one) => one.url === "/api/attach");
  assert.deepEqual(attach.body, { files: [SHOT] });
  shut(b);
});

test("the mark stays in the words and the picture opens the seat beside them", async () => {
  const path = "/hub/.hive/assets/mission-tela-1.png";
  const b = bench({ "/api/attach": { ok: true, paths: [path] }, "/api/spawn": { ok: false, error: "stop here" } });
  b.box.value = "o que quebrou aqui";
  await attachFilesToDraft(b.d, [SHOT]);
  await sendDraft(b.d, b.box.value);
  const spawn = b.asked.find((one) => one.url === "/api/spawn");
  assert.ok(spawn, "the draft never asked for a seat");
  assert.equal(spawn.body.prompt, "o que quebrou aqui [Image #1]");
  assert.deepEqual(spawn.body.images, [path]);
  shut(b);
});

test("an image alone, with nothing written, still opens the chat", async () => {
  const path = "/hub/.hive/assets/mission-tela-2.png";
  const b = bench({ "/api/attach": { ok: true, paths: [path] }, "/api/spawn": { ok: false, error: "stop here" } });
  await attachFilesToDraft(b.d, [SHOT]);
  await sendDraft(b.d, b.box.value);
  const spawn = b.asked.find((one) => one.url === "/api/spawn");
  assert.equal(spawn.body.prompt, "[Image #1]");
  assert.deepEqual(spawn.body.images, [path]);
  shut(b);
});

test("a file that is not an image is written into the message as a path", async () => {
  const b = bench({ "/api/attach": { ok: true, paths: ["/hub/.hive/assets/mission-notas.csv"] } });
  await attachFilesToDraft(b.d, [{ name: "notas.csv", data: "data:text/csv;base64,YQ==" }]);
  assert.equal(b.tray.querySelectorAll(".att").length, 0);
  assert.match(b.box.value, /mission-notas\.csv/);
  shut(b);
});

test("an attach that fails says so instead of leaving a chip that means nothing", async () => {
  const b = bench({ "/api/attach": { error: "that is more than this app carries in one go" } });
  await attachFilesToDraft(b.d, [SHOT]);
  assert.equal(b.tray.querySelectorAll(".att").length, 0);
  assert.equal(b.d.error, "that is more than this app carries in one go");
  assert.equal(b.d.e.host.querySelector(".sv-empty-said").textContent, b.d.error);
  shut(b);
});

test("dropping the mark drops the image with it, the way a live chat does", async () => {
  const b = bench({ "/api/attach": { ok: true, paths: ["/hub/.hive/assets/mission-tela-3.png"] } });
  await attachFilesToDraft(b.d, [SHOT]);
  assert.equal(b.d.e.tray.count(), 1);
  b.box.value = "";
  b.box.dispatchEvent(new Event("input"));
  assert.equal(b.d.e.tray.count(), 0, "the chip stayed on screen pointing at a mark the message no longer has");
  assert.equal(b.tray.querySelectorAll(".att").length, 0);
  shut(b);
});

test("a paste finds the draft under the pointer and the draft in focus", () => {
  const b = bench();
  const tile = document.createElement("article");
  tile.className = "tile draft";
  tile.dataset.key = b.d.key;
  tile.appendChild(b.d.e.host);
  document.body.appendChild(tile);
  assert.equal(draftFrom(b.d.e.host.querySelector("textarea")), b.d);
  st.open = b.d.key;
  assert.equal(draftInFocus(), b.d);
  st.open = null;
  tile.remove();
  discardDraft(b.d);
});

test("a file dropped on the tile of an empty chat lands in it, not nowhere", async () => {
  const b = bench({ "/api/attach": { ok: true, paths: ["/hub/.hive/assets/mission-tela-4.png"] } });
  const tile = document.createElement("article");
  tile.className = "tile draft";
  tile.dataset.key = b.d.key;
  tile.appendChild(b.d.e.host);
  document.body.appendChild(tile);
  b.box.value = "essa tela";
  const files = [new dom.File(["a tiny png"], "tela.png", { type: "image/png" })];
  const drop = new Event("drop", { bubbles: true });
  Object.defineProperty(drop, "dataTransfer", { value: { files, items: [], types: ["Files"] } });
  b.d.e.host.querySelector("textarea").dispatchEvent(drop);
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(b.asked.some((one) => one.url === "/api/attach"), "the drop went nowhere — the chat was not a seat yet");
  assert.equal(b.tray.querySelectorAll(".att").length, 1);
  assert.match(b.box.value, /essa tela \[Image #1\]/);
  tile.remove();
  discardDraft(b.d);
});

test("an image pasted into an empty chat lands in it instead of nowhere", async () => {
  const b = bench({ "/api/attach": { ok: true, paths: ["/hub/.hive/assets/mission-tela-5.png"] } });
  const tile = document.createElement("article");
  tile.className = "tile draft";
  tile.dataset.key = b.d.key;
  tile.appendChild(b.d.e.host);
  document.body.appendChild(tile);
  st.missionMode = false;
  b.box.value = "e essa aqui";
  const file = new dom.File(["a tiny png"], "tela.png", { type: "image/png" });
  const paste = new Event("paste", { bubbles: true });
  Object.defineProperty(paste, "clipboardData", { value: { items: [{ type: "image/png", getAsFile: () => file }] } });
  b.box.dispatchEvent(paste);
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(b.asked.some((one) => one.url === "/api/attach"), "the paste went to no chat at all");
  assert.equal(b.tray.querySelectorAll(".att").length, 1);
  assert.match(b.box.value, /e essa aqui \[Image #1\]/);
  tile.remove();
  discardDraft(b.d);
});
