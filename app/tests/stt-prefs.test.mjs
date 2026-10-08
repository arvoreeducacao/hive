import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const { $ } = await app("core");
const { STT_LANGUAGES, bootSttPrefs, downloadPart, downloadSaid, languageChoices, modelOptionSaid, paintStt, sizeSaid, sttActionSaid, sttStateSaid } = await app("stt-prefs");

const MODEL = { state: "none", name: "whisper medium", quant: "q8_0", bytes: 831538144 };

const sound = (more = {}) => ({ enabled: true, ready: false, unsupported: null, state: "idle", said: "", seconds: 0, trouble: "", download: null, backend: null, language: "", model: MODEL, ...more });

const calls = [];
globalThis.fetch = async (path, opts) => {
  calls.push({ path, body: opts?.body ? JSON.parse(opts.body) : null });
  return { ok: true, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
};

bootSttPrefs();

test("dictation has a section of its own in preferences", () => {
  assert.match(page, /<h2 data-t>Dictation<\/h2>/);
  assert.ok($("t-stt"), "there is no switch");
  assert.ok($("stt-get") && $("stt-stop") && $("stt-drop"), "bring down, stop and delete must all exist");
  assert.ok($("f-stt-lang"), "there is no language picker");
  assert.ok(page.indexOf("<h2 data-t>Dictation</h2>") < page.indexOf("<h2 data-t>Your character</h2>"), "dictation comes before your character");
});

test("sizes are said in the unit a person reads", () => {
  assert.equal(sizeSaid(831538144), "793 MB");
  assert.equal(sizeSaid(3 * (1 << 30)), "3.0 GB");
  assert.equal(sizeSaid(0), "");
});

test("a download says which piece it is on and how far it got", () => {
  assert.match(downloadSaid({ what: "engine", downloaded: 0, total: 0 }), /engine/);
  assert.match(downloadSaid({ what: "model", downloaded: 415769072, total: 831538144 }), /50%/);
  assert.equal(downloadPart({ downloaded: 415769072, total: 831538144 }), 0.5);
  assert.equal(downloadPart(null), 0);
  assert.equal(downloadPart({ downloaded: 9, total: 4 }), 1, "a total that lies never overflows the bar");
});

test("the line under the switch says what this machine actually has", () => {
  assert.match(sttStateSaid(sound()).text, /the model is not on this machine yet/);
  assert.equal(sttStateSaid(sound()).worry, false);
  assert.match(sttStateSaid(sound({ model: { ...MODEL, state: "handy" } })).text, /still needs setting up/, "with the model already there, what is left is setting dictation up");
  assert.match(sttStateSaid(sound({ ready: true, backend: "Vulkan1", model: { ...MODEL, state: "ready" } })).text, /Vulkan1/);
  assert.equal(sttStateSaid(sound({ trouble: "the download stopped" })).worry, true);
  assert.equal(sttStateSaid(sound({ unsupported: "no build for this machine" })).worry, true);
  assert.match(sttStateSaid(sound({ model: { ...MODEL, state: "partial" } })).text, /download it again/);
});

test("nothing the person reads ever names Handy", () => {
  const files = ["app.html", "src/app/stt-prefs.js", "src/app/stt.js", "assets/i18n.mjs", "routes/stt.mjs"];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(join(HERE, file), "utf8"), /Handy/, `${file} says Handy to the person — where the file came from is our business, not theirs`);
  }
});

test("the button says what it will do, and it is not always a download", () => {
  assert.match(sttActionSaid(sound()), /download the model/);
  assert.match(sttActionSaid(sound({ model: { ...MODEL, state: "handy" } })), /set dictation up/);
  assert.match(sttActionSaid(sound({ model: { ...MODEL, state: "ready" } })), /set dictation up/);
  paintStt(sound({ model: { ...MODEL, state: "handy" } }));
  assert.match($("stt-get").textContent, /set dictation up/);
  paintStt(sound());
  assert.match($("stt-get").textContent, /download the model/);
});

test("the buttons of this section are drawn as buttons, not as words", () => {
  const css = readFileSync(join(HERE, "app.html"), "utf8");
  assert.match(css, /\.stt-act button \{[^}]*border: 1px solid var\(--line-2\)/, "a .ghost has a transparent border, so it reads as plain text until you hover it");
});

test("switched off, the section shows nothing but the switch", () => {
  paintStt(sound({ enabled: false }));
  assert.equal($("t-stt").textContent, "off");
  assert.equal($("stt-box").hidden, true);
  assert.match($("stt-say").textContent, /nothing downloaded/);
});

test("switched on with nothing downloaded, only the bring-it-down button shows", () => {
  paintStt(sound());
  assert.equal($("stt-box").hidden, false);
  assert.equal($("stt-get").hidden, false);
  assert.equal($("stt-stop").hidden, true);
  assert.equal($("stt-drop").hidden, true);
  assert.equal($("stt-bar").hidden, true);
});

test("while it downloads, the bar shows and the only button is the one that stops it", () => {
  paintStt(sound({ download: { what: "model", downloaded: 207884536, total: 831538144 } }));
  assert.equal($("stt-bar").hidden, false);
  assert.equal($("stt-bar").firstElementChild.style.width, "25%");
  assert.equal($("stt-get").hidden, true);
  assert.equal($("stt-stop").hidden, false);
  assert.equal($("stt-drop").hidden, true);
});

test("a model the hive brought down can be deleted, one borrowed from Handy cannot", () => {
  paintStt(sound({ ready: true, model: { ...MODEL, state: "ready" } }));
  assert.equal($("stt-drop").hidden, false);
  paintStt(sound({ ready: true, model: { ...MODEL, state: "handy" } }));
  assert.equal($("stt-drop").hidden, true, "the hive never deletes a file that belongs to Handy");
});

