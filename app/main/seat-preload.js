const { contextBridge, ipcRenderer } = require("electron");

function bridgePasskeys(ask) {
  const container = navigator.credentials;
  if (!container || typeof PublicKeyCredential === "undefined") return;
  const native = { get: container.get.bind(container), create: container.create.bind(container) };
  const toText = (source) => {
    const bytes = ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source);
    let raw = "";
    for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const toBytes = (text) => {
    const plain = text.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(plain + "===".slice((plain.length + 3) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
  };
  const listed = (list) => Array.from(list || [], (one) => ({ type: one.type, id: toText(one.id), transports: one.transports }));
  const wired = (kind, asked) => {
    const out = { ...asked, challenge: toText(asked.challenge) };
    if (kind === "create") {
      out.user = { ...asked.user, id: toText(asked.user.id) };
      out.excludeCredentials = listed(asked.excludeCredentials);
    } else {
      out.allowCredentials = listed(asked.allowCredentials);
    }
    const extensions = asked.extensions || {};
    out.extensions = {};
    if ("credProps" in extensions) out.extensions.credProps = !!extensions.credProps;
    if (typeof extensions.appid === "string") out.extensions.appid = extensions.appid;
    return JSON.parse(JSON.stringify(out));
  };
  const own = (target, values) => {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
    return target;
  };
  const credentialOf = (kind, made) => {
    const said = made.response;
    const response = kind === "get"
      ? own(Object.create(AuthenticatorAssertionResponse.prototype), {
          clientDataJSON: toBytes(said.clientDataJSON),
          authenticatorData: toBytes(said.authenticatorData),
          signature: toBytes(said.signature),
          userHandle: said.userHandle ? toBytes(said.userHandle) : null
        })
      : own(Object.create(AuthenticatorAttestationResponse.prototype), {
          clientDataJSON: toBytes(said.clientDataJSON),
          attestationObject: toBytes(said.attestationObject),
          getTransports: () => said.transports || [],
          getAuthenticatorData: () => (said.authenticatorData ? toBytes(said.authenticatorData) : null),
          getPublicKey: () => (said.publicKey ? toBytes(said.publicKey) : null),
          getPublicKeyAlgorithm: () => said.publicKeyAlgorithm
        });
    return own(Object.create(PublicKeyCredential.prototype), {
      id: made.id,
      rawId: toBytes(made.rawId),
      type: "public-key",
      authenticatorAttachment: made.authenticatorAttachment,
      response,
      getClientExtensionResults: () => made.clientExtensionResults || {},
      toJSON: () => ({ id: made.id, rawId: made.rawId, type: "public-key", authenticatorAttachment: made.authenticatorAttachment, clientExtensionResults: made.clientExtensionResults || {}, response: said })
    });
  };
  const aborted = () => new DOMException("The operation was aborted.", "AbortError");
  const bridged = (kind) => function (options) {
    const asked = options && options.publicKey;
    if (!asked || options.mediation === "conditional") return native[kind](options);
    const signal = options.signal;
    if (signal && signal.aborted) return Promise.reject(aborted());
    return new Promise((resolve, reject) => {
      if (signal) signal.addEventListener("abort", () => reject(aborted()), { once: true });
      let request = null;
      try { request = wired(kind, asked); } catch (err) { return reject(new DOMException(String(err && err.message || err), "NotSupportedError")); }
      ask(kind, request).then((answer) => {
        if (answer && answer.credential) return resolve(credentialOf(kind, answer.credential));
        const why = answer && answer.error || {};
        reject(new DOMException(why.message || "The passkey was not given.", why.name || "NotAllowedError"));
      }, (err) => reject(new DOMException(String(err && err.message || err), "NotAllowedError")));
    });
  };
  Object.defineProperty(container, "get", { value: bridged("get"), configurable: true, writable: true });
  Object.defineProperty(container, "create", { value: bridged("create"), configurable: true, writable: true });
  PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(true);
  PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
  const capabilities = PublicKeyCredential.getClientCapabilities;
  if (typeof capabilities === "function") {
    PublicKeyCredential.getClientCapabilities = () => capabilities.call(PublicKeyCredential).then((known) => ({
      ...known,
      userVerifyingPlatformAuthenticator: true,
      passkeyPlatformAuthenticator: true,
      conditionalGet: false,
      conditionalCreate: false
    }));
  }
}

if (location.protocol === "https:") {
  try {
    contextBridge.executeInMainWorld({
      func: bridgePasskeys,
      args: [(kind, request) => ipcRenderer.invoke("seat-browser:passkey", { kind, options: request })]
    });
  } catch {}
}

let picking = false;
let outline = null;

function box() {
  if (outline) return outline;
  outline = document.createElement("div");
  outline.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #CD694A;background:rgba(205,105,74,.12);border-radius:2px;display:none;transition:all 40ms linear;";
  const tag = document.createElement("div");
  tag.className = "__hive_pick_tag";
  tag.style.cssText = "position:absolute;top:-20px;left:0;font:11px ui-monospace,Menlo,monospace;color:#fff;background:#CD694A;padding:1px 5px;border-radius:2px;white-space:nowrap;";
  outline.appendChild(tag);
  (document.body || document.documentElement).appendChild(outline);
  return outline;
}

function selectorFor(el) {
  if (!el || el.nodeType !== 1) return "";
  if (el.id) return `#${el.id}`;
  const parts = [];
  let node = el;
  for (let depth = 0; node && node.nodeType === 1 && depth < 5; depth++) {
    let part = node.localName;
    if (node.id) { parts.unshift(`#${node.id}`); break; }
    const cls = (node.getAttribute && node.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) part += "." + cls.join(".");
    const parent = node.parentElement;
    if (parent) {
      const sibs = [...parent.children].filter((c) => c.localName === node.localName);
      if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
  }
  return parts.join(" > ");
}

function styleOf(el) {
  const cs = getComputedStyle(el);
  const pick = ["font-family", "font-size", "font-weight", "line-height", "color", "background-color", "padding", "margin", "border-radius", "width", "height", "display"];
  const out = {};
  for (const k of pick) out[k] = cs.getPropertyValue(k);
  return out;
}

function place(el) {
  const b = box();
  const r = el.getBoundingClientRect();
  b.style.left = r.left + "px";
  b.style.top = r.top + "px";
  b.style.width = r.width + "px";
  b.style.height = r.height + "px";
  b.style.display = "block";
  const tag = b.querySelector(".__hive_pick_tag");
  tag.textContent = `${selectorFor(el)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
}

function onMove(ev) {
  if (!picking) return;
  const el = ev.target;
  if (el && el.nodeType === 1 && !outline?.contains(el)) place(el);
}

function frameOf(el) {
  const frame = el.closest ? el.closest(".frame[id]") : null;
  if (!frame) return { frame: "", name: "", x: 0, y: 0 };
  const box = frame.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const label = frame.querySelector(".frame-label");
  return {
    frame: frame.id,
    name: frame.getAttribute("data-name") || (label ? label.textContent.trim() : "") || frame.id,
    x: box.width ? Math.min(1, Math.max(0, (r.left + r.width / 2 - box.left) / box.width)) : 0,
    y: box.height ? Math.min(1, Math.max(0, (r.top + r.height / 2 - box.top) / box.height)) : 0
  };
}

function pickedFrom(el) {
  const r = el.getBoundingClientRect();
  return {
    ...frameOf(el),
    selector: selectorFor(el),
    elAt: (el.closest && el.closest("[data-el]") || el).getAttribute?.("data-el") || "",
    tag: el.localName,
    text: String(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
    rect: { x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), width: Math.ceil(r.width), height: Math.ceil(r.height) },
    styles: styleOf(el),
    url: location.href,
    title: document.title || ""
  };
}

function onClick(ev) {
  if (!picking) return;
  const el = ev.target;
  if (!el || el.nodeType !== 1) return;
  if (el.closest && el.closest(".__hive_ask, .__hive_pins, .__hive_pin, .__hive_who, .__hive_quote")) return;
  ev.preventDefault();
  ev.stopPropagation();
  setPicking(false);
  openAsk(pickedFrom(el), []);
}

function setPicking(on) {
  picking = on;
  const b = box();
  b.style.display = on ? "block" : "none";
  try { document.documentElement.style.cursor = on ? "crosshair" : ""; } catch {}
}

ipcRenderer.on("hive-pick-mode", (_e, on) => setPicking(!!on));
addEventListener("mousemove", onMove, true);
addEventListener("click", onClick, true);
addEventListener("keydown", (e) => { if (picking && e.key === "Escape") { e.preventDefault(); setPicking(false); ipcRenderer.sendToHost("hive-pick-cancel", {}); } }, true);

const ASK_CEILING = 2000;

const FACE = "ui-monospace,SFMono-Regular,Menlo,monospace";

let ask = null;
let asking = null;
let askLook = null;

const NEXT_ASK = {
  card: "background:#111111;border:1px solid #747b70;border-radius:0;box-shadow:none;color:#e2dac2",
  head: "border-bottom:1px solid #414640",
  at: "color:#ff812e",
  field: "background:#080909;border:1px solid #414640;border-radius:0;color:#e2dac2",
  lead: "background:#ff812e;color:#080909;border:1px solid #ff812e;border-radius:0;padding:5px 12px",
  other: "background:transparent;color:#e2dac2;border:1px solid #747b70;border-radius:0;padding:4px 10px"
};

const onTheShelf = () => location.protocol === "shelf:";
let pins = [];
let pinLayer = null;
let placingPins = 0;

function elementOf(pin) {
  const named = String(pin.elAt || "");
  if (named) {
    const safe = window.CSS && CSS.escape ? CSS.escape(named) : JSON.stringify(named);
    try {
      const found = document.querySelector(`[data-el=${window.CSS && CSS.escape ? `"${safe}"` : safe}]`);
      if (found) return found;
    } catch (err) {}
  }
  if (pin.el) {
    try { return document.querySelector(pin.el); } catch (err) { return null; }
  }
  return null;
}

function askCard() {
  if (ask) return ask;
  ask = document.createElement("div");
  ask.className = "__hive_ask";
  ask.style.cssText = [
    "position:fixed", "z-index:2147483646", "display:none", "width:300px", "max-width:calc(100vw - 16px)",
    `font:12px/1.45 ${FACE}`, "color:#e6e6e6", "background:#1b1b1b", "border:1px solid #3a3a3a",
    "border-radius:8px", "box-shadow:0 16px 40px -18px rgba(0,0,0,.95)", "overflow:hidden"
  ].join(";");
  ask.innerHTML = [
    '<div class="__hive_ask_head" style="display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #2c2c2c">',
    '<span class="__hive_ask_at" style="flex:1;color:#cd694a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>',
    '<button type="button" class="__hive_ask_shut" style="all:unset;cursor:pointer;color:#8a8a8a;padding:0 2px">×</button>',
    '</div>',
    '<div class="__hive_ask_thread" style="max-height:180px;overflow:auto;padding:0 10px"></div>',
    '<div style="padding:8px 10px 10px">',
    '<textarea rows="3" style="all:unset;display:block;box-sizing:border-box;width:100%;background:#131313;border:1px solid #2c2c2c;border-radius:5px;padding:6px 8px;color:#e6e6e6;font:12px/1.45 ' + FACE + '"></textarea>',
    '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">',
    '<span class="__hive_ask_hint" style="flex:1;color:#7a7a7a;font-size:11px"></span>',
    '<button type="button" class="__hive_ask_chat" style="all:unset;cursor:pointer;border:1px solid #3a3a3a;border-radius:5px;padding:4px 9px;color:#9c988f">responder no chat</button>',
    '<button type="button" class="__hive_ask_send" style="all:unset;cursor:pointer;background:#cd694a;color:#fff;border-radius:5px;padding:5px 12px">enviar</button>',
    '</div></div>'
  ].join("");
  ask.addEventListener("click", (ev) => ev.stopPropagation());
  ask.addEventListener("mousedown", (ev) => ev.stopPropagation());
  ask.querySelector(".__hive_ask_shut").addEventListener("click", shutAsk);
  ask.querySelector(".__hive_ask_send").addEventListener("click", () => sendAsk("page"));
  ask.querySelector(".__hive_ask_chat").addEventListener("click", () => sendAsk("chat"));
  ask.querySelector("textarea").addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); return shutAsk(); }
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); sendAsk(askLook && !onTheShelf() ? "chat" : "page"); }
  });
  if (askLook) dressAsk(ask);
  document.documentElement.appendChild(ask);
  return ask;
}

function dressAsk(card) {
  card.style.cssText += `;${NEXT_ASK.card}`;
  card.querySelector(".__hive_ask_head").style.cssText += `;${NEXT_ASK.head}`;
  card.querySelector(".__hive_ask_at").style.cssText += `;${NEXT_ASK.at}`;
  card.querySelector("textarea").style.cssText += `;${NEXT_ASK.field}`;
}

function doorsOfAsk(card) {
  if (!askLook) return;
  const shelf = onTheShelf();
  const page = card.querySelector(".__hive_ask_send");
  const chat = card.querySelector(".__hive_ask_chat");
  page.textContent = askLook.page;
  chat.textContent = askLook.chat;
  page.style.display = shelf ? "" : "none";
  page.style.cssText += `;${NEXT_ASK.lead}`;
  chat.style.cssText += `;${shelf ? NEXT_ASK.other : NEXT_ASK.lead}`;
}

function shutAsk() {
  asking = null;
  if (ask) ask.style.display = "none";
  if (outline) outline.style.display = "none";
  ipcRenderer.sendToHost("hive-here", { el: "" });
}

function seatAsk(rect) {
  const card = askCard();
  const w = card.offsetWidth || 300;
  const below = rect.y + rect.height + 8;
  const room = innerHeight - below;
  const top = room > 190 ? below : Math.max(8, rect.y - (card.offsetHeight || 190) - 8);
  card.style.left = `${Math.max(8, Math.min(rect.x, innerWidth - w - 8))}px`;
  card.style.top = `${Math.max(8, top)}px`;
}

function paintThread(said) {
  const host = askCard().querySelector(".__hive_ask_thread");
  host.textContent = "";
  for (const one of said) {
    const line = document.createElement("p");
    line.style.cssText = "margin:8px 0;color:#cfcfcf";
    const who = document.createElement("b");
    who.style.cssText = one.agent ? "color:#cd694a;font-weight:400" : "color:#8a8a8a;font-weight:400";
    who.textContent = `${one.who || "alguém"}: `;
    line.appendChild(who);
    line.appendChild(document.createTextNode(String(one.text || "")));
    host.appendChild(line);
  }
  host.style.display = said.length ? "block" : "none";
}

function openAsk(picked, said, re) {
  asking = { picked, re: re || "" };
  const card = askCard();
  card.querySelector(".__hive_ask_at").textContent = picked.elAt || picked.selector || picked.tag || "";
  card.querySelector(".__hive_ask_hint").textContent = said.length ? (askLook?.reply || "responder") : (askLook?.keys || "⌘↵ envia");
  doorsOfAsk(card);
  card.querySelector("textarea").value = "";
  paintThread(said);
  card.style.display = "block";
  seatAsk(picked.rect);
  card.querySelector("textarea").focus();
  ipcRenderer.sendToHost("hive-here", { el: picked.elAt || picked.selector || "" });
}

function sendAsk(where) {
  if (!asking) return;
  const field = askCard().querySelector("textarea");
  const said = String(field.value || "").trim().slice(0, ASK_CEILING);
  ipcRenderer.sendToHost("hive-ask", { ...asking.picked, said, re: asking.re, where: where === "chat" ? "chat" : "page" });
  shutAsk();
}

function pinHost() {
  if (pinLayer && pinLayer.isConnected) return pinLayer;
  pinLayer = document.createElement("div");
  pinLayer.className = "__hive_pins";
  pinLayer.style.cssText = "position:fixed;inset:0;z-index:2147483645;pointer-events:none";
  document.documentElement.appendChild(pinLayer);
  return pinLayer;
}

function drawPins() {
  const host = pinHost();
  host.textContent = "";
  for (const pin of pins) {
    const el = elementOf(pin);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = "__hive_pin";
    mark.textContent = String(pin.n || "");
    mark.style.cssText = [
      "all:unset", "position:fixed", "pointer-events:auto", "cursor:pointer", "box-sizing:border-box",
      `left:${Math.round(r.left - 9)}px`, `top:${Math.round(r.top - 9)}px`,
      "width:22px", "height:22px", "border-radius:50% 50% 50% 2px",
      `background:${pin.done ? "#5b5b5b" : "#cd694a"}`, "border:2px solid #f5f2ec", "color:#fff",
      `font:600 10px/18px ${FACE}`, "text-align:center", "box-shadow:0 2px 8px rgba(0,0,0,.45)"
    ].join(";");
    mark.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openAsk({ ...pickedFrom(el), elAt: pin.elAt || "", selector: pin.el || selectorFor(el) }, pin.said || [], pin.id);
    }, true);
    host.appendChild(mark);
  }
}

function pinsAgain() {
  if (placingPins) return;
  placingPins = requestAnimationFrame(() => { placingPins = 0; drawPins(); drawWatchers(); });
}

let watchers = [];

function drawWatchers() {
  const host = pinHost();
  for (const old of [...host.querySelectorAll(".__hive_who")]) old.remove();
  for (const one of watchers) {
    if (!one || one.mine || !one.el) continue;
    const el = elementOf({ elAt: one.el, el: one.el });
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const ring = document.createElement("div");
    ring.className = "__hive_who";
    ring.style.cssText = [
      "position:fixed", "pointer-events:none", "border-radius:6px",
      `left:${Math.round(r.left - 3)}px`, `top:${Math.round(r.top - 3)}px`,
      `width:${Math.round(r.width + 6)}px`, `height:${Math.round(r.height + 6)}px`,
      `border:2px solid ${one.colour}`
    ].join(";");
    const tag = document.createElement("div");
    tag.className = "__hive_who";
    tag.textContent = one.dev;
    tag.style.cssText = [
      "position:fixed", "pointer-events:none", "border-radius:3px", "padding:1px 6px",
      `left:${Math.round(r.left - 3)}px`, `top:${Math.round(Math.max(2, r.top - 21))}px`,
      `background:${one.colour}`, "color:#1b1b1b", `font:600 10px/14px ${FACE}`
    ].join(";");
    host.append(ring, tag);
  }
}

ipcRenderer.on("hive-faces", (_e, said) => {
  watchers = Array.isArray(said) ? said : [];
  drawWatchers();
});

ipcRenderer.on("hive-pins", (_e, said) => {
  pins = Array.isArray(said) ? said : [];
  drawPins();
});

addEventListener("scroll", pinsAgain, true);
addEventListener("resize", pinsAgain, true);

const QUOTE_CEILING = 1200;

let quoteBtn = null;
let quoteSaid = "quote";

function quoteButton() {
  if (quoteBtn) return quoteBtn;
  quoteBtn = document.createElement("button");
  quoteBtn.type = "button";
  quoteBtn.className = "__hive_quote";
  quoteBtn.textContent = quoteSaid;
  quoteBtn.style.cssText = [
    "position:fixed", "z-index:2147483647", "display:none", "cursor:pointer",
    "font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace", "color:#e6e6e6",
    "background:#242424", "border:1px solid #3a3a3a", "border-radius:6px",
    "padding:5px 9px", "box-shadow:0 6px 18px -8px rgba(0,0,0,.9)"
  ].join(";");
  quoteBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
  quoteBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const said = readSelection();
    if (!said) return dropQuote();
    ipcRenderer.sendToHost("hive-quote", { said, url: location.href, title: document.title || "" });
    getSelection()?.removeAllRanges();
    dropQuote();
  });
  document.documentElement.appendChild(quoteBtn);
  return quoteBtn;
}

function readSelection() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return "";
  if (quoteBtn && quoteBtn.contains(sel.anchorNode)) return "";
  return String(sel.toString() || "").replace(/\s+/g, " ").trim().slice(0, QUOTE_CEILING);
}

function dropQuote() {
  if (quoteBtn) quoteBtn.style.display = "none";
}

function offerQuote() {
  if (picking) return dropQuote();
  const said = readSelection();
  if (!said) return dropQuote();
  const box = getSelection().getRangeAt(0).getBoundingClientRect();
  if (!box.width && !box.height) return dropQuote();
  const b = quoteButton();
  b.style.display = "block";
  b.style.top = `${Math.max(2, Math.min(box.bottom + 6, innerHeight - 30))}px`;
  b.style.left = `${Math.max(2, Math.min(box.left, innerWidth - 60))}px`;
}

addEventListener("mouseup", () => setTimeout(offerQuote, 0), true);
addEventListener("keyup", (e) => { if (e.shiftKey || e.key.startsWith("Arrow")) setTimeout(offerQuote, 0); }, true);
addEventListener("scroll", dropQuote, true);
ipcRenderer.on("hive-ask-look", (_e, look) => {
  askLook = look && look.next ? { chat: String(look.chat || ""), page: String(look.page || ""), reply: String(look.reply || ""), keys: String(look.keys || "") } : null;
  if (ask) { ask.remove(); ask = null; }
});
ipcRenderer.on("hive-quote-label", (_e, said) => {
  quoteSaid = String(said || "quote").slice(0, 24);
  if (quoteBtn) quoteBtn.textContent = quoteSaid;
});
