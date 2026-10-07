import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const module = readFileSync(join(HERE, "src", "app", "plane.js"), "utf8");
const layer = module.replace(/^import [^\n]*;$/gm, "").replace(/^export \{[^}]*\};$/m, "");

const HARNESS = `
  const phrase = (text, vars) => Object.entries(vars || {}).reduce((said, [key, value]) => said.split("{" + key + "}").join(value), String(text));
  const esc = (text) => String(text);
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v))
  };
  const document = { querySelector: () => null };
  const solidMounts = [];
  const $ = () => null;
  const tiles = new Map();
  const pool = new Map();
  const planeNodesSeen = [];
  const GLYPH = {};
  const LABEL = {};
  const keyLabel = () => "";
  const prsOfChat = () => [];
  const prIsGone = () => false;
  const refit = () => {};
  const render = () => {};
  const went = [];
  const goTo = (key) => went.push(key);
  const sent = [];
  const sendToSeat = (target, text) => { sent.push({ to: target.name, text }); return true; };
  const wakeAndSay = () => true;
  const posted = [];
  const fetch = async (url, opts) => { posted.push({ url, body: JSON.parse(opts.body) }); return { json: async () => ({ ok: true, delivered: true }) }; };
  const pull = async () => {};
  const st = {
    data: { sessions: [], gone: [] },
    blocks: [],
    block: 0,
    open: "",
    mirrorDev: "",
    fieldPane: "",
    focus: 0,
    typing: null,
    keys: { new: null }
  };
  let seats = {};
  const itemOf = (key) => {
    if (key.startsWith("gone:")) {
      const one = (st.data.gone || []).find((x) => "gone:" + x.name === key);
      return one ? { kind: "gone", key, state: "closed", ...one } : null;
    }
    return seats[key] ? { kind: "session", key, name: key, ...seats[key] } : null;
  };
`;

const EXPOSE = `
  return {
    NODE_W, NODE_H, PLANE_GAP, PLANE_MAX, PLANE_LINK_TTL,
    tidyPlane, planeSpotOf, planeCamera, planeDensity, planeWirePath,
    planeFlocks, planeBounds, planeShown, planeLink, readPlaneLinks, planeSeatKeys,
    seatsInArea, planeBoxOf, planeSizeOf, readPlaneSizes, readPlaneAreas, readPlaneNotes, shortTask,
    NODE_MIN_W, NODE_MIN_H, AREA_MIN_W,
    areas: (list) => { st.planeAreas = list; },
    sizes: (map) => { st.planeSizes = map; },
    links2: () => st.planeLinks.map((l) => ({ from: l.from, to: l.to, task: l.task })),
    posted: () => posted.map((one) => ({ ...one })),
    notes: (list) => { st.planeNotes = list; },
    place: (key, at) => { st.planeSpots[key] = at; },
    planeClashes, planeSeen, planeFreeSpot, planeKin,
    fleet: (list) => { st.data.sessions = list; },
    camera: (at) => { st.planeAt = at; },
    store, sent, went,
    spots: () => JSON.parse(JSON.stringify(st.planeSpots)),
    links: () => st.planeLinks.map((l) => ({ from: l.from, to: l.to })),
    ghosts: (list) => { st.data.gone = list; },
    lay: (shape, live) => {
      seats = live;
      st.data.sessions = Object.entries(live).map(([name, one]) => ({ name, ...one }));
      st.data.gone = [];
      st.blocks = shape.map((keys, i) => ({ id: "b" + i, label: "", manual: false, keys: [...keys] }));
      st.planeSpots = {};
      st.planeLinks = [];
      st.planeSizes = {};
      st.planeAreas = [];
      st.planeNotes = [];
      posted.length = 0;
      planeNodes.clear();
      planeTook.clear();
    },
    node: (key) => planeNodes.set(key, { dataset: { key } }),
    takeFieldPane, dropFieldPane, paneOnField, paneShownFor,
    fieldPane: () => st.fieldPane,
    blockNow: () => st.block,
    pickPlane, dropPlaneThings, copyPlaneThing, tintPlaneNote, undoPlane, redoPlane, canUndoPlane, planeIsArea,
    picked: () => [...st.planePicked].sort(),
    pick: (ids) => { st.planePicked = new Set(ids); },
    noteIds: () => st.planeNotes.map((one) => one.id),
    areaIds: () => st.planeAreas.map((one) => one.id),
    noteOf: (id) => st.planeNotes.find((one) => one.id === id) || null,
    areaOf: (id) => st.planeAreas.find((one) => one.id === id) || null,
    onPlane: (on) => { st.planeOn = on; },
    openSeat: (name) => { st.open = name; },
    now: () => Date.now()
  };
`;

