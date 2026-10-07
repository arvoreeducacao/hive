import { test } from "node:test";
import assert from "node:assert";
import { mrkdwnHtml, messageHtml, previewOf, emojiOf } from "../assets/slack-text.mjs";

const who = {
  users: { U1: "Clari Brasil", U2: "Marcelle Lima" },
  channels: { C1: "eng-prs" }
};

test("a mention becomes the person's name, not the id", () => {
  assert.match(mrkdwnHtml("oi <@U1>, tudo bem?", who), /<span class="s-at">@Clari Brasil<\/span>/);
  assert.match(mrkdwnHtml("oi <@U9>", who), /<span class="s-at">@U9<\/span>/);
});

test("a channel reference keeps its hash and its name", () => {
  assert.match(mrkdwnHtml("veja <#C1|eng-prs>", who), /<span class="s-at">#eng-prs<\/span>/);
  assert.match(mrkdwnHtml("veja <#C1>", who), /<span class="s-at">#eng-prs<\/span>/);
});

test("a link keeps its label and only http, mailto and tel open", () => {
  assert.match(mrkdwnHtml("<https://x.com/a|texto>", who), /<a href="https:\/\/x\.com\/a"[^>]*>texto<\/a>/);
  assert.match(mrkdwnHtml("<https://y.com>", who), /<a href="https:\/\/y\.com"[^>]*>https:\/\/y\.com<\/a>/);
  const nasty = mrkdwnHtml("<javascript:alert(1)|clique>", who);
  assert.ok(!nasty.includes("<a "), "a javascript: url must not become a link");
});

test("markup and emoji come out as html, not as slack syntax", () => {
  const out = mrkdwnHtml("*forte* _torto_ ~riscado~ `codigo` :eyes:", who);
  assert.match(out, /<b>forte<\/b>/);
  assert.match(out, /<i>torto<\/i>/);
  assert.match(out, /<s>riscado<\/s>/);
  assert.match(out, /<code class="s-code">codigo<\/code>/);
  assert.match(out, /<span class="s-emo">👀<\/span>/);
});

test("a quote and a code block survive as blocks", () => {
  assert.match(mrkdwnHtml("&gt; citando", who), /<blockquote>citando<\/blockquote>/);
  assert.match(mrkdwnHtml("```const a = 1 < 2```", who), /<pre>const a = 1 &lt; 2<\/pre>/);
});

test("nothing a person writes can inject html", () => {
  const out = mrkdwnHtml('<img src=x onerror=alert(1)> "aspas"', who);
  assert.ok(!out.includes("<img"), "a raw tag must stay text");
  assert.match(out, /&lt;img/);
});

test("rich text blocks win over the plain text of the same message", () => {
  const message = {
    text: "ignorado",
    blocks: [{
      type: "rich_text",
      elements: [{
        type: "rich_text_section",
        elements: [
          { type: "text", text: "olha ", style: { bold: true } },
          { type: "user", user_id: "U2" }
        ]
      }]
    }]
  };
  const out = messageHtml(message, who);
  assert.match(out, /<b>olha <\/b>/);
  assert.match(out, /@Marcelle Lima/);
  assert.ok(!out.includes("ignorado"));
});

test("a message with no blocks falls back to its text", () => {
  assert.match(messageHtml({ text: "só texto" }, who), /<p>só texto<\/p>/);
  assert.strictEqual(messageHtml({ text: "" }, who), "");
});

test("the preview is one plain line, with names and without syntax", () => {
  const line = previewOf({ text: ":point_right: <https://gh/pr|PR> para *X* <@U1>\nsegunda linha" }, who);
  assert.strictEqual(line, "👉 PR para X @Clari Brasil segunda linha");
});

test("a message with only files still says something", () => {
  assert.strictEqual(previewOf({ text: "", files: [{ id: "a" }] }, who), "a file");
  assert.strictEqual(previewOf({ text: "", files: [{ id: "a" }, { id: "b" }] }, who), "2 files");
  assert.strictEqual(previewOf({ text: "" }, who), "");
});

test("emoji names resolve, with skin tone only where a hand can carry it", () => {
  assert.strictEqual(emojiOf("white_check_mark"), "✅");
  assert.strictEqual(emojiOf("+1::skin-tone-4"), "👍🏽");
  assert.strictEqual(emojiOf("eyes::skin-tone-4"), "👀");
  assert.strictEqual(emojiOf("a_name_slack_invented"), "");
});

test("the address of a published page becomes a link, and carries the tab and the version", () => {
  const html = mrkdwnHtml(":point_right: <hive://shelf/guarda-roupa-do-avatar-do-hive?tab=documento&amp;v=2|*RFC*> para o guarda-roupa", who);
  assert.match(html, /class="md-shelf"/);
  assert.match(html, /data-slug="guarda-roupa-do-avatar-do-hive"/);
  assert.match(html, /data-tab="documento"/);
  assert.match(html, /data-v="2"/);
  assert.doesNotMatch(html, /target="_blank"/, "a page of this team's does not leave for the browser");
});

test("a page link in rich text keeps its bold and still opens here", () => {
  const blocks = [{
    type: "rich_text",
    elements: [{
      type: "rich_text_section",
      elements: [{ type: "link", url: "hive://shelf/estante?tab=telas#d3", text: "Telas", style: { bold: true } }]
    }]
  }];
  const html = messageHtml({ blocks }, who);
  assert.match(html, /<b><a href="#" class="md-shelf"/);
  assert.match(html, /data-tab="telas"/);
  assert.match(html, /data-at="d3"/);
});

test("what is not a page of this team's keeps leaving for the browser", () => {
  assert.match(mrkdwnHtml("<https://github.com/arvoreeducacao/x/pull/9|PR>", who), /target="_blank"/);
  assert.doesNotMatch(mrkdwnHtml("<hive://app/whatever|nope>", who), /md-shelf/);
  assert.doesNotMatch(mrkdwnHtml("<hive://shelf/|nada>", who), /md-shelf/);
  assert.doesNotMatch(mrkdwnHtml("<javascript:alert(1)|x>", who), /href/);
});
