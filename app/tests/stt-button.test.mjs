import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, dom, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

const st = await state();
await views();
const { $ } = await app("core");
const { composerInFocus, pullDictation, putWords, talkSaid, wireTalkButton } = await app("stt");

const answer = (said) => {
  globalThis.fetch = async () => ({ ok: true, json: async () => said, text: async () => JSON.stringify(said) });
};

const fresh = () => {
  const button = dom.document.createElement("button");
  button.className = "sv-talk";
  button.hidden = true;
  dom.document.body.append(button);
  return button;
};

test("the composers carry a microphone button, and the sprite has the microphone", () => {
  const page = readFileSync(join(HERE, "app.html"), "utf8");
  assert.match(page, /<symbol id="i-mic"/);
  assert.ok($("cmp-talk"), "the mission composer needs its own microphone");
  for (const file of ["src/app/chat-stretches.js", "src/app/draft-seat.js"]) {
    const source = readFileSync(join(HERE, file), "utf8");
    assert.match(source, /class="sv-talk"/, `${file} has no microphone button`);
    assert.match(source, /wireTalkButton\(/, `${file} never wires its microphone`);
  }
});

test("the button hides itself until dictation is switched on", async () => {
  const button = fresh();
  wireTalkButton(button, () => null);
  assert.equal(button.hidden, true);
  answer({ enabled: false, engine: "none", model: { state: "none" } });
  await pullDictation();
  assert.equal(button.hidden, true);
  answer({ enabled: true, engine: "ready", model: { state: "ready" } });
  await pullDictation();
  assert.equal(button.hidden, false);
});

test("a machine without the model shows the button worn out, not gone", async () => {
  const button = fresh();
  wireTalkButton(button, () => null);
  answer({ enabled: true, engine: "ready", model: { state: "none" } });
  await pullDictation();
  assert.equal(button.hidden, false);
  assert.equal(button.classList.contains("dead"), true);
  answer({ enabled: true, engine: "ready", model: { state: "handy" } });
  await pullDictation();
  assert.equal(button.classList.contains("dead"), false);
});

test("what the button says changes with what dictation is doing", () => {
  assert.match(talkSaid({ enabled: true, ready: true, state: "idle" }), /click and talk/);
  assert.match(talkSaid({ enabled: true, ready: true, state: "hearing" }), /click to stop/);
  assert.match(talkSaid({ enabled: true, ready: true, state: "writing" }), /words/);
  assert.match(talkSaid({ enabled: true, ready: false, state: "idle" }), /not set up on this machine/, "the model may well be here — what is missing is the setting up");
  assert.equal(talkSaid({ unsupported: "no build for this machine" }), "no build for this machine");
  assert.match(talkSaid({ enabled: true, ready: true, state: "hearing" }, false), /another composer/);
});

test("only the composer that started dictation lights up", async () => {
  const mine = fresh();
  const other = fresh();
  wireTalkButton(mine, () => null);
  wireTalkButton(other, () => null);
  answer({ enabled: true, engine: "ready", model: { state: "ready" } });
  await pullDictation();

  let stop = () => {};
  dom.navigator.mediaDevices = { getUserMedia: async () => new Promise((done) => { stop = () => done({ getTracks: () => [] }); }) };
  mine.click();
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(mine.classList.contains("hot"), true);
  assert.equal(other.classList.contains("hot"), false);
  assert.equal(other.disabled, true, "the other button cannot steal the microphone mid-sentence");
  assert.match(other.title, /another composer/);
  stop();
});

test("one click starts, and the click that follows is the one that stops", async () => {
  const button = fresh();
  wireTalkButton(button, () => null);
  answer({ enabled: true, engine: "ready", model: { state: "ready" } });
  await pullDictation();

  const heard = [];
  dom.navigator.mediaDevices = { getUserMedia: async () => { heard.push("open"); throw Object.assign(new Error("no mic here"), { name: "NotFoundError" }); } };
  button.click();
  await new Promise((done) => setTimeout(done, 10));
  assert.deepEqual(heard, ["open"], "the first click reaches for the microphone");

  button.click();
  await new Promise((done) => setTimeout(done, 10));
  assert.deepEqual(heard, ["open", "open"], "and with nothing listening, the next click tries again");
});

test("the words land at the cursor of the box the microphone belongs to", () => {
  const box = dom.document.createElement("textarea");
  dom.document.body.append(box);
  let heard = 0;
  box.addEventListener("input", () => { heard += 1; });
  box.value = "comeco fim";
  box.selectionStart = 6;
  box.selectionEnd = 6;
  assert.equal(putWords("no meio", box), true);
  assert.equal(box.value, "comeco no meio fim");
  assert.equal(box.selectionStart, 14, "the cursor sits right after what was said");
  assert.equal(heard, 1, "the box has to hear input, or it never grows and the send button stays grey");
  assert.equal(putWords("   ", box), false, "silence changes nothing");
  assert.equal(box.value, "comeco no meio fim");
});

test("with no seat in focus the words go to the mission composer", () => {
  st.open = null;
  st.focus = -1;
  assert.equal(composerInFocus(), $("cmp-in"));
});

test("a click while dictation is off says so instead of opening the microphone", async () => {
  const button = fresh();
  wireTalkButton(button, () => null);
  answer({ enabled: false, engine: "none", model: { state: "none" } });
  await pullDictation();
  let reached = false;
  dom.navigator.mediaDevices = { getUserMedia: async () => { reached = true; return {}; } };
  button.click();
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(reached, false);
  assert.equal(st.stt.said, "dictation is off");
});

const inComposer = () => {
  const composer = dom.document.createElement("form");
  composer.className = "sv-composer";
  const button = dom.document.createElement("button");
  button.className = "sv-talk";
  button.hidden = true;
  composer.append(button);
  dom.document.body.append(composer);
  return { composer, button };
};

const listenUntilStopped = async (button) => {
  let stop = () => {};
  dom.navigator.mediaDevices = { getUserMedia: async () => new Promise((done) => { stop = () => done({ getTracks: () => [] }); }) };
  button.click();
  await new Promise((done) => setTimeout(done, 10));
  return stop;
};

test("in the new Hive a folded chat opens while it listens, as it does with words in it", async () => {
  dom.document.body.classList.add("experience-next");
  try {
    const { composer, button } = inComposer();
    const other = inComposer();
    wireTalkButton(button, () => null);
    wireTalkButton(other.button, () => null);
    answer({ enabled: true, engine: "ready", model: { state: "ready" } });
    await pullDictation();
    const stop = await listenUntilStopped(button);
    assert.equal(composer.classList.contains("talking"), true);
    assert.equal(other.composer.classList.contains("talking"), false, "only the composer that is listening opens");
    stop();
  } finally {
    dom.document.body.classList.remove("experience-next");
  }
});

test("in the current Hive the composer never takes the talking mark", async () => {
  const { composer, button } = inComposer();
  wireTalkButton(button, () => null);
  answer({ enabled: true, engine: "ready", model: { state: "ready" } });
  await pullDictation();
  const stop = await listenUntilStopped(button);
  assert.equal(button.classList.contains("hot"), true);
  assert.equal(composer.classList.contains("talking"), false);
  stop();
});

test("a folded chat hides the microphone like the send button and stays open while dictation runs", () => {
  const css = readFileSync(join(HERE, "assets", "experience.css"), "utf8");
  const page = readFileSync(join(HERE, "app.html"), "utf8");
  assert.match(css, /body\.experience-next:not\(\.no-motion\) \.tile:not\(\.focused\):not\(\.open\) \.sv-composer:not\(\.ready\):not\(\.talking\) \.sv-btns \.sv-talk \{[^}]*visibility: hidden;/);
  assert.match(css, /body\.experience-next:not\(\.no-motion\) \.tile:not\(\.focused\):not\(\.open\) \.sv-composer:not\(\.ready\):not\(\.talking\) \.sv-btns \{ gap: 0; \}/, "the hidden buttons leave no gap, so the context gauge keeps the corner");
  assert.doesNotMatch(page, /\.sv-composer:not\(\.ready\)(?!:not\(\.talking\))/, "every folded rule lets a listening composer stay open");
});

test("a new take keeps its button lit when the last one finishes settling behind it", async () => {
  const button = fresh();
  wireTalkButton(button, () => null);
  answer({ enabled: true, engine: "ready", model: { state: "ready" } });
  await pullDictation();
  dom.navigator.mediaDevices = { getUserMedia: async () => { throw Object.assign(new Error("no mic here"), { name: "NotFoundError" }); } };
  button.click();
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(button.classList.contains("hot"), false);

  const stop = await listenUntilStopped(button);
  assert.equal(button.classList.contains("hot"), true);
  await new Promise((done) => setTimeout(done, 2100));
  assert.equal(button.classList.contains("hot"), true, "the last take's goodbye must not put out a microphone that is still open");
  assert.equal(st.stt.state, "hearing");
  stop();
});
