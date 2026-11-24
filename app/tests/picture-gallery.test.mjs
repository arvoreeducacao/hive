import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { arrowShot, closeShot, openDiagram, openShot, openShotFrom, picturesAround, shotOnScreen, stepShot } = await app("picture-preview");
const img = document.getElementById("shot-img");
const floor = document.getElementById("shot-floor");
const asked = [];
const blobs = new Map();
let made = 0;
globalThis.fetch = async (url) => {
  asked.push(new URL(url, "http://localhost").searchParams.get("path"));
  return { ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) };
};
URL.createObjectURL = (blob) => {
  const url = `blob:test-${++made}`;
  blobs.set(url, blob);
  return url;
};
URL.revokeObjectURL = () => {};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  closeShot();
  asked.length = 0;
  document.body.querySelectorAll(".test-host").forEach((one) => one.remove());
});

function host(html) {
  const el = document.createElement("div");
  el.className = "test-host";
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

test("the pictures of a message come in the order they show, once each, and never from the next message", () => {
  const root = host(`
    <div class="sv-msg md" id="answer">
      <p><a href="#" class="md-shot" data-path="/s/a.png">a</a> and <a href="#" class="md-file" data-path="src/x.js">x</a></p>
      <p><span class="ctx-chip" data-kind="image" data-path="/s/b.png"><img src="/api/image?path=%2Fs%2Fb.png"></span></p>
      <div class="mshots"><span class="mshot"><img data-path="/s/a.png"></span><span class="mshot"><img data-path="/s/c.png"></span></div>
    </div>
    <div class="sv-user"><span class="uatt" data-path="/s/d.png"><img></span></div>`);
  const first = root.querySelector("#answer .mshot img");
  assert.deepEqual(picturesAround(first), ["/s/a.png", "/s/b.png", "/s/c.png"]);
  assert.deepEqual(picturesAround(root.querySelector(".uatt")), ["/s/d.png"]);
  assert.deepEqual(picturesAround(document.createElement("img")), []);
});

test("a message with several pictures walks between them with the arrows and says where it is", async () => {
  await openShot("/s/b.png", "local", "seat", ["/s/a.png", "/s/b.png", "/s/c.png"]);
  const prev = document.getElementById("shot-prev");
  const next = document.getElementById("shot-next");
  assert.equal(prev.hidden, false);
  assert.equal(next.hidden, false);
  assert.equal(document.getElementById("shot-at").textContent, "(2/3)");
  assert.equal(document.getElementById("shot-name").textContent, "/s/b.png");
  next.click();
  await settle();
  assert.equal(document.getElementById("shot-at").textContent, "(3/3)");
  assert.equal(asked.at(-1), "/s/c.png");
  assert.equal(stepShot(1), true);
  await settle();
  assert.equal(document.getElementById("shot-at").textContent, "(1/3)", "the walk wraps around at the end");
  assert.equal(asked.at(-1), "/s/a.png");
  assert.equal(arrowShot("ArrowLeft"), true);
  await settle();
  assert.equal(document.getElementById("shot-at").textContent, "(3/3)", "and at the start");
  assert.equal(document.getElementById("shot-name").textContent, "/s/c.png");
});

test("a lone picture has no arrows and no count, and the arrow keys stay free", async () => {
  await openShot("/s/a.png", "local", "seat", ["/s/a.png"]);
  assert.equal(document.getElementById("shot-prev").hidden, true);
  assert.equal(document.getElementById("shot-next").hidden, true);
  assert.equal(document.getElementById("shot-at").textContent, "");
  assert.equal(arrowShot("ArrowRight"), false);
  await openShot("/s/z.png", "local", "seat");
  assert.equal(document.getElementById("shot-next").hidden, true);
});

test("opening from a picture in the chat brings the rest of its message along", async () => {
  const root = host(`<div class="sv-tool"><div class="tshots"><img data-path="/s/1.png"><img data-path="/s/2.png"></div></div>`);
  await openShotFrom(root.querySelectorAll("img")[1], "/s/2.png", "local", "seat");
  assert.equal(document.getElementById("shot-at").textContent, "(2/2)");
});

test("closing forgets the walk", async () => {
  await openShot("/s/a.png", "local", "seat", ["/s/a.png", "/s/b.png"]);
  closeShot();
  assert.equal(document.getElementById("shot-prev").hidden, true);
  assert.equal(document.getElementById("shot-at").textContent, "");
  assert.equal(stepShot(1), false);
});

test("a zoomed picture that scrolls sideways pans with the arrows instead of walking away", async () => {
  await openShot("/s/a.png", "local", "seat", ["/s/a.png", "/s/b.png"]);
  const moved = [];
  Object.defineProperties(floor, { scrollWidth: { value: 3000, configurable: true }, clientWidth: { value: 1000, configurable: true } });
  floor.scrollBy = (how) => moved.push(how.left);
  assert.equal(arrowShot("ArrowRight"), true);
  assert.deepEqual(moved, [200]);
  assert.equal(document.getElementById("shot-at").textContent, "(1/2)");
  delete floor.scrollWidth;
  delete floor.clientWidth;
  Object.defineProperties(floor, { scrollWidth: { value: 0, configurable: true }, clientWidth: { value: 0, configurable: true } });
});

function diagram() {
  const root = host(`<div class="md"><div class="md-codebox" data-view="diagram"><div class="md-mermaid" tabindex="0" role="button"><svg viewBox="10 20 400 200" width="100%" style="max-width: 400px;"><g><text>Slack</text></g></svg></div></div></div>`);
  return root.querySelector(".md-mermaid");
}

test("a click on a diagram opens it big as a picture with a size of its own", async () => {
  const stage = diagram();
  stage.querySelector("text").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(shotOnScreen(), true);
  assert.equal(document.getElementById("shot-name").textContent, "Mermaid diagram");
  assert.equal(document.getElementById("shot-prev").hidden, true);
  const url = img.getAttribute("src");
  const markup = await blobs.get(url).text();
  assert.equal(blobs.get(url).type, "image/svg+xml");
  assert.match(markup, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(markup, /width="432"/);
  assert.match(markup, /height="232"/);
  assert.match(markup, /viewBox="-6 4 432 232"/);
  assert.doesNotMatch(markup, /max-width: 400px/);
  assert.ok(stage.querySelector("svg").getAttribute("width") === "100%", "the diagram in the chat is left as it was");
});

test("enter on a focused diagram opens it too", () => {
  const stage = diagram();
  stage.focus();
  const key = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  stage.dispatchEvent(key);
  assert.equal(shotOnScreen(), true);
  assert.equal(key.defaultPrevented, true);
});

test("a diagram that has not drawn yet opens nothing", () => {
  const root = host(`<div class="md-codebox" data-view="diagram"><div class="md-mermaid"></div></div>`);
  assert.equal(openDiagram(root.querySelector(".md-mermaid")), false);
  assert.equal(shotOnScreen(), false);
});
