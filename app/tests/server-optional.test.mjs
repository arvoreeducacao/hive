import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clusterIsWanted, serverIsWanted } from "../lib/env.mjs";
import { app } from "./dom.mjs";

const APP = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(APP, "server.mjs"), "utf8");

const { $ } = await app("core");
const { W_SERVER_STEPS, wFirstOpen, wGo, wNext, wPrev, wSkipped, wb } = await app("welcome");
const { pageAuthorize, pageHello, pageMachine, pageServer, wPaint, wPrimary } = await app("avatars");

const dep = (name, over = {}) => ({ name, ok: true, why: "", install: `brew install ${name}`, path: "/usr/bin/" + name, ...over });

const machine = (over = {}) => ({
  ok: true,
  deps: [dep("git"), dep("kubectl", { forCluster: true, needed: false })],
  aws: { ok: true, profile: "the-profile", detail: "someone" },
  cluster: { ok: true, name: "the-cluster", detail: "" },
  gh: { ok: true, detail: "someone" },
  claude: { loggedIn: true, email: "someone@example.com" },
  ...over
});

test("a server is wanted when there is an address to reach it at, and a name is never one", () => {
  assert.equal(serverIsWanted({}), false);
  assert.equal(serverIsWanted({ HIVE_DEV: "ada" }), false, "a name is who you are, not somewhere to reach");
  assert.equal(serverIsWanted({ HIVE_DEV: "ada", HIVE_DOOR_DOMAIN: "hive.example" }), false,
    "an address built out of somebody's name is the deployment's habit, not something the app may assume");
  assert.equal(serverIsWanted({}, { HIVE_POD: "ws-ada-0" }), false, "a pod is where a server sleeps, not how it is reached");
  assert.equal(serverIsWanted({ HIVE_SERVER_URL: "https://hive.example.com" }), true);
  assert.equal(serverIsWanted({}, { HIVE_SERVER_URL: "https://hive.example.com" }), true);
  assert.equal(serverIsWanted({ HIVE_SERVER_URL: "https://hive.example.com", HIVE_WANTS_SERVER: "0" }), false);
  assert.equal(serverIsWanted({ HIVE_WANTS_SERVER: "1" }), true);
});

test("a server reached by its address is not a cluster", () => {
  assert.equal(clusterIsWanted({ HIVE_SERVER_URL: "https://hive.example.com" }), false);
  assert.equal(clusterIsWanted({ HIVE_POD: "ws-ada-0" }), true);
  assert.equal(clusterIsWanted({ HIVE_DEV: "ada", HIVE_DOOR_DOMAIN: "hive.example" }), false,
    "a server reached over http is not a cluster, and must not ask anybody for kubectl");
  assert.equal(clusterIsWanted({ HIVE_POD: "ws-ada-0", HIVE_WANTS_CLUSTER: "0" }), false);
  assert.equal(clusterIsWanted({ HIVE_SERVER_URL: "https://hive.example.com", HIVE_WANTS_CLUSTER: "1" }), true);
  assert.equal(clusterIsWanted({}), false);
});

