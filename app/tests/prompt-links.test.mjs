import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
await app("arrange");
const text = await app("prompt-link-text");
const { drafts, openDraft } = await app("draft-seat");
const { openPromptLink, paintPromptLinkButton, promptLinkOpenRow, promptLinkPaletteRows, promptLinksOf } = await app("prompt-links");
const { palModel } = await app("palette");
const { $ } = await app("core");

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, models: [] }) });

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "structured", structured: true, agent: "claude", cwd: "/hub/acme-hub", trees: [{ repo: "api-acme", path: "/hub/api-acme" }] });

function hive(keys = []) {
  st.LIMIT = 4;
  st.data = { sessions: keys.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.blocks = [{ id: "blk0", ws: "a", label: "", manual: false, keys: [...keys] }];
  st.block = 0;
  st.focus = 0;
  st.seatsKnown = true;
  st.accountsAsked = true;
  st.open = null;
  st.prs = [];
  for (const d of drafts.values()) d.e.host.remove();
  drafts.clear();
}

const link = (params) => `hive://new?${new URLSearchParams(params).toString()}`;

const hiddenSpace = String.fromCodePoint(0x200b);

const rightToLeft = String.fromCodePoint(0x202e);

const joiner = String.fromCodePoint(0x200d);

test("hidden characters are stripped and counted, line ends become plain newlines and the result is trimmed", () => {
  assert.deepEqual(text.sanitizeLinkedPrompt(`  fix${hiddenSpace} the ${rightToLeft}login\r\nnow  `), { text: "fix the login\nnow", hidden: 2 });
  assert.deepEqual(text.sanitizeLinkedPrompt("plain words"), { text: "plain words", hidden: 0 });
  const family = `${String.fromCodePoint(0x1f468)}${joiner}${String.fromCodePoint(0x1f469)}`;
  assert.deepEqual(text.sanitizeLinkedPrompt(family), { text: family, hidden: 0 }, "a joiner between two emoji parts stays");
  assert.deepEqual(text.sanitizeLinkedPrompt(`a${joiner}b`), { text: "ab", hidden: 1 }, "a joiner between letters goes");
});

test("a new-chat link carries the prompt, the repository, the provider and the model", () => {
  const said = text.parsePromptLink(link({ prompt: "review the queue", repo: "acme/api-acme", provider: "Claude", model: "opus" }));
  assert.equal(said.ok, true);
  assert.equal(said.kind, "new");
  assert.equal(said.prompt.text, "review the queue");
  assert.deepEqual(said.repo, { owner: "acme", name: "api-acme" });
  assert.equal(said.provider, "claude");
  assert.equal(said.model, "opus");
  assert.equal(text.parsePromptLink(link({ prompt: "x", provider: "claudeAgent" })).provider, "claude", "a link written for another app still finds claude");
  assert.deepEqual(text.parsePromptLink(link({ prompt: "x", repo: "https://github.com/acme/wiki.git" })).repo, { owner: "acme", name: "wiki" });
});

test("a link is refused with the reason when it is too long, only hidden, missing its prompt or names something unreadable", () => {
  assert.deepEqual(text.parsePromptLink(link({ prompt: "x".repeat(text.PROMPT_LINK_MAX + 1) })), { ok: false, error: "prompt-too-long" });
  assert.deepEqual(text.parsePromptLink(link({ prompt: `${hiddenSpace}${rightToLeft}` })), { ok: false, error: "prompt-only-hidden" });
  assert.deepEqual(text.parsePromptLink("hive://new?repo=a/b"), { ok: false, error: "missing-prompt" });
  assert.deepEqual(text.parsePromptLink(link({ prompt: "x", repo: "not a repo" })), { ok: false, error: "unreadable-repository" });
  assert.deepEqual(text.parsePromptLink(link({ pr: "owner/name/0" })), { ok: false, error: "unreadable-pull-request" });
  assert.equal(text.parsePromptLink("hive://seat/%zz?prompt=hi"), null, "a broken escape in the path is not a link");
  assert.equal(text.parsePromptLink("hive://new/%E0%A4?prompt=hi"), null);
  assert.match(text.promptLinkErrorText("prompt-only-hidden"), /may be malicious/);
});

test("a pull request link takes three spellings and needs no prompt", () => {
  for (const pr of ["acme/api-acme/4459", "acme/api-acme#4459", "https://github.com/acme/api-acme/pull/4459/files"]) {
    const said = text.parsePromptLink(link({ pr }));
    assert.equal(said.ok, true, pr);
    assert.deepEqual(said.pr, { owner: "acme", name: "api-acme", number: 4459 });
    assert.equal(said.prompt, null);
  }
});

test("a chat link with a prompt is a prompt link; without one it stays the plain chat link", () => {
  const said = text.parsePromptLink("hive://seat/fix-login?prompt=also%20check%20the%20tests");
  assert.equal(said.kind, "seat");
  assert.equal(said.seat, "fix-login");
  assert.equal(said.prompt.text, "also check the tests");
  assert.equal(text.parsePromptLink("hive://seat/fix-login"), null);
  assert.equal(text.parsePromptLink("hive://shelf/some-page"), null);
  assert.equal(text.parsePromptLink("https://example.com/new?prompt=x"), null);
});

test("a built link reads back to the same prompt, and an empty or oversized prompt gives no link", () => {
  const built = text.buildPromptLink({ prompt: "  ship it & tell #eng  ", repo: { owner: "o", name: "r" }, provider: "codex", model: "gpt-6" });
  assert.match(built, /^hive:\/\/new\?/);
  const back = text.parsePromptLink(built);
  assert.equal(back.prompt.text, "ship it & tell #eng");
  assert.deepEqual(back.repo, { owner: "o", name: "r" });
  assert.equal(back.provider, "codex");
  assert.equal(back.model, "gpt-6");
  assert.equal(text.buildPromptLink({ prompt: "   " }), "");
  assert.equal(text.buildPromptLink({ prompt: "x".repeat(text.PROMPT_LINK_MAX + 1) }), "");
  assert.doesNotMatch(text.buildPromptLink({ prompt: "x", model: "opus" }), /model=/, "a model without its provider is left out");
});

test("opening a new-chat link puts the clean prompt in a draft and sends nothing", async () => {
  hive();
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push(String(url));
    return { ok: true, json: async () => ({ ok: true, models: [] }) };
  };
  assert.equal(openPromptLink(link({ prompt: `look at ${hiddenSpace}the queue` })), true);
  const [d] = drafts.values();
  assert.ok(d, "no draft opened");
  assert.equal(d.e.host.querySelector("textarea").value, "look at the queue");
  assert.ok(!asked.some((url) => url.includes("/api/spawn")), "the link sent the prompt on its own");
  await new Promise((later) => setTimeout(later, 0));
  assert.match($("hud").textContent, /hidden characters/, "the person was not warned about the hidden characters");
  assert.match($("hud").textContent, /removed 1 hidden character\./);
});

