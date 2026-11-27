import { test } from "node:test";
import { assert, composerOf, drawerOf, fakeTerminal, lay, net, pool, read, render, saved, settle, st, tileOf, toggleKeys } from "./chat-terminal-harness.mjs";

const HOST = "rita@devbox";
const onHost = (name, extra = {}) => ({ name, where: "cloud", host: HOST, kind: "chat", structured: true, model: "Opus 5.5", state: "done", title: name, agent: "claude", cwd: "/home/rita/Projects/hub", trees: [], ...extra });

lay();
st.data.sessions = [...st.data.sessions.filter((one) => one.name !== "bea"), onHost("eva")];
st.blocks[0].keys = ["ada", "cid", "eva"];
render();
read("eva");

const bar = (name) => tileOf(name).querySelector('.chat-ctl [data-act="chat-terminal"]');
const killButton = (name) => drawerOf(name).querySelector('[data-act="ct-kill"]');

test("a chat on an ssh host has the terminal button on, and its shell is asked on that host, in the chat's folder", async () => {
  assert.ok(bar("eva") && !bar("eva").disabled, "the button is live for a chat on a host");
  toggleKeys(composerOf("eva"));
  await settle();
  assert.ok(drawerOf("eva") && !drawerOf("eva").hidden, "the drawer opens");
  assert.equal(net.shells.length, 1);
  assert.deepEqual({ ...net.shells[0], name: "" }, { where: "cloud", name: "", of: "eva", cwd: "/home/rita/Projects/hub", host: HOST });
  assert.equal(drawerOf("eva").querySelector(".ct-well > .host"), pool.get("eva-terminal").host);
  assert.equal(saved().eva.active, "eva-terminal");
});

test("the shell of a chat on a host is kept while that host lists it, and one on this machine with the same owner is not taken for it", async () => {
  fakeTerminal("eva-elsewhere");
  st.data.sessions.push({ name: "eva-terminal", where: "cloud", host: HOST, kind: "shell", of: "eva", state: "idle", title: "Terminal", trees: [] });
  st.data.sessions.push({ name: "eva-elsewhere", where: "local", kind: "shell", of: "eva", state: "idle", title: "Terminal", trees: [] });
  try {
    render();
    await settle();
    assert.deepEqual(saved().eva.terminals.map((one) => one.name), ["eva-terminal"]);
  } finally {
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "eva-elsewhere");
    pool.delete("eva-elsewhere");
  }
});

test("closing the terminal of a chat on a host closes it on that host", async () => {
  killButton("eva").click();
  await settle();
  assert.deepEqual(net.kills.at(-1), { name: "eva-terminal", where: "cloud", host: HOST });
  assert.ok(drawerOf("eva").hidden);
  st.data.sessions = st.data.sessions.filter((one) => one.name !== "eva-terminal");
  render();
  await settle();
});

test("a chat on the team's server still has no terminal of its own", async () => {
  read("cid");
  await settle();
  const button = bar("cid");
  if (button) assert.ok(button.disabled);
  const before = net.shells.length;
  toggleKeys();
  await settle();
  assert.equal(net.shells.length, before);
  assert.ok(!drawerOf("cid"));
  read("ada");
  await settle();
});