const fresh = () => new Function(HARNESS + layer + EXPOSE)();

const FIELD = {
  "crm-midia-vazia": { errand: "CRM: mídia vazia", state: "needs", summary: "o espelho grava só o envelope" },
  "crm-espelho-peneira": { errand: "CRM: mídia vazia", state: "working", summary: "lista branca por nome" },
  "crm-teste-envelope": { errand: "CRM: mídia vazia", state: "needs", summary: "" },
  "mobile-estante": { errand: "porta do celular", state: "answered", summary: "9 testes passaram" },
  "mobile-prs": { errand: "porta do celular", state: "idle", summary: "esperando o PR entrar" },
  "migrations-grant": { errand: "", state: "idle", summary: "sem pedido" }
};
const BLOCKS = [
  ["crm-midia-vazia", "crm-espelho-peneira", "crm-teste-envelope"],
  ["mobile-estante", "mobile-prs", "migrations-grant"]
];

test("tidy puts the seats of one errand side by side, and gives each errand its own band", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.tidyPlane();
  const at = p.spots();
  assert.equal(at["crm-midia-vazia"].y, at["crm-espelho-peneira"].y, "same errand, same row");
  assert.equal(at["crm-espelho-peneira"].x - at["crm-midia-vazia"].x, p.NODE_W + p.PLANE_GAP);
  assert.notEqual(at["mobile-estante"].y, at["crm-midia-vazia"].y, "another errand, another band");
  assert.ok(at["migrations-grant"].y > at["mobile-estante"].y, "what nobody asked for goes last");
  assert.equal(at["crm-midia-vazia"].x, 0, "every band starts at the same left edge");
  assert.equal(at["mobile-estante"].x, 0);
});

test("the biggest errand comes first, and a seat with no errand is always the tail", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  const flocks = p.planeFlocks(p.planeSeatKeys()).map(([errand, members]) => [errand, members.length]);
  assert.deepEqual(flocks, [["CRM: mídia vazia", 3], ["porta do celular", 2], ["", 1]]);
});

test("a seat that was never placed lands beside the others, never on top of one", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.tidyPlane();
  const before = Object.values(p.spots());
  const at = p.planeSpotOf("canvas-maestri");
  const clash = before.some((was) => Math.abs(was.x - at.x) < p.NODE_W && Math.abs(was.y - at.y) < p.NODE_H);
  assert.equal(clash, false, "the free spot overlaps nobody");
  assert.deepEqual(p.planeSpotOf("canvas-maestri"), at, "and asking again keeps it there");
});

test("a spot the person moved survives the reload, and tidy is the only thing that undoes it", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.tidyPlane();
  const kept = JSON.parse(p.store.get("hive.plane.spots"));
  assert.equal(kept["crm-midia-vazia"].x, 0);
  assert.equal(Object.keys(kept).length, 6);
});

test("how much of a seat you see follows the zoom, and nothing in between is a surprise", () => {
  const p = fresh();
  assert.equal(p.planeDensity(1), "full");
  assert.equal(p.planeDensity(0.62), "full");
  assert.equal(p.planeDensity(0.61), "card");
  assert.equal(p.planeDensity(0.3), "card");
  assert.equal(p.planeDensity(0.29), "pill");
});

test("fitting the field centres it and never zooms past what the plane allows", () => {
  const p = fresh();
  const wide = p.planeCamera({ x: 0, y: 0, w: 2000, h: 1000 }, 1000, 600, 50);
  assert.ok(wide.k < 1, "a field wider than the window shrinks");
  assert.ok(Math.abs((wide.x + (2000 * wide.k) / 2) - 500) < 0.5, "and lands in the middle");
  const tiny = p.planeCamera({ x: 0, y: 0, w: 80, h: 40 }, 1000, 600, 50);
  assert.equal(tiny.k, p.PLANE_MAX, "one small seat does not blow up to fill the window");
});

