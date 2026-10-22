import { test } from "node:test";
import assert from "node:assert/strict";
import { pictureFromStore, pinnedScreens, proposalFromStore, screenbookStoreOf } from "../lib/screenbook-store.mjs";

const asFile = (body) => ({ ok: true, out: JSON.stringify({ encoding: "base64", content: Buffer.from(body).toString("base64") }) });

function storeWith(files) {
  const asked = [];
  const ghApi = async (route) => {
    asked.push(route);
    const path = route.replace(/^repos\/[^/]+\/[^/]+\/contents\//, "");
    return path in files ? asFile(files[path]) : { ok: false, out: "", error: "HTTP 404: Not Found" };
  };
  return { ghApi, asked };
}

test("the store is an owner and a repo, or the https address of a screenbook server", () => {
  assert.equal(screenbookStoreOf("acme/screenbooks"), "acme/screenbooks");
  assert.equal(screenbookStoreOf(" org/repo "), "org/repo");
  assert.equal(screenbookStoreOf("github:org/repo"), "");
  assert.equal(screenbookStoreOf("org/repo/folder"), "");
  assert.equal(screenbookStoreOf(""), "");
  assert.equal(screenbookStoreOf("https://screenbook.example.org"), "https://screenbook.example.org");
  assert.equal(screenbookStoreOf(" https://screenbook.example.com/books/ "), "https://screenbook.example.com/books");
  assert.equal(screenbookStoreOf("http://screenbook.example.com"), "");
  assert.equal(screenbookStoreOf("https://user:pass@screenbook.example.com"), "");
  assert.equal(screenbookStoreOf("https://screenbook.example.com/?x=1"), "");
});

function serverWith(answers) {
  const asked = [];
  const fetchFn = async (url, init) => {
    const body = JSON.parse(init.body);
    asked.push({ url, method: init.method, authorization: init.headers.authorization, rpc: body });
    const [status, payload] = answers[`${body.method} ${JSON.stringify(body.args)}`] || [500, { error: "boom" }];
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { fetchFn, asked };
}

const ghToken = async () => "gho_test\n";
const SERVER = "https://screenbook.example.com";

test("a proposal read from a screenbook server goes through its rpc with the github token", async () => {
  const { fetchFn, asked } = serverWith({
    'proposal ["etapas"]': [200, { result: { id: "etapas", status: "open", screens: { "lista-de-etapas": 3, "../fora": 1 } } }]
  });
  const ghApi = async () => { throw new Error("the github api is not asked when the store is a server"); };
  const read = await proposalFromStore({ ghApi, ghToken, fetchFn, store: `${SERVER}/`, product: "reader", id: "etapas" });
  assert.deepEqual(read, { screens: { "lista-de-etapas": 3 }, status: "open" });
  assert.deepEqual(asked, [{ url: `${SERVER}/reader/api/rpc`, method: "POST", authorization: "Bearer gho_test", rpc: { method: "proposal", args: ["etapas"] } }]);
});

test("a proposal the server does not have is missing, any other failure is not", async () => {
  const { fetchFn } = serverWith({
    'proposal ["sumiu"]': [404, { error: "no proposal sumiu" }],
    'proposal ["negado"]': [401, { error: "bad token" }]
  });
  const gone = await proposalFromStore({ ghToken, fetchFn, store: SERVER, product: "reader", id: "sumiu" });
  assert.equal(gone.missing, true);
  assert.match(gone.error, /no proposal sumiu/);
  const denied = await proposalFromStore({ ghToken, fetchFn, store: SERVER, product: "reader", id: "negado" });
  assert.equal(denied.missing, false);
  assert.match(denied.error, /bad token/);
  const offline = await proposalFromStore({ ghToken, fetchFn: async () => { throw new Error("ECONNREFUSED"); }, store: SERVER, product: "reader", id: "etapas" });
  assert.match(offline.error, /did not answer.*ECONNREFUSED/);
  assert.equal(offline.missing, undefined);
});

test("without a github login the server is not asked at all", async () => {
  const { fetchFn, asked } = serverWith({});
  const read = await proposalFromStore({ ghToken: async () => "", fetchFn, store: SERVER, product: "reader", id: "etapas" });
  assert.match(read.error, /no github login/);
  assert.deepEqual(asked, []);
});

test("the picture from a server is the png buffer of the first screen at its version", async () => {
  const { fetchFn, asked } = serverWith({
    'png ["lista-de-etapas",3]': [200, { result: { $buffer: Buffer.from("png-bytes").toString("base64") } }],
    'png ["tela",1]': [200, { result: null }]
  });
  const picture = await pictureFromStore({ ghToken, fetchFn, store: SERVER, product: "reader", screens: { "lista-de-etapas": 3, "etapa-vazia": 1 } });
  assert.equal(picture.data.toString(), "png-bytes");
  assert.deepEqual(asked[0].rpc, { method: "png", args: ["lista-de-etapas", 3] });
  assert.equal(asked[0].url, `${SERVER}/reader/api/rpc`);
  const none = await pictureFromStore({ ghToken, fetchFn, store: SERVER, product: "reader", screens: { tela: 1 } });
  assert.match(none.error, /no picture of tela v1/);
});

test("a proposal read from the store gives the version of each screen it drew", async () => {
  const { ghApi, asked } = storeWith({
    "reader/proposals/etapas/proposal.json": JSON.stringify({ id: "etapas", status: "approved", screens: { "lista-de-etapas": 3, "etapa-vazia": 1 } })
  });
  const read = await proposalFromStore({ ghApi, store: "org/telas", product: "reader", id: "etapas" });
  assert.deepEqual(read, { screens: { "lista-de-etapas": 3, "etapa-vazia": 1 }, status: "approved" });
  assert.deepEqual(asked, ["repos/org/telas/contents/reader/proposals/etapas/proposal.json"]);
});

test("a proposal the store does not have, or no store at all, says so instead of guessing", async () => {
  const { ghApi, asked } = storeWith({});
  assert.match((await proposalFromStore({ ghApi, store: "org/telas", product: "reader", id: "sumiu" })).error, /404/);
  assert.match((await proposalFromStore({ ghApi, store: "", product: "reader", id: "etapas" })).error, /no screenbook store/);
  assert.match((await proposalFromStore({ ghApi, store: "org/telas", product: "../x", id: "etapas" })).error, /not a proposal/);
  assert.deepEqual(asked, ["repos/org/telas/contents/reader/proposals/sumiu/proposal.json", "repos/org/telas"], "nothing is asked of the store for a name that could walk out of it");
});

test("a proposal is only called missing when the store answers and the proposal is not in it", async () => {
  const reachable = async (route) => (route === "repos/org/telas" ? { ok: true, out: "{}" } : { ok: false, out: "", error: "gh: Not Found (HTTP 404)" });
  assert.equal((await proposalFromStore({ ghApi: reachable, store: "org/telas", product: "reader", id: "sumiu" })).missing, true);
  const hidden = async () => ({ ok: false, out: "", error: "gh: Not Found (HTTP 404)" });
  assert.equal((await proposalFromStore({ ghApi: hidden, store: "org/telas", product: "reader", id: "etapas" })).missing, false, "a store this machine cannot see answers 404 too");
});

test("a picture too big for the contents api is read from its blob", async () => {
  const sha = "a".repeat(40);
  const ghApi = async (route) => (route.includes("/git/blobs/")
    ? { ok: true, out: JSON.stringify({ encoding: "base64", content: Buffer.from("big-png").toString("base64") }) }
    : { ok: true, out: JSON.stringify({ encoding: "none", content: "", sha }) });
  const picture = await pictureFromStore({ ghApi, store: "org/telas", product: "reader", screens: { tela: 1 } });
  assert.equal(picture.data.toString(), "big-png");
});

test("only screen ids and positive versions survive from a proposal file", () => {
  assert.deepEqual(pinnedScreens({ ok: 2, "../fora": 1, zero: 0, texto: "3", meio: 1.5 }), { ok: 2 });
  assert.deepEqual(pinnedScreens(null), {});
});

test("the picture of a proposal is the png of its first screen, at the version it drew", async () => {
  const { ghApi, asked } = storeWith({ "reader/screens/lista-de-etapas/v3.png": "png-bytes" });
  const picture = await pictureFromStore({ ghApi, store: "org/telas", product: "reader", screens: { "lista-de-etapas": 3, "etapa-vazia": 1 } });
  assert.equal(picture.data.toString(), "png-bytes");
  assert.deepEqual(asked, ["repos/org/telas/contents/reader/screens/lista-de-etapas/v3.png"]);
  assert.match((await pictureFromStore({ ghApi, store: "org/telas", product: "reader", screens: {} })).error, /no screen/);
});

test("a file too big for the contents api is reported, not read as empty", async () => {
  const ghApi = async () => ({ ok: true, out: JSON.stringify({ encoding: "none", content: "" }) });
  assert.match((await pictureFromStore({ ghApi, store: "org/telas", product: "reader", screens: { tela: 1 } })).error, /too big/);
});
