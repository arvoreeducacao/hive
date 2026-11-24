import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { getStructured } = await app("chat-stretches");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

let seq = 0;

function seat() {
  const e = getStructured({ name: `undo-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  return { e, box: e.host.querySelector(".sv-composer textarea") };
}

function recordEdits() {
  const calls = [];
  document.execCommand = (command, _ui, text) => {
    const box = document.activeElement;
    calls.push([command, text ?? ""]);
    box.setRangeText(command === "insertText" ? text : "", box.selectionStart, box.selectionEnd, "end");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  return { calls, stop: () => { delete document.execCommand; } };
}

function undoTo(box, text) {
  box.value = text;
  box.setSelectionRange(text.length, text.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

function paste(box, words) {
  const data = new DataTransfer();
  data.setData("text/plain", words);
  const ev = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
  box.dispatchEvent(ev);
  return ev;
}

test("a paste as plain text goes in as one edit the box can undo", () => {
  const { e, box } = seat();
  const edits = recordEdits();
  try {
    box.focus();
    box.value = "see ";
    box.setSelectionRange(4, 4);
    e.plainPaste = true;
    const ev = paste(box, "pasted text");
    assert.ok(ev.defaultPrevented);
    assert.deepEqual(edits.calls, [["insertText", "pasted text"]]);
    assert.equal(box.value, "see pasted text");
  } finally { edits.stop(); }
  e.host.remove();
});

test("an attached image goes in as one edit, and removing it is one edit that undo takes back whole", () => {
  const { e, box } = seat();
  const edits = recordEdits();
  try {
    box.focus();
    box.value = "look";
    box.setSelectionRange(4, 4);
    e.tray.add("/tmp/shot.png");
    assert.deepEqual(edits.calls, [["insertText", " [Image #1] "]]);
    assert.equal(e.tray.count(), 1);
    const before = box.value;
    e.host.querySelector(".sv-attach .att .ax").click();
    assert.deepEqual(edits.calls.at(-1), ["delete", ""]);
    assert.equal(box.value, "look ");
    assert.equal(e.tray.count(), 0);
    assert.equal(e.host.querySelector(".sv-attach .att"), null);
    undoTo(box, before);
    assert.equal(e.tray.count(), 1, "the image comes back with its mark");
    assert.equal(e.tray.marks.get(1), "/tmp/shot.png");
    assert.equal(e.host.querySelector(".sv-attach .att").dataset.path, "/tmp/shot.png");
  } finally { edits.stop(); }
  e.host.remove();
});

test("an image mark deleted by typing comes back with its image on undo", () => {
  const { e, box } = seat();
  box.focus();
  e.tray.add("/tmp/a.png");
  const before = box.value;
  undoTo(box, "");
  assert.equal(e.tray.count(), 0);
  undoTo(box, before);
  assert.equal(e.tray.count(), 1);
  e.tray.clear();
  undoTo(box, before);
  assert.equal(e.tray.count(), 0, "a box that was sent forgets the images it held");
  e.host.remove();
});