test("the field is as big as the seats on it, wherever they were dragged", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.node("crm-midia-vazia");
  p.node("mobile-estante");
  p.planeSpotOf("crm-midia-vazia");
  p.planeSpotOf("mobile-estante");
  const box = p.planeBounds();
  assert.ok(box.w >= p.NODE_W && box.h >= p.NODE_H);
});

test("a line puts the two seats together, and each one hears it in the other's name", async () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.planeLink("crm-midia-vazia", "mobile-prs", "achar por que a mídia chega vazia");
  await new Promise((r) => setTimeout(r, 0));
  const posted = p.posted();
  assert.equal(posted.length, 2, "both sides hear it, not just the one you dropped on");
  assert.deepEqual([posted[0].body.name, posted[0].body.from], ["mobile-prs", "crm-midia-vazia"]);
  assert.deepEqual([posted[1].body.name, posted[1].body.from], ["crm-midia-vazia", "mobile-prs"]);
  assert.equal(posted[0].body.text, "achar por que a mídia chega vazia", "what goes over is what you wrote, and nothing else");
  assert.deepEqual(p.links2(), [{ from: "crm-midia-vazia", to: "mobile-prs", task: "achar por que a mídia chega vazia" }]);
});

test("the same pair is one line however you draw it, and a line with no task still introduces them", async () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.planeLink("crm-midia-vazia", "mobile-prs", "primeiro");
  p.planeLink("mobile-prs", "crm-midia-vazia", "");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(p.links2().length, 1, "drawing it back the other way is the same line");
  assert.equal(p.links2()[0].task, "");
  assert.equal(p.posted().length, 2, "a line with nothing written says nothing — only the first one spoke");
});

test("a long task is cut short on the line, and kept whole underneath", () => {
  const p = fresh();
  const long = "arrumar o espelho, o gravador, a peneira e mais um punhado de coisas que nao cabem";
  assert.ok(p.shortTask(long).length <= 42);
  assert.ok(p.shortTask(long).endsWith("…"));
  assert.equal(p.shortTask("  duas   linhas\n aqui "), "duas linhas aqui");
});

test("a line older than the day it was drawn is not read back", () => {
  const p = fresh();
  const old = Date.now() - p.PLANE_LINK_TTL - 1000;
  p.store.set("hive.plane.links", JSON.stringify([
    { from: "a", to: "b", at: old },
    { from: "c", to: "d", at: Date.now() }
  ]));
  assert.deepEqual(p.readPlaneLinks().map((l) => l.from), ["c"]);
});

test("opening a seat leaves the plane, so the terminal gets the whole window", () => {
  const p = fresh();
  p.onPlane(true);
  assert.equal(p.planeShown(), true);
  p.openSeat("crm-midia-vazia");
  assert.equal(p.planeShown(), false);
});

test("the wire between two seats bends, so it reads as a line and not as a corner", () => {
  const p = fresh();
  const path = p.planeWirePath(0, 0, 400, 200);
  assert.match(path, /^M0,0 C\d/);
  assert.ok(path.includes("400,200"));
});

test("a seat inside an area belongs to it, and one that only overlaps a corner does not", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.tidyPlane();
  const at = p.spots();
  const area = { id: "pa1", name: "o que eu estou olhando", x: at["crm-midia-vazia"].x - 20, y: at["crm-midia-vazia"].y - 20, w: p.NODE_W + 40, h: p.NODE_H + 40 };
  p.areas([area]);
  assert.deepEqual(p.seatsInArea(area), ["crm-midia-vazia"]);
});

test("tidy leaves alone whatever the person put inside an area", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.tidyPlane();
  p.place("mobile-prs", { x: 4000, y: 4000 });
  p.areas([{ id: "pa1", name: "meu canto", x: 3900, y: 3900, w: 700, h: 600 }]);
  p.tidyPlane();
  assert.deepEqual(p.spots()["mobile-prs"], { x: 4000, y: 4000 }, "what is inside an area stays put");
  assert.equal(p.spots()["crm-midia-vazia"].x, 0, "and everything outside is laid out again");
  assert.equal(Object.keys(p.spots()).length, 6, "nobody is lost on the way");
});