test("a link never replaces a draft the person is writing until they say so", async () => {
  hive();
  const d = openDraft("my own words");
  openPromptLink(link({ prompt: "the linked words" }));
  assert.equal(d.e.host.querySelector("textarea").value, "my own words");
  const replace = $("hud").querySelector(".hud-act");
  assert.ok(replace, "no way to replace the draft was offered");
  replace.click();
  assert.equal(d.e.host.querySelector("textarea").value, "the linked words");
  await new Promise((later) => setTimeout(later, 0));
  assert.match($("hud").textContent, /Prompt added from a link/, "the replaced prompt was not announced");
});

test("a broken link is refused out loud and opens nothing", () => {
  hive();
  assert.equal(openPromptLink("hive://new?repo=a/b"), true);
  assert.equal(drafts.size, 0);
  assert.match($("hud").textContent, /no prompt/);
  assert.equal(openPromptLink("https://example.com"), false);
});

test("the palette offers to copy the prompt in focus, and to open a pasted link", () => {
  hive();
  const d = openDraft("summarize the incident");
  st.open = d.key;
  const links = promptLinksOf({ e: d.e, textarea: d.e.host.querySelector("textarea") });
  assert.equal(text.parsePromptLink(links.plain).prompt.text, "summarize the incident");
  const names = promptLinkPaletteRows().map((row) => row.name);
  assert.ok(names.includes("Copy prompt link"), names.join(", "));
  $("pal-q").value = link({ prompt: "pasted" });
  assert.equal(promptLinkOpenRow().name, "Open prompt link");
  $("pal-q").value = "";
  assert.equal(promptLinkOpenRow(), null);
});

test("a pasted prompt link is the only row of the palette, so Enter opens it", () => {
  hive();
  $("pal-q").value = link({ prompt: "pasted" });
  const runnable = palModel($("pal-q").value.toLowerCase()).filter((row) => !row.sec);
  assert.deepEqual(runnable.map((row) => row.name), ["Open prompt link"]);
  $("pal-q").value = "";
});

test("the copy with repo and model appears only when the project's GitHub repository is known", () => {
  hive();
  const d = openDraft("x");
  d.e.project = "api-acme";
  d.e.model = "opus";
  const target = { e: d.e, textarea: d.e.host.querySelector("textarea") };
  assert.equal(promptLinksOf(target).rich, "");
  st.prs = [{ repo: "acme/api-acme", number: 1, session: "other" }];
  const rich = text.parsePromptLink(promptLinksOf(target).rich);
  assert.deepEqual(rich.repo, { owner: "acme", name: "api-acme" });
  assert.equal(rich.provider, "claude");
  assert.equal(rich.model, "opus");
});

test("a sent message offers a copy-prompt-link button beside the copy button; a message from another chat does not", () => {
  const e = { mirror: null };
  const bubble = document.createElement("div");
  bubble.className = "sv-user";
  bubble.innerHTML = `<p>deploy the fix</p><div class="sv-stamp"><button class="st-copy"></button></div>`;
  paintPromptLinkButton(e, bubble);
  const button = bubble.querySelector(".st-link");
  assert.ok(button && button.previousElementSibling === bubble.querySelector(".st-copy"));
  assert.equal(button.getAttribute("aria-label"), "Copy prompt link");
  const peer = document.createElement("div");
  peer.className = "sv-user peer";
  peer.innerHTML = `<p>hi</p><div class="sv-stamp"></div>`;
  paintPromptLinkButton(e, peer);
  assert.equal(peer.querySelector(".st-link"), null);
});
