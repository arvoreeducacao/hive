import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const posted = [];
let answer = {};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (String(url) === "/api/config" && init?.method === "POST") posted.push(JSON.parse(init.body));
  return Promise.resolve({ ok: true, status: 200, json: async () => answer });
};
after(() => { globalThis.fetch = realFetch; });

const { adoptTerminalShell } = await app("terminal-shell-setting");
const field = document.getElementById("f-shell");
const say = document.getElementById("f-shell-say");
const settle = () => new Promise((done) => setTimeout(done, 20));

test("the settings show the chosen shell next to the terminal font, and an empty field shows the login shell it opens", () => {
  assert.ok(field, "the field lives in the settings");
  assert.equal(field.closest(".pref-pane").dataset.pane, "look", "with the terminal font and size");
  assert.match(field.closest(".set-row").querySelector(".set-says").textContent, /login shell/, "one short line says what an empty field does");
  adoptTerminalShell({ config: { terminalShell: "" }, defaults: { terminalShell: "/bin/zsh" } });
  assert.equal(field.value, "");
  assert.equal(field.placeholder, "/bin/zsh");
  assert.ok(say.hidden, "nothing to say while the shell is fine");
  adoptTerminalShell({ config: { terminalShell: "fish" }, defaults: { terminalShell: "/bin/zsh" } });
  assert.equal(field.value, "fish");
});

test("changing the field saves it, and a refused one keeps what was typed and says why", async () => {
  answer = { config: { terminalShell: "nu" }, defaults: { terminalShell: "/bin/zsh" } };
  field.value = "  nu ";
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  assert.deepEqual(posted.at(-1), { config: { terminalShell: "nu" } });
  assert.equal(field.getAttribute("aria-invalid"), null);
  answer = { config: { terminalShell: "nu" }, defaults: { terminalShell: "/bin/zsh" }, refused: "patch: terminalShell should be a shell" };
  field.value = "$(id)";
  field.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  assert.equal(field.value, "$(id)", "what was typed stays to be fixed");
  assert.equal(field.getAttribute("aria-invalid"), "true");
  assert.equal(say.textContent, "Write the name of a shell, like fish, or its full path.");
  assert.ok(!say.hidden);
});
