import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { getStructured } = await app("chat-stretches");
const { attachmentTransport, takeAttachments } = await app("composer-attachments");
const { takeFiles } = await app("drop-zone");
const { advanceAsk, answerWithAttachments, noteAsk } = await app("composer-ask");
const { paintComposer } = await app("composer-modes");

globalThis.OffscreenCanvas = undefined;

const settle = (ms = 10) => new Promise((go) => setTimeout(go, ms));

let seq = 0;

function seat({ where = "local", answer = (cmd) => ({ ok: true, cid: cmd.cid }) } = {}) {
  const name = `attach-${++seq}`;
  st.data = { sessions: [{ name, where, state: "idle", structured: true }], spawning: [] };
  const e = getStructured({ name, where });
  const sent = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      sent.push(cmd);
      queueMicrotask(() => e.pending.get(cmd.cid)?.(answer(cmd)));
    }
  };
  document.body.appendChild(e.host);
  return { e, sent, box: e.host.querySelector(".sv-composer textarea"), tray: e.host.querySelector(".sv-attach") };
}

function uploads() {
  const calls = [];
  attachmentTransport.send = (blob, query, onProgress) => {
    let finish = null;
    const sent = new Promise((go) => { finish = go; });
    calls.push({ query, onProgress, finish, blob });
    return sent;
  };
  return calls;
}

const csv = (name = "notas.csv", text = "a,b\n1,2\n") => new dom.File([text], name, { type: "text/csv" });

const press = (box, key = "Enter", extra = {}) => box.dispatchEvent(new dom.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));

const toasts = () => [...document.querySelectorAll(".cp-toast b")].map((el) => el.textContent);