test("the cluster is only asked about when the server sits on one", () => {
  const look = server.slice(server.indexOf("async function machineLook"), server.indexOf("let onboardingCache"));
  for (const call of ["sts", "get-caller-identity"]) assert.ok(look.includes(call), "the aws probe moved and this test lost its subject");
  assert.match(look, /askCluster \? shr\("aws"/, "the aws probe runs for a server that is only an address");
  assert.match(look, /askCluster \? powerSwitch\("reachable"\)/, "the cluster probe runs for a server that is only an address");
  assert.match(look, /const askCluster = wantsCluster && clusterNamed/, "the app can run kubectl with an empty namespace again");
});

test("a machine whose server is not on a cluster is not held back by cluster tools", () => {
  const look = server.slice(server.indexOf("async function machineLook"), server.indexOf("let onboardingCache"));
  assert.match(look, /needed: d\.posixOnly && process\.platform === "win32" \? false : d\.forCluster \? wantsCluster : d\.forSeats \? !anotherAgentHere : true/);
  assert.match(look, /machine\.deps\.every\(\(d\) => d\.ok \|\| !d\.needed\)/);
  assert.match(look, /!wantsCluster \|\| \(machine\.aws\.ok && machine\.cluster\.ok\)/);
});

test("the first screen hides what a cluster-free machine cannot fix", () => {
  wb.s = { machine: machine({ wantsCluster: false }) };
  const alone = pageMachine();
  assert.doesNotMatch(alone, /kubectl/, "a step the machine cannot fix is still on the screen");
  assert.doesNotMatch(alone, /aws profile|hosting/, "a machine with no cluster is still asked for one");
  wb.s = { machine: machine() };
  const onACluster = pageMachine();
  assert.match(onACluster, /aws profile/);
  assert.match(onACluster, /hosting/);
});

test("the first screen names no company of its own", () => {
  wb.s = { machine: machine({ ok: false, aws: { ok: false, profile: "the-profile", detail: "no profile" }, cluster: { ok: false, name: "the-cluster", detail: "no answer" } }) };
  const screen = pageMachine();
  assert.doesNotMatch(screen, /arvore|#eng-/i, "the machine screen still spells out one company's profile, cluster or channel");
  assert.match(screen, /the-profile/, "the profile has to come from the configuration, not from a literal");
  assert.match(screen, /the-cluster/, "the cluster name has to come from the configuration, not from a literal");
});

test("the server step says what happens instead, rather than asking for one", () => {
  wb.s = { server: { wanted: false } };
  const step = pageServer();
  assert.match(step, /Seats run on this machine\./);
  assert.doesNotMatch(step, /provision|João|cluster|kubectl|SSO/, "the step still explains how one company happens to host a server");
  wb.s = { server: { wanted: true, answers: false, url: "https://hive.example.com", error: "it did not answer" } };
  assert.doesNotMatch(pageServer(), /Seats run on this machine\./, "the step cannot tell a machine with no server from one with a silent server");
});

test("the way in asks the server itself, not the cluster it might sit on", () => {
  const state = server.slice(server.indexOf("async function onboardingState"), server.indexOf("function invalidateOnboarding"));
  assert.match(state, /askTheDoor\(server\.url\)/, "the way in still asks kubernetes whether a seat can run");
  assert.doesNotMatch(state, /podLook|kubectl/, "the way in still reaches for the cluster");
});

test("the steps that belong to a server are skipped when there is none", () => {
  assert.deepEqual(W_SERVER_STEPS, ["server", "authorize", "login"]);
  for (const id of W_SERVER_STEPS) {
    assert.equal(wSkipped(id, { wantsServer: false }), true, id);
    assert.equal(wSkipped(id, { wantsServer: true }), false, id);
  }
  assert.equal(wSkipped("machine", { wantsServer: false }), false);
});

test("a local-only setup can leave the server step, not wait forever for an answer that was never coming", () => {
  wb.step = "server";
  wb.s = { wantsServer: false, server: { wanted: false } };
  assert.equal(wPrimary().action, "next", "wSkipped already calls this step done — the button has to agree");
  wb.s = { wantsServer: true, server: { wanted: true, answers: false } };
  assert.equal(wPrimary().action, "recheck", "a server that was asked for still has to actually answer");
  wb.s = { wantsServer: true, server: { wanted: true, answers: true } };
  assert.equal(wPrimary().action, "next");
});

test("after the key a local-only setup goes straight to the first flight, and back skips the server too", () => {
  $("welcome").hidden = false;
  wb.ready = true;
  wb.s = { wantsServer: false, machine: machine(), setup: { ok: true }, server: { wanted: false }, signature: {}, claudeOnServer: {}, sandbox: false };
  wb.step = "setup";
  assert.equal(wNext(), "flight", "Continue walked into the server steps of a machine that has no server");
  wb.step = "flight";
  assert.equal(wPrev(), "setup", "Back walked into the server steps of a machine that has no server");
  assert.equal(wFirstOpen(), "flight");
  wGo("server");
  assert.equal(wb.step, "flight", "a skipped step was opened anyway");
  wb.s = { ...wb.s, wantsServer: true, server: { wanted: true, answers: false } };
  wb.step = "setup";
  assert.equal(wNext(), "server", "a person who wants a server still meets it after the key");
  wb.step = "flight";
  assert.equal(wPrev(), "server", "login stays locked until the server answers");
  $("welcome").hidden = true;
});

test("the first page talks about a cluster and a .env only to the person who has them", () => {
  wb.dev = "ada";
  wb.nameWrong = false;
  wb.s = { wantsServer: false, machine: machine({ wantsCluster: false }), hubLooks: { ok: true, instructions: false, env: false } };
  const local = pageHello();
  assert.doesNotMatch(local, /cluster/, "a person with no cluster is told their name becomes something on one");
  assert.match(local, /Becomes the prefix of every branch you open:/);
  assert.doesNotMatch(local, /\.env/, "a person with no server is told the server will need a .env");
  assert.match(local, /found it — chats open here, next to your repositories/);
  wb.s = { ...wb.s, hubLooks: { ok: true, instructions: true, env: false } };
  assert.match(pageHello(), /found it — chats open here and read the instructions it holds/);
  wb.s = { wantsServer: true, machine: machine({ wantsCluster: true }), hubLooks: { ok: true, instructions: false, env: false } };
  const team = pageHello();
  assert.match(team, /on the cluster and the branch prefix/);
  assert.match(team, /found it — no \.env yet, the server will need one/);
});

test("the rail draws no step the person can never finish", () => {
  $("welcome").hidden = false;
  wb.step = "machine";
  wb.ready = true;
  wb.s = { wantsServer: false, machine: machine(), setup: { ok: true }, sandbox: false };
  wPaint();
  const shown = [...$("w-dots").querySelectorAll("button")].map((one) => one.dataset.id);
  assert.deepEqual(shown, ["hello", "machine", "setup", "flight"]);
  wb.s = { ...wb.s, wantsServer: true };
  wPaint();
  const withServer = [...$("w-dots").querySelectorAll("button")].map((one) => one.dataset.id);
  assert.deepEqual(withServer, ["hello", "machine", "setup", "server", "authorize", "login", "flight"]);
  $("welcome").hidden = true;
});

test("nothing in the way in reaches for a cluster any more", () => {
  const state = server.slice(server.indexOf("async function onboardingState"), server.indexOf("function invalidateOnboarding"));
  assert.doesNotMatch(state, /kubectl|podStateOf/, "the way in still asks the cluster instead of the server");
  assert.match(state, /insideTheServer\(\)/, "the login state has to come from the server itself");
});

test("authorising a key is the server's business, not something the app writes over kubectl", () => {
  assert.doesNotMatch(server, /authorizeOnPod/, "the app still writes into allowed_signers behind the server's back");
  wb.s = { signature: { ok: false, why: "no key" }, setup: { line: "ssh-ed25519 AAAA" } };
  const step = pageAuthorize();
  assert.doesNotMatch(step, /kubectl|allowed_signers/, "the step still explains a file on a pod");
  assert.match(step, /HIVE_OWNER_KEY/, "the step does not say how a server comes to trust a key");
});
