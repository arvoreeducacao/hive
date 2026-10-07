import { test } from "node:test";
import assert from "node:assert";
import { app } from "./dom.mjs";

const images = await app("session-images");
const { imagesInLine, wrappedLineAt, shotOfInput, shotsOfTool, shotsOfResult, resultText } = images;

const nullCell = () => ({
  chars: "",
  width: 1,
  getChars() { return this.chars; },
  getWidth() { return this.width; }
});

const termOf = (rows) => {
  const lines = rows.map((row) => ({
    length: row.text.length,
    isWrapped: !!row.wrapped,
    getCell(col, out) {
      out.chars = row.text[col] ?? "";
      out.width = out.chars === "" ? 0 : 1;
    }
  }));
  return { buffer: { active: { getLine: (i) => lines[i], getNullCell: nullCell } } };
};

const pathsIn = (text) => imagesInLine(text).map((h) => h.path);

test("an absolute path to a png is an image", () => {
  assert.deepStrictEqual(pathsIn("wrote /workspace/repos/hub/shot.png"), ["/workspace/repos/hub/shot.png"]);
});

test("punctuation around the path stays out of it", () => {
  assert.deepStrictEqual(pathsIn("see docs/hive.png, then stop."), ["docs/hive.png"]);
});

test("a path under the home folder counts", () => {
  assert.deepStrictEqual(pathsIn("~/Desktop/tela-2.jpeg is the print"), ["~/Desktop/tela-2.jpeg"]);
});

test("two images on the same line are two links", () => {
  assert.deepStrictEqual(pathsIn("a.png and out/b.webp"), ["a.png", "out/b.webp"]);
});

test("an image url is left to the link addon", () => {
  assert.deepStrictEqual(pathsIn("https://example.dev/logo.png"), []);
});

test("a file that is not an image is not offered", () => {
  assert.deepStrictEqual(pathsIn("/workspace/repos/hub/app/server.mjs"), []);
});

test("a path broken across the wrap is read whole", () => {
  const term = termOf([{ text: "look at /work" }, { text: "space/a.png", wrapped: true }]);
  const line = wrappedLineAt(term, 1);
  assert.strictEqual(line.text, "look at /workspace/a.png");
  const [hit] = imagesInLine(line.text);
  assert.strictEqual(hit.path, "/workspace/a.png");
  assert.deepStrictEqual(line.at[hit.from], { row: 0, col: 8 });
  assert.deepStrictEqual(line.at[hit.to], { row: 1, col: 10 });
});

test("hovering the second row of a wrap reads the same line", () => {
  const term = termOf([{ text: "look at /work" }, { text: "space/a.png", wrapped: true }]);
  assert.strictEqual(wrappedLineAt(term, 2).text, "look at /workspace/a.png");
});

test("a row that does not exist has no line", () => {
  assert.strictEqual(wrappedLineAt(termOf([{ text: "x" }]), 9), null);
});

test("a read of a png offers the file it read", () => {
  assert.strictEqual(shotOfInput({ file_path: "/workspace/shots/card.png" }), "/workspace/shots/card.png");
});

test("a read of source offers nothing", () => {
  assert.strictEqual(shotOfInput({ file_path: "/workspace/app/server.mjs" }), "");
});

test("a pattern that looks like an image is not a file to open", () => {
  assert.strictEqual(shotOfInput({ pattern: "*.png", path: "/workspace" }), "");
});

test("a short result that names a picture offers it too", () => {
  assert.deepStrictEqual(shotsOfTool("", "saved the shot to /tmp/tela.png"), ["/tmp/tela.png"]);
});

test("the file that was read comes before what the result names", () => {
  assert.deepStrictEqual(
    shotsOfTool("/workspace/a.png", "compare with /workspace/b.png"),
    ["/workspace/a.png", "/workspace/b.png"]
  );
});

test("the same path twice is one picture", () => {
  assert.deepStrictEqual(shotsOfTool("/workspace/a.png", "read /workspace/a.png"), ["/workspace/a.png"]);
});

test("a card holds at most two pictures", () => {
  assert.strictEqual(shotsOfTool("", "a.png b.png c.png d.png").length, 2);
});

test("a long dump that mentions a png is not offering one", () => {
  const dump = "import logo from '../logo.png';\n" + "x".repeat(500);
  assert.deepStrictEqual(shotsOfTool("", dump), []);
});

test("a result of an image read leaves the note out of the count", () => {
  const note = "[Image: original 2880x1800, displayed at 2000x1250. Multiply coordinates by 1.44.]";
  assert.deepStrictEqual(shotsOfTool("/workspace/card.png", note), ["/workspace/card.png"]);
});

const handed = (...paths) => paths.map((path) => ({ type: "image", media_type: "image/png", path }));

test("a picture the tool handed back is the picture the card shows", () => {
  const content = [...handed("/workspace/hive/shots/seat/t1-0.png"), { type: "text", text: "the tab as it stands" }];
  assert.deepStrictEqual(shotsOfTool("", "the tab as it stands", content), ["/workspace/hive/shots/seat/t1-0.png"]);
});

