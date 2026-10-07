import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { boxText, blockText } = await app("terminal-history");

const box = (html, className = "md-code") => {
  const pre = document.createElement("pre");
  pre.className = className;
  pre.innerHTML = html;
  return pre;
};

test("the box hands over what is inside it, line breaks included", () => {
  assert.equal(boxText(box("uma linha\noutra linha")), "uma linha\noutra linha");
});

test("a diff box comes back as lines, without the space that only held the height", () => {
  const diff = box("<div>-velho</div><div>​</div><div>+novo</div>", "md-code md-diff");
  assert.equal(boxText(diff), "-velho\n\n+novo");
});

test("copying the whole message leaves the button of every box out of the text", () => {
  const block = document.createElement("div");
  block.innerHTML = '<div>o que o assento disse</div><button class="md-copy">copiar</button><button class="sv-stamp">carimbo</button>';
  const buttons = [...block.querySelectorAll(".md-copy"), ...block.querySelectorAll(".sv-stamp")];
  document.body.append(block);
  const said = blockText(block);
  block.remove();
  assert.doesNotMatch(said, /copiar|carimbo/);
  assert.match(said, /o que o assento disse/);
  assert.deepEqual(buttons.map((one) => one.style.display), ["", ""], "the buttons come back after the reading");
});