test("a machine with no build cannot switch dictation on at all", () => {
  paintStt(sound({ enabled: true, unsupported: "dictation has no engine built for linux arm yet" }));
  assert.equal($("t-stt").disabled, true);
  assert.equal($("stt-box").hidden, true);
  assert.match($("stt-say").textContent, /not on this machine/);
});

test("the language picker offers letting the model work it out, and pt among the rest", () => {
  paintStt(sound({ language: "pt" }));
  assert.equal($("f-stt-lang").value, "pt");
  assert.equal(STT_LANGUAGES[0][0], "", "the first choice is to let the model work it out");
  assert.ok(STT_LANGUAGES.some(([code]) => code === "pt"));
  paintStt(sound({ language: "zz" }));
  assert.equal($("f-stt-lang").value, "", "a language we do not offer falls back to working it out");
});

test("the switch writes the flag to the config file", async () => {
  st.stt = sound({ enabled: false });
  calls.length = 0;
  $("t-stt").click();
  await new Promise((done) => setTimeout(done, 10));
  const wrote = calls.find((one) => one.path === "/api/config");
  assert.deepEqual(wrote?.body, { config: { stt: true } });
});

test("bring it down and stop it speak to their own routes", async () => {
  st.stt = sound();
  calls.length = 0;
  $("stt-get").click();
  await new Promise((done) => setTimeout(done, 10));
  assert.ok(calls.some((one) => one.path === "/api/stt/install"));
  calls.length = 0;
  $("stt-stop").click();
  await new Promise((done) => setTimeout(done, 10));
  assert.ok(calls.some((one) => one.path === "/api/stt/cancel"));
});

test("deleting asks first, and a no leaves the model alone", async () => {
  st.stt = sound({ ready: true, model: { ...MODEL, state: "ready" } });
  calls.length = 0;
  $("stt-drop").click();
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(calls.some((one) => one.path === "/api/stt/remove"), false, "nothing is deleted before the answer");
  assert.ok(st.confirmResolve, "the question never came up");
  st.confirmResolve(false);
  await new Promise((done) => setTimeout(done, 10));
  assert.equal(calls.some((one) => one.path === "/api/stt/remove"), false);
});

test("the language picked is written to the config file", async () => {
  st.stt = sound({ ready: true });
  calls.length = 0;
  $("f-stt-lang").value = "pt";
  $("f-stt-lang").dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 10));
  const wrote = calls.find((one) => one.path === "/api/config");
  assert.deepEqual(wrote?.body, { config: { sttLanguage: "pt" } });
});

const MODELS = [
  { id: "whisper-medium", name: "Whisper Medium", quant: "Q8_0", bytes: 831538144, detectsLanguage: true, active: true, state: "ready" },
  { id: "parakeet-v3", name: "Parakeet TDT 0.6B v3", quant: "Q8_0", bytes: 739508576, detectsLanguage: false, active: false, state: "none" }
];

test("the model picker lists every model with its weight and whether it is here, the one in use chosen", () => {
  paintStt(sound({ models: MODELS }));
  const pick = $("f-stt-model");
  assert.equal(pick.options.length, 2);
  assert.equal(pick.value, "whisper-medium");
  assert.equal(pick.disabled, false);
  assert.match(pick.options[1].textContent, /Parakeet TDT 0.6B v3 Q8_0 · 705 MB · not downloaded/);
  assert.match(modelOptionSaid({ ...MODELS[1], state: "handy" }), /on this machine/);
  assert.match(modelOptionSaid({ ...MODELS[1], state: "partial" }), /half downloaded/);
});

test("picking another model writes it to the config file and asks the hive again", async () => {
  paintStt(sound({ models: MODELS }));
  calls.length = 0;
  const pick = $("f-stt-model");
  pick.value = "parakeet-v3";
  pick.dispatchEvent(new Event("change"));
  await new Promise((done) => setTimeout(done, 10));
  assert.deepEqual(calls.find((one) => one.path === "/api/config")?.body, { config: { sttModel: "parakeet-v3" } });
  assert.ok(calls.some((one) => one.path === "/api/stt/status"));
});

test("downloading and deleting name the model in use", async () => {
  st.stt = sound({ model: { ...MODEL, id: "parakeet-v3" } });
  calls.length = 0;
  $("stt-get").click();
  await new Promise((done) => setTimeout(done, 10));
  assert.deepEqual(calls.find((one) => one.path === "/api/stt/install")?.body, { model: "parakeet-v3" });
});

test("a model that cannot work the language out says the hive's language is used instead", () => {
  assert.equal(languageChoices(true)[0][1], "work it out from what I say");
  assert.equal(languageChoices(false)[0][1], "the same language as the hive");
  paintStt(sound({ model: { ...MODEL, detectsLanguage: false } }));
  assert.equal($("f-stt-lang").options[0].textContent, "the same language as the hive");
  paintStt(sound());
  assert.equal($("f-stt-lang").options[0].textContent, "work it out from what I say");
});

test("the microphone picked for dictation is written to the config file", async () => {
  st.stt = sound({ ready: true });
  const pick = $("f-stt-mic");
  assert.ok(pick, "there is no microphone picker");
  pick.innerHTML = '<option value="">default</option><option value="usb-mic">usb</option>';
  calls.length = 0;
  pick.value = "usb-mic";
  pick.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 10));
  const wrote = calls.find((one) => one.path === "/api/config");
  assert.deepEqual(wrote?.body, { config: { sttMic: "usb-mic" } });
  assert.equal(st.stt.mic, "usb-mic");
});