test("a seat keeps the size it was pulled to, and never goes under the floor", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.sizes({ "crm-midia-vazia": { w: 520, h: 380 } });
  assert.deepEqual(p.planeSizeOf("crm-midia-vazia"), { w: 520, h: 380 });
  assert.deepEqual(p.planeSizeOf("mobile-prs"), { w: p.NODE_W, h: p.NODE_H });
  p.store.set("hive.plane.sizes", JSON.stringify({ a: { w: 10, h: 10 }, b: { w: "x", h: 3 } }));
  const read = p.readPlaneSizes();
  assert.deepEqual(read.a, { w: p.NODE_MIN_W, h: p.NODE_MIN_H }, "a tiny size is lifted to the floor");
  assert.equal(read.b, undefined, "a broken size is dropped");
});

test("an area that was named survives the reload, and a broken one is dropped", () => {
  const p = fresh();
  p.store.set("hive.plane.areas", JSON.stringify([
    { id: "pa1", name: "CRM", x: 0, y: 0, w: 900, h: 400 },
    { id: "pa2", name: "sem tamanho", x: 0, y: 0 },
    { id: "pa3", name: "estreita", x: 0, y: 0, w: 10, h: 10 }
  ]));
  const read = p.readPlaneAreas();
  assert.deepEqual(read.map((a) => a.id), ["pa1", "pa3"]);
  assert.equal(read[1].w, p.AREA_MIN_W, "an area narrower than the floor is widened");
});

test("the field counts an empty area too, so fitting it does not cut it off", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.node("crm-midia-vazia");
  p.planeSpotOf("crm-midia-vazia");
  const tight = p.planeBounds();
  p.areas([{ id: "pa1", name: "", x: 2000, y: 1500, w: 800, h: 400 }]);
  const wide = p.planeBounds();
  assert.ok(wide.w > tight.w && wide.h > tight.h);
});

test("a line remembers the task it was drawn for, so the label is not a guess", () => {
  const p = fresh();
  p.store.set("hive.plane.links", JSON.stringify([{ from: "a", to: "b", at: Date.now(), task: "arrumar o espelho" }]));
  assert.equal(p.readPlaneLinks()[0].task, "arrumar o espelho");
  p.store.set("hive.plane.links", JSON.stringify([{ from: "a", to: "b", at: Date.now() }]));
  assert.equal(p.readPlaneLinks()[0].task, "", "a line drawn with nothing said stays empty, not undefined");
});

test("two boxes that touch a corner clash, two that share an edge do not", () => {
  const p = fresh();
  const taken = [{ x: 0, y: 0, w: 100, h: 100 }];
  assert.equal(p.planeClashes(50, 50, 100, 100, taken), true);
  assert.equal(p.planeClashes(100, 0, 100, 100, taken), false, "side by side is not on top of");
  assert.equal(p.planeClashes(0, 100, 100, 100, taken), false);
});

test("a seat that shows up lands where you are looking, not at the far end of the field", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.place("crm-midia-vazia", { x: 0, y: 0 });
  p.camera({ x: -6000, y: -4000, k: 1 });
  const seen = p.planeSeen();
  const at = p.planeFreeSpot();
  assert.ok(at.x >= seen.x && at.x <= seen.x + seen.w, "inside what the window shows");
  assert.ok(at.y >= seen.y && at.y <= seen.y + seen.h);
  assert.ok(at.x > 4000, "and nowhere near the seat parked at the origin");
});

test("a note is a thing on the field like any other, and a broken one is dropped", () => {
  const p = fresh();
  p.store.set("hive.plane.notes", JSON.stringify([
    { id: "pn1", text: "o GRANT mora no repo migrations", x: 40, y: 40, w: 420, h: 260 },
    { id: "pn2", text: "sem tamanho", x: 0, y: 0 }
  ]));
  const read = p.readPlaneNotes();
  assert.deepEqual(read.map((one) => one.id), ["pn1"]);
  assert.equal(read[0].text, "o GRANT mora no repo migrations");
});