test("a tool that hands back a strip of frames shows the strip", () => {
  const content = handed("a.png", "b.png", "c.png", "d.png");
  assert.deepStrictEqual(shotsOfTool("", "", content).length, 4);
});

test("what the tool handed back beats a path guessed out of its text", () => {
  const content = handed("/shots/t1-0.png");
  assert.deepStrictEqual(shotsOfTool("", "saved a copy at /tmp/other.png", content), ["/shots/t1-0.png"]);
});

test("a read of a picture still shows the file that was read, not the copy", () => {
  const content = handed("/shots/t1-0.png");
  assert.deepStrictEqual(shotsOfTool("/workspace/card.png", "[Image: 800x600]", content), ["/workspace/card.png"]);
});

test("a result of nothing but a picture leaves no body to read", () => {
  assert.strictEqual(resultText(handed("/shots/t1-0.png")), "");
});

test("the note next to the picture is still the body", () => {
  const content = [...handed("/shots/t1-0.png"), { type: "text", text: "1280x800, tab 3" }];
  assert.strictEqual(resultText(content), "1280x800, tab 3");
});

test("a picture with no file behind it is still announced in the body", () => {
  assert.strictEqual(resultText([{ type: "image" }]), "[image]");
  assert.deepStrictEqual(shotsOfResult([{ type: "image" }]), []);
});

test("a result that is plain text is left alone", () => {
  assert.strictEqual(resultText("ok, 3 rows"), "ok, 3 rows");
  assert.strictEqual(resultText(undefined), "");
});

const { shotsOfSaid } = await app("session-images");

test("a file:// address in what the model said is the same picture as its path", () => {
  assert.deepStrictEqual(shotsOfSaid("o print ficou em file:///Users/mateus/.hive/shots/x/card.png"), ["/Users/mateus/.hive/shots/x/card.png"]);
});

test("a file:// address with escaped spaces is unescaped before it is read", () => {
  assert.deepStrictEqual(shotsOfSaid("veja file:///tmp/meu%20print.png"), ["/tmp/meu print.png"]);
});

test("a path in backticks and the same path as a markdown image are one picture", () => {
  assert.deepStrictEqual(shotsOfSaid("em `/tmp/a.png`, e ![a](/tmp/a.png)"), ["/tmp/a.png"]);
});

test("a long reply still hands over its pictures, unlike a tool result", () => {
  const long = `${"palavra ".repeat(200)} /tmp/fim.png`;
  assert.deepStrictEqual(shotsOfSaid(long), ["/tmp/fim.png"]);
});

test("a picture on the web is not a local shot", () => {
  assert.deepStrictEqual(shotsOfSaid("https://cdn.dev/logo.png e file://host/x.png"), []);
});

test("a reply shows at most six pictures", () => {
  const many = Array.from({ length: 9 }, (_, i) => `/tmp/p${i}.png`).join(" ");
  assert.strictEqual(shotsOfSaid(many).length, 6);
});

test("a picture the card already shows drops the note that named its file", () => {
  const { withoutImageNotes } = images;
  const said = "the browser pane right now\n[Image: source: /tmp/shots/t1-0.png]";
  assert.strictEqual(withoutImageNotes(said, ["/tmp/shots/t1-0.png"]), "the browser pane right now");
});

test("a note for a picture the card does not show stays", () => {
  const { withoutImageNotes } = images;
  const said = "two shots\n[Image: source: /tmp/a.png]\n[Image: source: /tmp/b.png]";
  assert.strictEqual(withoutImageNotes(said, ["/tmp/a.png"]), "two shots\n[Image: source: /tmp/b.png]");
});

test("with no picture on the card the text is left alone", () => {
  const { withoutImageNotes } = images;
  assert.strictEqual(withoutImageNotes("[Image]", []), "[Image]");
});

test("a result that handed its own picture drops the note even when the note names another copy", () => {
  const { withoutImageNotes } = images;
  const content = [{ type: "text", text: "the browser pane right now" }, { type: "image", path: "/hive/shots/t1-0.png" }, { type: "text", text: "[Image: source: /Users/me/.claude/blob.png]" }];
  const said = "the browser pane right now\n[Image: source: /Users/me/.claude/blob.png]";
  assert.strictEqual(withoutImageNotes(said, ["/hive/shots/t1-0.png"], content), "the browser pane right now");
});

test("the bare [image] stand-in goes once the card shows the picture", () => {
  const { withoutImageNotes } = images;
  assert.strictEqual(withoutImageNotes("pane\n[image]\n[Image: source: /tmp/a.png]", ["/tmp/a.png"]), "pane");
});

test("a card with one picture drops one note, not the notes of pictures it could not show", () => {
  const { withoutImageNotes } = images;
  const content = [{ type: "image", path: "/hive/shots/t1-0.png" }];
  const said = "two shots\n[Image: source: /a.png]\n[Image: source: /b.png]";
  assert.strictEqual(withoutImageNotes(said, ["/hive/shots/t1-0.png"], content), "two shots\n[Image: source: /b.png]");
});

test("output with nothing to drop keeps its leading indent", () => {
  const { withoutImageNotes } = images;
  assert.strictEqual(withoutImageNotes("    aligned\n  table", ["/tmp/a.png"]), "    aligned\n  table");
});
