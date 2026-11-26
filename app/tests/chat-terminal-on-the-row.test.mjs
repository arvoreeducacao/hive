import { test } from "node:test";
import { assert, drawerOf, fakeTerminal, lay, net, render, saved, settle, st } from "./chat-terminal-harness.mjs";
import { app } from "./dom.mjs";

const mirror = await app("mirror");

lay("classic");

const shell = (name, of, foreground = "") => ({ name, where: "local", kind: "shell", of, state: "idle", title: "Terminal", trees: [], ...(foreground ? { foreground } : {}) });

const rowOf = (name) => mirror.railViewModel().groups.flatMap((group) => group.items).find((one) => one.key === name);

const iconOf = (name) => document.querySelector(`#rail .item[data-name="${name}"] .rterm`);

function withShells(...shells) {
  for (const one of shells) fakeTerminal(one.name);
  st.data.sessions = [...st.data.sessions.filter((one) => one.kind !== "shell"), ...shells];
  render();
}

test("a chat whose terminal runs something gets a terminal icon on its row, and an idle shell gets none", async () => {
  withShells(shell("ada-idle", "ada"), shell("bea-idle", "bea"));
  await settle();
  assert.equal(rowOf("ada").term, null);
  assert.equal(iconOf("ada"), null);
  withShells(shell("ada-idle", "ada"), shell("ada-dev", "ada", "node"), shell("bea-idle", "bea"));
  await settle();
  assert.match(rowOf("ada").term.say, /^node (running in the terminal|rodando no terminal)$/);
  assert.equal(rowOf("bea").term, null, "the chat next to it keeps a plain row");
  const icon = iconOf("ada");
  assert.ok(icon, "the row shows the icon");
  assert.equal(icon.getAttribute("aria-label"), rowOf("ada").term.say);
  assert.equal(iconOf("bea"), null);
});

test("two running terminals are counted, with what each one runs", () => {
  withShells(shell("ada-dev", "ada", "node"), shell("ada-db", "ada", "docker"));
  assert.match(rowOf("ada").term.say, /^2 (terminals running|terminais rodando): node, docker$/);
});

test("a click on the icon opens the chat with its drawer on the terminal that runs something", async () => {
  withShells(shell("ada-idle", "ada"), shell("ada-dev", "ada", "node"));
  st.open = null;
  render();
  await settle();
  const before = net.shells.length;
  iconOf("ada").click();
  await settle();
  await settle();
  const drawer = drawerOf("ada");
  assert.ok(drawer && !drawer.hidden, "the drawer is open");
  assert.equal(saved().ada.active, "ada-dev", "on the terminal that runs something");
  assert.equal(net.shells.length, before, "no new shell is opened");
});

test("off the raycast look the tile header carries the same icon, and its click opens the terminal that runs something", async () => {
  const { tiles } = await app("leader-key");
  const wear = (next) => {
    document.body.classList.toggle("experience-raycast", !next);
    document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: next ? "current" : "raycast", was: next ? "raycast" : "current" } }));
  };
  wear(true);
  try {
    withShells(shell("ada-idle", "ada"), shell("ada-dev", "ada", "vite"), shell("bea-idle", "bea"));
    st.open = null;
    render();
    await settle();
    const icon = tiles.get("ada").querySelector(".t-term");
    assert.ok(icon && !icon.hidden, "the header of the chat shows the icon");
    assert.match(icon.title, /^vite (running in the terminal|rodando no terminal)$/);
    assert.equal(icon.getAttribute("aria-label"), icon.title);
    assert.ok(tiles.get("bea").querySelector(".t-term").hidden, "a chat with an idle shell shows none");
    icon.click();
    await settle();
    await settle();
    assert.ok(!drawerOf("ada").hidden);
    assert.equal(saved().ada.active, "ada-dev");
  } finally {
    wear(false);
  }
});