test("the field counts the notes too, so fitting shows them", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.node("crm-midia-vazia");
  p.planeSpotOf("crm-midia-vazia");
  const tight = p.planeBounds();
  p.notes([{ id: "pn1", text: "", x: 3000, y: 2000, w: 400, h: 300 }]);
  const wide = p.planeBounds();
  assert.ok(wide.w > tight.w && wide.h > tight.h);
});

const NOTES = () => ([
  { id: "pn1", text: "o espelho grava só o envelope", tint: "", x: 0, y: 0, w: 420, h: 260 },
  { id: "pn2", text: "cruzar com takeover", tint: "amber", x: 500, y: 0, w: 420, h: 260 }
]);
const AREAS = () => ([{ id: "pa1", name: "porta do celular", x: 0, y: 400, w: 1240, h: 520 }]);

test("a note leaves the field by hand, and the field can be told to take it back", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.pick(["pn1"]);
  assert.equal(p.dropPlaneThings(["pn1"]), 1);
  assert.deepEqual(p.noteIds(), ["pn2"], "the note is off the field");
  assert.deepEqual(p.picked(), [], "and nothing is left picked");
  assert.deepEqual(JSON.parse(p.store.get("hive.plane.notes")).map((one) => one.id), ["pn2"], "and it is off the disk too");
  assert.equal(p.undoPlane(), true);
  assert.deepEqual(p.noteIds().sort(), ["pn1", "pn2"], "and it comes back");
  assert.equal(p.noteOf("pn1").text, "o espelho grava só o envelope", "with what was written in it");
  assert.equal(p.noteOf("pn1").x, 0, "and where it was");
});

test("what it takes away is only what was there, and an id nobody knows costs nothing", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.areas(AREAS());
  assert.equal(p.dropPlaneThings(["pn1", "pa1", "pn404"]), 2, "two of the three existed");
  assert.deepEqual(p.noteIds(), ["pn2"]);
  assert.deepEqual(p.areaIds(), []);
  assert.equal(p.dropPlaneThings(["pn404"]), 0, "and asking again changes nothing");
  assert.equal(p.canUndoPlane(), true);
  p.undoPlane();
  assert.deepEqual(p.areaIds(), ["pa1"], "the area comes back with the notes");
});

test("tidy stopped being a one-way door", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.place("crm-midia-vazia", { x: 900, y: 900 });
  p.tidyPlane();
  assert.notDeepEqual(p.spots()["crm-midia-vazia"], { x: 900, y: 900 }, "tidy moved it");
  assert.equal(p.undoPlane(), true);
  assert.deepEqual(p.spots()["crm-midia-vazia"], { x: 900, y: 900 }, "and undo put it back where the person had left it");
});

test("undo and redo walk the same line, and a new change closes the way forward", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.dropPlaneThings(["pn1"]);
  p.undoPlane();
  assert.equal(p.redoPlane(), true, "redo takes the note off again");
  assert.deepEqual(p.noteIds(), ["pn2"]);
  p.undoPlane();
  p.dropPlaneThings(["pn2"]);
  assert.equal(p.redoPlane(), false, "and a new change closes the way forward");
  assert.equal(p.undoPlane(), true);
  assert.deepEqual(p.noteIds().sort(), ["pn1", "pn2"]);
});

test("a duplicate lands beside the original, carries what it said and never steals its id", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  const twin = p.copyPlaneThing("pn1");
  assert.notEqual(twin.id, "pn1");
  assert.equal(twin.text, "o espelho grava só o envelope");
  assert.equal(twin.x, p.PLANE_GAP);
  assert.equal(twin.y, p.PLANE_GAP);
  assert.deepEqual(p.picked(), [twin.id], "and the copy is what you are holding");
  assert.equal(p.copyPlaneThing("pn404"), null);
});

