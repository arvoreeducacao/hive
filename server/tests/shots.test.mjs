import { test } from "node:test";
import assert from "node:assert";
import { unpackShots, shotFile, shotsToForget } from "../engine/protocol.mjs";

const shotEvent = (data, media = "image/png", id = "toolu_01", note = "the tab as it stands") => ({
  type: "user",
  message: {
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: id,
      content: [
        { type: "image", source: { type: "base64", media_type: media, data } },
        { type: "text", text: note }
      ]
    }]
  }
});

test("a picture handed back by a tool becomes a file the hive can open", () => {
  const { event, shots } = unpackShots(shotEvent("QUJD"), "/tmp/hive/shots/seat");
  assert.deepStrictEqual(shots, [{ path: "/tmp/hive/shots/seat/toolu_01-0.png", data: "QUJD" }]);
  const [picture, note] = event.message.content[0].content;
  assert.deepStrictEqual(picture, { type: "image", media_type: "image/png", path: "/tmp/hive/shots/seat/toolu_01-0.png" });
  assert.deepStrictEqual(note, { type: "text", text: "the tab as it stands" });
});

test("the megabyte of base64 does not go into the log", () => {
  const fat = shotEvent("A".repeat(600000));
  const { event } = unpackShots(fat, "/tmp/hive/shots/seat");
  assert.ok(JSON.stringify(event).length < 400);
  assert.strictEqual(fat.message.content[0].content[0].source.data.length, 600000, "the event that came in is left alone");
});

test("the name of the file says which picture of which call it is", () => {
  assert.strictEqual(shotFile("toolu_9", 0, "image/png"), "toolu_9-0.png");
  assert.strictEqual(shotFile("toolu_9", 2, "image/jpeg"), "toolu_9-2.jpg");
  assert.strictEqual(shotFile("toolu_9", 0, ""), "toolu_9-0.png");
  assert.strictEqual(shotFile("../../etc/passwd", 0, "image/png"), ".._.._etc_passwd-0.png");
});

test("a call with no id still lands somewhere of its own", () => {
  const loose = { type: "user", message: { role: "user", content: [{ type: "tool_result", content: [{ type: "image", source: { type: "base64", media_type: "image/webp", data: "QQ" } }] }] } };
  const { shots } = unpackShots(loose, "/tmp/shots", 42);
  assert.deepStrictEqual(shots.map((s) => s.path), ["/tmp/shots/seq42-0.webp"]);
});

test("an event with nothing to unpack is handed straight back", () => {
  const plain = { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } };
  const { event, shots } = unpackShots(plain, "/tmp/shots");
  assert.strictEqual(event, plain);
  assert.deepStrictEqual(shots, []);
  assert.strictEqual(unpackShots({ type: "result" }, "/tmp/shots").event.type, "result");
});

test("a picture the model sent is not a picture a tool handed back", () => {
  const asked = { type: "user", message: { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "QQ" } }] } };
  assert.deepStrictEqual(unpackShots(asked, "/tmp/shots").shots, []);
});

test("a picture that is only a link is left as it came", () => {
  const linked = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: [{ type: "image", source: { type: "url", url: "https://x/y.png" } }] }] } };
  const { event, shots } = unpackShots(linked, "/tmp/shots");
  assert.deepStrictEqual(shots, []);
  assert.strictEqual(event.message.content[0].content[0].source.type, "url");
});

test("the seat forgets its oldest shots first", () => {
  const files = [
    { name: "a.png", at: 300 },
    { name: "b.png", at: 100 },
    { name: "c.png", at: 200 }
  ];
  assert.deepStrictEqual(shotsToForget(files, 2), ["b.png"]);
  assert.deepStrictEqual(shotsToForget(files, 3), []);
  assert.deepStrictEqual(shotsToForget(files, 0), ["a.png", "c.png", "b.png"]);
});

test("the copy of the result the sdk repeats points at the same file", () => {
  const both = {
    ...shotEvent("QUJD"),
    tool_use_result: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
      { type: "text", text: "the tab as it stands" }
    ]
  };
  const { event, shots } = unpackShots(both, "/tmp/shots");
  assert.strictEqual(shots.length, 1, "one picture is one file, however many times the sdk repeats it");
  assert.strictEqual(event.tool_use_result[0].path, "/tmp/shots/toolu_01-0.png");
  assert.strictEqual(event.message.content[0].content[0].path, "/tmp/shots/toolu_01-0.png");
  assert.ok(!JSON.stringify(event).includes("QUJD"));
});

test("two calls landing at once leave the repeated copy alone", () => {
  const pair = {
    type: "user",
    message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "a", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "QQ" } }] },
      { type: "tool_result", tool_use_id: "b", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "Qg" } }] }
    ] },
    tool_use_result: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "QQ" } }]
  };
  const { event, shots } = unpackShots(pair, "/tmp/shots");
  assert.deepStrictEqual(shots.map((s) => s.path), ["/tmp/shots/a-0.png", "/tmp/shots/b-0.png"]);
  assert.strictEqual(event.tool_use_result[0].source.type, "base64", "with two calls there is no telling which one it repeats");
});
