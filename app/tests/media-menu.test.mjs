import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { mediaItems, mediaReference } = await app("media-menu");

const img = (src, attrs = {}) => {
  const el = document.createElement("img");
  el.setAttribute("src", src);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

test("a picture the hive serves is known by its path, relative to the chat's folder when inside it", () => {
  const sessions = [{ name: "seat", cwd: "/Users/me/app" }];
  const ref = mediaReference(img("/api/image?path=%2FUsers%2Fme%2Fapp%2Fdocs%2Ftela.png&where=local&name=seat"), { origin: "http://localhost", sessions });
  assert.equal(ref.path, "/Users/me/app/docs/tela.png");
  assert.equal(ref.relative, "docs/tela.png");
  assert.equal(ref.name, "tela.png");
  assert.deepEqual(mediaItems(ref, { canCopyImage: true }).map((one) => one.act), ["copy-path", "copy-relative", "save", "copy-image"]);
});

test("a picture from the web is known by its url, a video has no copy image", () => {
  const ref = mediaReference(img("https://cdn.example.com/a/b%20c.png"), { origin: "http://localhost", sessions: [] });
  assert.equal(ref.url, "https://cdn.example.com/a/b%20c.png");
  assert.equal(ref.name, "b c.png");
  const video = document.createElement("video");
  video.setAttribute("src", "/api/attachment?path=%2Ftmp%2Fclip.mp4&name=x");
  assert.deepEqual(mediaItems(mediaReference(video, { origin: "http://localhost", sessions: [] }), { canCopyImage: true }).map((one) => one.act), ["copy-path", "save"]);
});

test("copy image is offered but off where the clipboard cannot take pictures", () => {
  const items = mediaItems(mediaReference(img("data:image/png;base64,AA=="), { origin: "http://localhost", sessions: [] }), { canCopyImage: false });
  assert.equal(items.find((one) => one.act === "copy-image").disabled, true);
});

test("right-click on a picture in the chat opens the media menu, and copy full path copies it", async () => {
  const scroll = document.createElement("div");
  scroll.className = "sv-scroll";
  const picture = img("/api/image?path=%2Ftmp%2Fshot.png&where=local&name=nobody");
  scroll.appendChild(picture);
  document.body.appendChild(scroll);
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => copied.push(text) }, configurable: true });
  const ev = new dom.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
  picture.dispatchEvent(ev);
  assert.ok(ev.defaultPrevented, "the native menu would open on top of ours");
  const menu = document.querySelector(".cp-media-menu");
  assert.ok(menu);
  const labels = [...menu.querySelectorAll("button")].map((one) => one.textContent);
  assert.deepEqual(labels.slice(0, 2), ["Copy full path", "Save image"]);
  menu.querySelector('[data-act="copy-path"]').click();
  await new Promise((go) => setTimeout(go, 0));
  assert.deepEqual(copied, ["/tmp/shot.png"]);
  assert.equal(document.querySelector(".cp-media-menu"), null);
  scroll.remove();
  st.data = st.data || {};
});

test("a thumbnail in the composer keeps the plain menu", () => {
  const box = document.createElement("div");
  box.className = "sv-scroll";
  const attach = document.createElement("div");
  attach.className = "sv-attach";
  const picture = img("/api/image?path=%2Ftmp%2Fa.png");
  attach.appendChild(picture);
  box.appendChild(attach);
  document.body.appendChild(box);
  const ev = new dom.MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  picture.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
  box.remove();
});