test("a note keeps its colour across the reload, and an invented colour is dropped at the door", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  assert.equal(p.tintPlaneNote("pn1", "amber"), true);
  assert.equal(p.tintPlaneNote("pn1", "amber"), false, "the same colour is not a change");
  assert.equal(p.readPlaneNotes().find((one) => one.id === "pn1").tint, "amber");
  p.notes([{ id: "pn9", text: "", tint: "chartreuse", x: 0, y: 0, w: 420, h: 260 }]);
  p.tintPlaneNote("pn9", "chartreuse");
  assert.equal(p.noteOf("pn9").tint, "", "a colour the field does not know is no colour");
});

test("picking replaces, shift adds and the empty field lets go", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.pickPlane("pn1");
  assert.deepEqual(p.picked(), ["pn1"]);
  p.pickPlane("pn2", true);
  assert.deepEqual(p.picked(), ["pn1", "pn2"]);
  p.pickPlane("pn2", true);
  assert.deepEqual(p.picked(), ["pn1"], "shift on what is picked lets that one go");
  p.pickPlane("pn2");
  assert.deepEqual(p.picked(), ["pn2"], "without shift it is a fresh pick");
  assert.equal(p.pickPlane(""), true);
  assert.deepEqual(p.picked(), []);
  assert.equal(p.pickPlane(""), false, "and clearing an empty hand is not a change");
});

test("undo never brings back a pick on something that is gone", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.pick(["pn1", "pn2"]);
  p.dropPlaneThings(["pn1"]);
  assert.deepEqual(p.picked(), ["pn2"]);
  p.undoPlane();
  assert.deepEqual(p.picked(), ["pn2"], "the note is back on the field but not back in your hand");
});

test("the field knows an area from a note", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.notes(NOTES());
  p.areas(AREAS());
  assert.equal(p.planeIsArea("pa1"), true);
  assert.equal(p.planeIsArea("pn1"), false);
  assert.equal(p.planeIsArea("nope"), false);
});

test("the phone opens where you are looking: the field keeps standing and the node grows to hold the screen", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.onPlane(true);
  p.tidyPlane();
  const was = p.planeSizeOf("mobile-estante");
  assert.equal(p.takeFieldPane("mobile-estante"), true);
  assert.equal(p.fieldPane(), "mobile-estante");
  assert.equal(p.blockNow(), 1, "the field turned to the block that seat lives in");
  const now = p.planeSizeOf("mobile-estante");
  assert.ok(now.w >= was.w && now.h >= was.h, "the node is no smaller than it was");
  assert.ok(now.w > 400 && now.h > 300, "and it is big enough to watch a screen in");
  assert.equal(p.paneOnField("mobile-estante"), true);
  assert.equal(p.paneOnField("crm-midia-vazia"), false, "only the seat that asked has a screen on the field");
});

test("closing the screen gives the node back the size the person had chosen", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.onPlane(true);
  p.sizes({ "mobile-estante": { w: 300, h: 200 } });
  p.takeFieldPane("mobile-estante");
  assert.notDeepEqual(p.planeSizeOf("mobile-estante"), { w: 300, h: 200 });
  assert.equal(p.dropFieldPane(), true);
  assert.deepEqual(p.planeSizeOf("mobile-estante"), { w: 300, h: 200 }, "the size the person had chosen comes back");
  assert.equal(p.fieldPane(), "");
  assert.equal(p.dropFieldPane(), false, "and closing twice is not a change");
});

test("a node that never had a size of its own does not keep the screen size after the screen leaves", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.onPlane(true);
  p.takeFieldPane("mobile-estante");
  p.dropFieldPane();
  assert.deepEqual(p.planeSizeOf("mobile-estante"), { w: p.NODE_W, h: p.NODE_H }, "it is a plain node again");
});

test("with no field to stand on, the screen still takes the whole seat", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.onPlane(false);
  assert.equal(p.takeFieldPane("mobile-estante"), false, "no plane, no field pane");
  p.onPlane(true);
  p.openSeat("crm-midia-vazia");
  assert.equal(p.takeFieldPane("mobile-estante"), false, "a seat open full-screen is not the field either");
  p.openSeat("");
  assert.equal(p.takeFieldPane("nobody-here"), false, "and a seat that is not in any block has no node to grow");
});

