import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { applyUpdate, paintUpdate, stopPhase } = await app("tour");

const READY = { behind: 1, tag: "hive-2026.08.23-7712d0d5", number: 814, via: "release", packaged: true, notes: [{ kind: "fixed", text: "A thing.", pr: "#357" }], assetSize: 217157250, mine: {} };

const served = { json: READY };
let answerApply = null;

const answered = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });

const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  if (path === "/api/update") return Promise.resolve(answered(served.json));
  if (path === "/api/update/phase") return Promise.resolve(answered({}));
  if (path === "/api/update/apply") return new Promise((land) => { answerApply = (said) => land(answered(said)); });
  return Promise.resolve(answered({}));
};

after(() => { stopPhase(); globalThis.fetch = realFetch; });

bootSolid();

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((again) => setImmediate(again)); };

function screen(release = READY) {
  st.updating = false;
  st.held = null;
  st.showAllNotes = false;
  served.json = release;
  answerApply = null;
  paintUpdate(release);
  return {
    pill: () => $("btn-update"),
    said: (id) => $(id),
    paint: paintUpdate,
    click: async (answer) => {
      const going = applyUpdate();
      await settle();
      answerApply(answer);
      await going;
      await settle();
    },
    start: () => {
      const going = applyUpdate();
      return { going, answer: (said) => answerApply(said) };
    }
  };
}

test("a refused update says on the pill why, instead of quietly going back to green", async () => {
  const s = screen();
  await s.click({ error: "the release hive-2026.08.23-7712d0d5 carries no Hive-arm64.zip — that build has to be published before you can take it" });

  assert.equal(s.pill().classList.contains("held"), true, "the pill has to show it stopped");
  assert.equal(s.pill().classList.contains("busy"), false, "the bar cannot keep pretending it is working");
  assert.equal(s.pill().hidden, false);
  assert.equal(s.said("upd-step").textContent, "update failed");
  assert.match(s.pill().title, /carries no Hive-arm64\.zip/);
});

test("the panel opens with the whole sentence the server said and offers another go", async () => {
  const s = screen();
  await s.click({ error: "the download failed: connection reset" });

  assert.equal(s.said("relnotes").hidden, false, "the reason is no use behind a closed panel");
  assert.equal(s.said("rp-why").hidden, false);
  assert.match(s.said("rp-why").innerHTML, /the download failed: connection reset/);
  assert.equal(s.said("rp-go").textContent, "try again");
});

test("an update that only needs a hand is not dressed as a failure", async () => {
  const s = screen();
  await s.click({ ok: true, note: "the new version is in /tmp/bundle — quit the app and put it in place of yours" });

  assert.equal(s.said("upd-step").textContent, "your turn");
  assert.match(s.said("rp-why").innerHTML, /quit the app and put it in place of yours/);
});

test("an answer with neither ok nor a reason still says something", async () => {
  const s = screen();
  await s.click({});

  assert.equal(s.pill().classList.contains("held"), true);
  assert.match(s.said("rp-why").innerHTML, /stopped without saying why/);
});

test("an update that is going through keeps the bar running and says nothing", async () => {
  const s = screen();
  const going = s.start();
  await settle();
  assert.equal(s.said("upd-step").textContent, "starting");
  going.answer({ ok: true });
  await going.going;
  await settle();

  assert.equal(s.pill().classList.contains("busy"), true, "the app is about to be replaced — the bar stays");
  assert.equal(s.pill().classList.contains("held"), false);
  assert.equal(s.said("rp-why").hidden, true);
});

test("a newer release clears the failure — the next offer is not haunted by the last one", async () => {
  const s = screen();
  await s.click({ error: "the download failed: connection reset" });
  assert.equal(s.pill().classList.contains("held"), true);

  s.paint({ ...READY, tag: "hive-2026.08.23-99999999", behind: 2 });

  assert.equal(s.pill().classList.contains("held"), false);
  assert.equal(s.said("rp-why").hidden, true);
  assert.match(s.pill().title, /2 changes since your build/);
});
