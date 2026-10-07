import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvSaid, svConvSeed } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane() {
  const name = `shots-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };

test("a picture the model named hangs under its words, and the same file twice hangs once", () => {
  const e = pane();
  svConvSaid(e, "print pronto: `/tmp/card.png`, também em file:///tmp/card.png");
  const strip = e.scroll.querySelector(".sv-msg .mshots");
  assert.ok(strip, "no strip under what was said");
  const pictures = [...strip.querySelectorAll("img")];
  assert.equal(pictures.length, 1);
  assert.equal(pictures[0].getAttribute("src"), `/api/image?path=%2Ftmp%2Fcard.png&where=local&name=${e.name}`);
  assert.equal(pictures[0].getAttribute("alt"), "card.png");
  shut(e);
});

test("words without a picture hang no strip", () => {
  const e = pane();
  svConvSaid(e, "nada de imagem aqui, só https://x.dev/a.png da web");
  assert.equal(e.scroll.querySelector(".sv-msg .mshots"), null);
  shut(e);
});

test("a picture that fails to load leaves the strip, and the strip goes with its last picture", () => {
  const e = pane();
  svConvSaid(e, "veja /tmp/gone.png");
  const img = e.scroll.querySelector(".sv-msg .mshots img");
  img.dispatchEvent(new window.Event("error"));
  assert.equal(e.scroll.querySelector(".sv-msg .mshots"), null);
  shut(e);
});

test("each picture under the words offers to be kept on the page, asks for a caption, and says when it is there", async () => {
  const e = pane();
  svConvSaid(e, "veja /tmp/card.png");
  const actions = svConvActions(e);
  const shot = e.conv.blocks[0].shots[0];
  const button = e.scroll.querySelector(".mshot .mk");
  assert.ok(button, "no keep button");
  assert.equal(button.textContent, "keep on the page");
  actions.keepAsk(shot);
  const input = e.scroll.querySelector(".mshot .mk-cap");
  assert.ok(input, "no caption field after asking");
  shot.kept = "hive://shelf/card-do-livro?tab=prints#p1";
  shot.keeping = "";
  e.convView.show({ key: e.name, blocks: e.conv.blocks.map((one) => ({ ...one, shots: one.shots.map((t) => ({ ...t })) })) });
  const done = e.scroll.querySelector(".mshot .mk-done");
  assert.ok(done, "no link once kept");
  assert.equal(done.getAttribute("href"), "hive://shelf/card-do-livro?tab=prints#p1");
  let opened = null;
  window.hiveOpenPage = (asked) => { opened = asked; };
  actions.openKept(shot);
  assert.deepEqual(opened, { slug: "card-do-livro", tab: "prints", version: 0, at: "", from: e.name });
  shut(e);
});