test("a file in the composer becomes a chip with its icon, name, size and upload progress", async () => {
  const calls = uploads();
  const { e, box, tray } = seat();
  box.value = "olha isso ";
  box.setSelectionRange(box.value.length, box.value.length);
  takeAttachments(e, [csv()]);
  await settle();
  const chip = tray.querySelector(".att.file");
  assert.ok(chip, "no chip for the file");
  assert.equal(chip.querySelector(".af-name").textContent, "notas.csv");
  assert.equal(chip.querySelector(".af-size").textContent, "1 KB");
  assert.ok(chip.querySelector(".af-icon svg"));
  assert.match(box.value, /olha isso \[File #1\] /);
  assert.deepEqual(calls[0].query, { name: e.name, where: "local", file: "notas.csv" });
  calls[0].onProgress(0.42);
  assert.equal(chip.querySelector(".af-suffix").textContent, "42%");
  calls[0].finish({ ok: true, path: "/hive/shots/x/files/1/notas.csv", name: "notas.csv", size: 8 });
  await settle();
  assert.equal(chip.dataset.state, "ready");
  assert.equal(chip.querySelector(".af-suffix"), null);
  e.host.remove();
});

test("a failed upload says so on the chip, and retry sends it again", async () => {
  const calls = uploads();
  const { e, tray } = seat();
  takeAttachments(e, [csv("dados.csv")]);
  await settle();
  calls[0].finish({ error: "the server hung up" });
  await settle();
  const chip = tray.querySelector(".att.file");
  assert.equal(chip.dataset.state, "failed");
  assert.equal(chip.querySelector(".af-suffix").textContent, "upload failed");
  assert.match(chip.title, /the server hung up/);
  chip.querySelector(".af-retry").click();
  await settle();
  assert.equal(calls.length, 2);
  calls[1].finish({ ok: true, path: "/p/dados.csv", size: 8 });
  await settle();
  assert.equal(tray.querySelector(".att.file").dataset.state, "ready");
  e.host.remove();
});

test("send waits while a file uploads, then the file goes out as a path the agent reads", async () => {
  const calls = uploads();
  const { e, box, sent } = seat();
  box.value = "resume ";
  box.setSelectionRange(box.value.length, box.value.length);
  takeAttachments(e, [csv()]);
  await settle();
  press(box);
  await settle();
  assert.equal(sent.filter((cmd) => cmd.type === "say").length, 0, "the message left before its file");
  assert.ok(toasts().includes("Attachment still uploading"));
  calls[0].finish({ ok: true, path: "/hive/shots/a/files/k/notas.csv", size: 8 });
  await settle();
  press(box);
  await settle();
  const said = sent.find((cmd) => cmd.type === "say");
  assert.equal(said.text, "resume @/hive/shots/a/files/k/notas.csv");
  e.host.remove();
});

test("deleting the mark from the text drops the file with it", async () => {
  const calls = uploads();
  const { e, box, tray } = seat();
  takeAttachments(e, [csv()]);
  await settle();
  calls[0].finish({ ok: true, path: "/p/notas.csv", size: 8 });
  await settle();
  box.value = "";
  box.dispatchEvent(new dom.Event("input"));
  assert.equal(e.files.count(), 0);
  assert.equal(tray.querySelector(".att.file"), null);
  e.host.remove();
});

test("an empty file is refused with a warning, and the good one still goes in", async () => {
  uploads();
  const { e, tray } = seat();
  takeAttachments(e, [new dom.File([], "vazio.txt"), csv()]);
  await settle();
  assert.equal(tray.querySelectorAll(".att.file").length, 1);
  assert.ok(toasts().some((said) => /'vazio\.txt' is empty/.test(said)));
  e.host.remove();
});

test("a stash or a question takes the file chips along and gives them back", async () => {
  const calls = uploads();
  const { e, box, tray } = seat();
  takeAttachments(e, [csv()]);
  await settle();
  calls[0].finish({ ok: true, path: "/p/notas.csv", size: 8 });
  await settle();
  const snap = e.box.snapshot();
  assert.deepEqual(snap.files, [[1, { path: "/p/notas.csv", name: "notas.csv", size: 8, type: "text/csv" }]]);
  e.box.restore({ text: "" });
  assert.equal(tray.querySelector(".att.file"), null);
  e.box.restore(snap);
  assert.equal(tray.querySelector(".att.file").dataset.state, "ready");
  assert.match(box.value, /\[File #1\]/);
  e.host.remove();
});

test("a dropped folder becomes an @path at the end of the message", async () => {
  uploads();
  const { e, box } = seat();
  box.value = "veja";
  window.hiveFiles = { pathOf: (file) => (file.name === "my repo" ? "/Users/me/my repo" : file.name === "app" ? "/Users/me/app" : "") };
  try {
    const zone = { el: e.host, session: st.data.sessions[0] };
    await takeFiles(zone, [new dom.File([], "app"), new dom.File([], "my repo")], new Set(["app", "my repo"]));
    assert.equal(box.value, 'veja @/Users/me/app/ @"/Users/me/my repo/" ');
    await takeFiles(zone, [new dom.File([], "gone")], new Set(["gone"]));
    assert.ok(toasts().includes('Couldn\'t get the path of "gone"'));
  } finally {
    delete window.hiveFiles;
  }
  e.host.remove();
});

test("a cloud chat refuses a folder from this computer", async () => {
  const { e, box } = seat({ where: "cloud" });
  window.hiveFiles = { pathOf: () => "/Users/me/app" };
  try {
    await takeFiles({ el: e.host, session: st.data.sessions[0] }, [new dom.File([], "app")], new Set(["app"]));
  } finally {
    delete window.hiveFiles;
  }
  assert.equal(box.value, "");
  assert.ok(toasts().includes("Folders can only be referenced on a server running on this computer"));
  e.host.remove();
});

test("an answer carries its attachments as lines the agent reads, and a file alone answers", async () => {
  const calls = uploads();
  const { e, box, tray, sent } = seat({ answer: (cmd) => ({ ok: true, cid: cmd.cid }) });
  box.value = "rascunho do chat";
  noteAsk(e, { id: "q1", questions: [{ question: "Qual planilha?", header: "Planilha", options: [{ label: "A" }] }] });
  paintComposer(e);
  assert.equal(box.value, "");
  takeAttachments(e, [csv("planilha.csv")]);
  await settle();
  assert.doesNotMatch(box.value, /\[File #/, "a question answer takes no inline mark");
  assert.ok(tray.querySelector(".att.file"));
  calls[0].finish({ ok: true, path: "/p/planilha.csv", size: 8 });
  await settle();
  advanceAsk(e);
  await settle();
  const answer = sent.find((cmd) => cmd.type === "answer");
  assert.deepEqual(answer.answers, { "Qual planilha?": 'Attached file "planilha.csv": "/p/planilha.csv"' });
  e.host.remove();
});

test("typed words, a picked option or a multi-select answer keep their attachments after them", () => {
  const files = [{ kind: "image", name: "tela.png", path: "/p/tela.png" }];
  assert.equal(answerWithAttachments("a primeira", files), 'a primeira\n\nAttached image "tela.png": "/p/tela.png"');
  assert.deepEqual(answerWithAttachments(["A", "B"], files), ["A", "B", 'Attached image "tela.png": "/p/tela.png"']);
  assert.equal(answerWithAttachments("só texto", []), "só texto");
});

function clipboard() {
  const held = new Map();
  return { held, setData: (type, value) => held.set(type, value), getData: (type) => held.get(type) || "", items: [] };
}

function clipEvent(type, data) {
  const ev = new dom.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: data });
  return ev;
}

test("text copied with chips carries what they point to into another composer", async () => {
  const calls = uploads();
  const from = seat();
  from.e.tray.restore("/p/tela.png", 1);
  from.box.value = "[Image #1] e ";
  from.box.setSelectionRange(from.box.value.length, from.box.value.length);
  takeAttachments(from.e, [csv()]);
  await settle();
  calls[0].finish({ ok: true, path: "/p/notas.csv", size: 8 });
  await settle();
  from.e.quotes.add("o que ele disse", "what it answered");
  const n = from.e.pastes.add("uma colagem longa");
  from.box.value = `${from.box.value}[Pasted text #${n} +1 lines]`;
  from.box.setSelectionRange(0, from.box.value.length);
  const data = clipboard();
  from.box.dispatchEvent(clipEvent("copy", data));
  assert.ok(data.held.get("web application/x-hive-context-fragment+json"));
  assert.match(data.held.get("text/html"), /data-hive-context-fragment=/);
  const to = seat();
  to.e.tray.restore("/q/outra.png", 1);
  to.box.value = "[Image #1] ";
  to.box.setSelectionRange(to.box.value.length, to.box.value.length);
  to.box.dispatchEvent(clipEvent("paste", data));
  assert.match(to.box.value, /^\[Image #1\] \[Image #2\] e \[File #1\] \[Pasted text #\d+ \+1 lines\]$/);
  assert.equal(to.e.tray.marks.get(2), "/p/tela.png");
  assert.equal(to.e.files.record(1).path, "/p/notas.csv");
  assert.equal(to.e.quotes.count(), 1);
  const pasted = /#(\d+) \+1/.exec(to.box.value)[1];
  assert.equal(to.e.pastes.get(Number(pasted)), "uma colagem longa");
  from.e.host.remove();
  to.e.host.remove();
});

test("# lists the repository's pull requests next to the chats, and a pick goes out as its link", async () => {
  const was = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => (String(url).startsWith("/api/prs/search")
      ? { available: true, repo: "acme/app", prs: [{ number: 31, title: "Fix login", url: "https://github.com/acme/app/pull/31", state: "merged", updatedAt: "2026-11-01" }] }
      : {})
  });
  try {
    const { e, box, sent } = seat();
    box.value = "ver #3";
    box.setSelectionRange(box.value.length, box.value.length);
    box.dispatchEvent(new dom.Event("input"));
    await settle(260);
    const row = e.host.querySelector(".sv-suggest .sg.sg-pr");
    assert.ok(row, "no pull request row in the # menu");
    assert.equal(row.dataset.state, "merged");
    press(box, "Enter");
    assert.equal(box.value, "ver #31 ");
    press(box, "Enter");
    await settle();
    assert.equal(sent.find((cmd) => cmd.type === "say").text, "ver https://github.com/acme/app/pull/31");
    e.host.remove();
  } finally {
    globalThis.fetch = was;
  }
});
