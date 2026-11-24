import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { PAGE_SHIELD, disarmShadowRoots } from "../assets/page-shield.mjs";

const settle = async () => {
  for (let at = 0; at < 4; at++) await new Promise((done) => setTimeout(done, 0));
};

function shieldedPage() {
  const window = new Window({ url: "about:blank", settings: { disableJavaScriptFileLoading: true, disableIframePageLoading: true } });
  window.RTCPeerConnection = function RTCPeerConnection() {};
  window.webkitRTCPeerConnection = window.RTCPeerConnection;
  window.eval(PAGE_SHIELD);
  return window;
}

test("the page loses WebRTC before any of its own code runs", () => {
  const window = shieldedPage();
  assert.equal(window.RTCPeerConnection, undefined);
  assert.equal(window.webkitRTCPeerConnection, undefined);
  window.close();
});

test("every frame the page adds is taken out before it can load", async () => {
  const window = shieldedPage();
  const { document } = window;
  for (const tag of ["iframe", "frame", "object", "embed"]) {
    const frame = document.createElement(tag);
    if (tag === "iframe") frame.setAttribute("src", "https://example.com/");
    document.body.appendChild(frame);
  }
  document.body.insertAdjacentHTML("beforeend", "<div><iframe src='https://example.com/'></iframe></div><p id='kept'>kept</p>");
  await settle();
  assert.equal(document.querySelectorAll("iframe, frame, object, embed").length, 0);
  assert.ok(document.getElementById("kept"), "the rest of the page stays");
  window.close();
});

test("a frame hidden in a shadow root the page opened is taken out too, and the root cannot be copied out of sight", async () => {
  const window = shieldedPage();
  const { document } = window;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "closed", clonable: true });
  assert.equal(root.clonable, false, "a cloned host would carry a root the shield never saw");
  root.appendChild(document.createElement("iframe"));
  await settle();
  assert.equal(root.querySelectorAll("iframe").length, 0);
  window.close();
});

test("the ways to build a shadow root the shield cannot watch are switched off", () => {
  const window = shieldedPage();
  assert.equal(window.document.write, undefined);
  assert.equal(window.document.writeln, undefined);
  assert.equal(window.Element.prototype.setHTMLUnsafe, undefined);
  assert.equal(window.Document.parseHTMLUnsafe, undefined);
  assert.throws(() => { window.Element.prototype.attachShadow = () => null; }, "the page cannot swap the watched attachShadow back");
  window.close();
});

test("declarative shadow roots in the page source become plain templates", () => {
  assert.equal(disarmShadowRoots('<div><template ShadowRootMode="closed"><iframe></iframe></template></div>'), '<div><template data-shadowrootmode="closed"><iframe></iframe></template></div>');
  assert.equal(disarmShadowRoots(null), "");
  assert.equal(disarmShadowRoots("<p>plain</p>"), "<p>plain</p>");
});
