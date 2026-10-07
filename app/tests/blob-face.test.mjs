import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { cleanAvatar } from "../lib/config.mjs";
import { panelOf, readPanel } from "../lib/team.mjs";

const st = await state();
await views();
const { avatarKey, avatarSvg } = await app("core");
const { personFace } = await app("person-face");
const { adoptAvatar } = await app("shared");
const { pickFace } = await app("brand-face");
const { avatar, devFace, mirrorFace } = await app("team");
const { lentFace, mugPlay, mugRest } = await app("avatars");
const { facePickerViewModel, paintBrandAvatar } = await app("welcome");
const { setBrandFace } = await app("preferences");

const drawn = (svg) => { const host = document.createElement("span"); host.innerHTML = svg; return host.innerHTML; };

function fresh() {
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [] };
  st.team = { me: "joao", devs: [], sharing: false, players: [], version: 0 };
  st.configRead = false;
  st.configHas = {};
  st.faceAsked = true;
  st.myFace = null;
  st.myBlob = false;
  st.myWear = {};
  st.mugHeld = "";
  st.mugLook = "";
  st.calmOn = false;
  document.getElementById("face-gate").hidden = true;
}

function wrote(run) {
  const was = globalThis.fetch;
  const log = [];
  globalThis.fetch = (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url) === "/api/config" && body?.config?.avatar) log.push(body.config.avatar);
    return Promise.resolve({ ok: true, json: async () => ({ config: body?.config || {} }) });
  };
  return Promise.resolve(run()).then(() => log).finally(() => { globalThis.fetch = was; });
}

test("the robot is the face by default, and the blobatar is one pick away", () => {
  fresh();
  adoptAvatar({ config: { avatar: "ball/dark/red" }, has: { avatar: true } });
  const rows = facePickerViewModel();
  assert.equal(rows[0].part, "style");
  assert.deepEqual(rows[0].opts.map((o) => [o.value, o.worn]), [["robot", true], ["blobatar", false]]);
  assert.ok(rows.some((r) => r.part === "shape"), "the robot keeps its body, colour and wardrobe");
  assert.equal(avatar("joao"), `<span class="team-av face av-alive">${avatarSvg(devFace("joao"), { salt: "team-joao", title: "joao" })}</span>`);
});

test("picking the blobatar writes it down, and picking the robot writes a robot back", async () => {
  fresh();
  adoptAvatar({ config: { avatar: "ball/dark/red" }, has: { avatar: true } });
  assert.deepEqual(await wrote(() => pickFace("style", "blobatar")), ["blobatar"]);
  assert.equal(st.myBlob, true);
  assert.deepEqual(facePickerViewModel().map((r) => r.part), ["style"], "a blobatar has no body, colour or wardrobe to pick");
  assert.equal(avatar("joao"), `<span class="team-av face av-alive">${personFace("joao")}</span>`);
  assert.deepEqual(await wrote(() => pickFace("style", "robot")), [avatarKey(st.myFace)]);
  assert.equal(st.myBlob, false);
});

test("a blobatar read from the config is the face at the top, with expressions for the plays", () => {
  fresh();
  setBrandFace("always", true);
  adoptAvatar({ config: { avatar: "blobatar" }, has: { avatar: true } });
  assert.equal(st.myBlob, true);
  assert.equal(st.myFace, null);
  const slot = document.getElementById("brand-mug");
  paintBrandAvatar();
  assert.equal(slot.innerHTML, drawn(personFace("joao")));
  mugPlay("exclaim");
  assert.equal(slot.innerHTML, drawn(personFace("joao", "surprised")));
  mugRest();
  assert.equal(slot.innerHTML, drawn(personFace("joao")));
  mugPlay("wide", { hold: false });
  assert.equal(slot.innerHTML, drawn(personFace("joao", "thinking")), "a mood that stays is worn until the fleet moves");
  st.mugHeld = "";
  mugRest();
});

test("a mate who chose the blobatar is drawn as one, the others keep their robot", () => {
  fresh();
  st.team.devs = [
    { dev: "renata", key: "renata@a", up: true, at: 1, avatar: "blobatar" },
    { dev: "pedro", key: "pedro@a", up: true, at: 1, avatar: "tv/dark/blue" }
  ];
  assert.equal(mirrorFace("renata"), personFace("renata"));
  assert.equal(lentFace("renata"), `<span class="team-av face av-alive">${personFace("renata")}</span>`);
  assert.equal(mirrorFace("pedro"), avatarSvg(devFace("pedro"), { salt: "team-pedro", title: "pedro" }));
});

test("the config and the panel carry the blobatar as the face", () => {
  const problems = [];
  assert.equal(cleanAvatar("blobatar", "patch", problems), "blobatar");
  assert.deepEqual(problems, []);
  assert.equal(cleanAvatar("blob", "patch", problems), "");
  assert.equal(problems.length, 1);
  const panel = panelOf([], "renata", 1000, new Map(), "blobatar");
  assert.equal(panel.avatar, "blobatar");
  assert.equal(readPanel(JSON.stringify(panel), 1000).avatar, "blobatar");
});