test("opening a seat full-screen puts the field pane away without forgetting it", () => {
  const p = fresh();
  p.lay(BLOCKS, FIELD);
  p.onPlane(true);
  p.takeFieldPane("mobile-estante");
  assert.equal(p.paneShownFor("mobile-estante"), true);
  p.openSeat("mobile-estante");
  assert.equal(p.paneOnField("mobile-estante"), false, "the field is gone while a seat is open");
  assert.equal(p.paneShownFor("mobile-estante"), true, "but the screen followed the seat it belongs to");
  assert.equal(p.fieldPane(), "mobile-estante", "and the field remembers it when you come back");
});

test("a chat opened by another chat is on the field without taking a tile in the mosaic", () => {
  const plane = fresh();
  plane.lay([["pai"]], {
    pai: { state: "idle" },
    filho: { state: "idle", by: "pai" },
    "filho-2": { state: "idle", by: "pai" }
  });

  assert.deepEqual(plane.planeSeatKeys().sort(), ["filho", "filho-2", "pai"]);
});

test("the arrow is drawn from who opened to who was opened, and only when both are on the field", () => {
  const plane = fresh();
  plane.lay([["pai"]], { pai: { state: "idle" }, filho: { state: "idle", by: "pai" } });
  plane.place("pai", { x: 0, y: 0 });
  plane.place("filho", { x: 400, y: 0 });

  assert.deepEqual(plane.planeKin(), [{ from: "pai", to: "filho" }]);

  plane.lay([["orfao"]], { orfao: { state: "idle", by: "um-chat-que-fechou" } });
  plane.place("orfao", { x: 0, y: 0 });
  assert.deepEqual(plane.planeKin(), []);
});

test("a chat that opened another is never its own parent on the field", () => {
  const plane = fresh();
  plane.lay([["pai"]], { pai: { state: "idle", by: "pai" } });
  plane.place("pai", { x: 0, y: 0 });
  assert.deepEqual(plane.planeKin(), []);
});

test("a newborn lands beside the chat that opened it, and its siblings stack under it", () => {
  const plane = fresh();
  plane.lay([["pai"]], {
    pai: { state: "idle" },
    filho: { state: "idle", by: "pai" },
    "filho-2": { state: "idle", by: "pai" }
  });
  plane.place("pai", { x: 100, y: 100 });

  const first = plane.planeSpotOf("filho");
  const second = plane.planeSpotOf("filho-2");

  assert.equal(first.x, 100 + plane.NODE_W + plane.PLANE_GAP * 2);
  assert.equal(first.y, 100);
  assert.equal(second.x, first.x);
  assert.equal(second.y, first.y + plane.NODE_H + plane.PLANE_GAP);
});

test("a chat whose opener is not on the field falls back to the first free spot", () => {
  const plane = fresh();
  plane.lay([[]], { filho: { state: "idle", by: "quem-fechou" } });
  const free = plane.planeFreeSpot();
  assert.deepEqual(plane.planeSpotOf("filho"), free);
});

test("a chat that closed keeps its node and its arrow while the one that opened it is alive", () => {
  const plane = fresh();
  plane.lay([["pai"]], { pai: { state: "idle" } });
  plane.ghosts([{ name: "filho-fechado", by: "pai", errand: "acervo", endedAt: 1000, prs: [] }]);
  plane.place("pai", { x: 0, y: 0 });
  plane.place("gone:filho-fechado", { x: 400, y: 0 });

  assert.deepEqual(plane.planeSeatKeys().sort(), ["gone:filho-fechado", "pai"]);
  assert.deepEqual(plane.planeKin(), [{ from: "pai", to: "gone:filho-fechado" }]);
});

test("a live chat keeps its arrow to the chat that opened it even after that one closed", () => {
  const plane = fresh();
  plane.lay([[]], { neto: { state: "idle", by: "pai-fechado" } });
  plane.ghosts([{ name: "pai-fechado", by: "avo", errand: "acervo", endedAt: 1000, prs: [] }]);
  plane.place("gone:pai-fechado", { x: 0, y: 0 });
  plane.place("neto", { x: 400, y: 0 });

  assert.deepEqual(plane.planeKin(), [{ from: "gone:pai-fechado", to: "neto" }]);
});
