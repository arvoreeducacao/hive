(function (root) {
  const REGION_LABEL = /caption|legenda|subt[ií]tulo|untertitel|sous-titres|sottotitoli/i;
  const REGION_KNOWN = '[jsname="dsyhDe"], .a4cQT, .iOzk7';
  const BLOCK_KNOWN = ".nMcdL, .TBMuR";
  const SPEAKER_KNOWN = ".NWpY1d, .zs7s8d, .KcIKyf";
  const TEXT_KNOWN = ".ygicle, .iTTPOb, .bh44bd";
  const TURN_ON = /(turn on|ativar|activar|aktivieren|activer|attiva).{0,24}(caption|legenda|subt|untertitel|sous-titres|sottotitoli)/i;
  const TURN_OFF = /(turn off|desativar|desactivar|deaktivieren|d[ée]sactiver|disattiva).{0,24}(caption|legenda|subt|untertitel|sous-titres|sottotitoli)/i;
  const SPEAKER_MAX = 80;

  const clean = (text) => String(text || "").replace(/\s+/g, " ").trim();

  const isControl = (el) => !!el.closest && !!el.closest('button, [role="button"], [role="menu"], [role="dialog"]');

  function findRegion(doc) {
    for (const el of doc.querySelectorAll('[role="region"][aria-label], [aria-live][aria-label]')) {
      if (REGION_LABEL.test(el.getAttribute("aria-label") || "")) return el;
    }
    return doc.querySelector(REGION_KNOWN);
  }

  function textOf(el) {
    let said = "";
    const walk = (node) => {
      if (node.nodeType === 3) { said += node.nodeValue; return; }
      if (node.nodeType !== 1 || isControl(node) || node.tagName === "IMG" || node.tagName === "SVG" || node.tagName === "svg") return;
      for (const child of node.childNodes) walk(child);
      said += " ";
    };
    walk(el);
    return clean(said);
  }

  function blocksOf(region) {
    const known = [...region.querySelectorAll(BLOCK_KNOWN)];
    if (known.length) return known;
    const byFace = [];
    for (const face of region.querySelectorAll("img")) {
      if (isControl(face)) continue;
      let named = face.parentElement;
      while (named && named !== region && !textOf(named)) named = named.parentElement;
      if (!named || named === region) continue;
      const name = textOf(named);
      let block = named;
      while (block && block !== region && textOf(block).length <= name.length) block = block.parentElement;
      if (!block || block === region || block.querySelectorAll("img").length !== 1) continue;
      if (!byFace.includes(block)) byFace.push(block);
    }
    if (byFace.length || region.querySelector("img")) return byFace;
    let at = region;
    for (let depth = 0; depth < 6; depth++) {
      const kids = [...at.children].filter((kid) => !isControl(kid) && textOf(kid));
      if (kids.length !== 1) return kids;
      at = kids[0];
    }
    return [at];
  }

  function readBlock(block) {
    const whole = textOf(block);
    if (!whole) return null;
    const named = block.querySelector(SPEAKER_KNOWN);
    const worded = block.querySelector(TEXT_KNOWN);
    if (named && worded) return { speaker: clean(named.textContent).slice(0, SPEAKER_MAX), text: textOf(worded) };
    let speaker = named ? clean(named.textContent) : "";
    if (!speaker) {
      const parts = [...block.children].map((kid) => textOf(kid)).filter(Boolean);
      const first = parts.length > 1 ? parts[0] : "";
      if (first && first.length <= SPEAKER_MAX && whole.startsWith(first)) speaker = first;
    }
    const text = worded ? textOf(worded) : speaker && whole.startsWith(speaker) ? clean(whole.slice(speaker.length)) : whole;
    return text ? { speaker: speaker.slice(0, SPEAKER_MAX), text } : null;
  }

  function readCaptions(doc) {
    const region = findRegion(doc);
    if (!region) return { on: false, region: null, blocks: [] };
    const blocks = [];
    for (const el of blocksOf(region)) {
      const read = readBlock(el);
      if (read) blocks.push({ el, ...read });
    }
    return { on: true, region, blocks };
  }

  function captionButton(doc) {
    let on = null;
    let off = null;
    for (const el of doc.querySelectorAll("button[aria-label], [role='button'][aria-label]")) {
      const label = el.getAttribute("aria-label") || "";
      if (!on && TURN_ON.test(label)) on = el;
      if (!off && TURN_OFF.test(label)) off = el;
    }
    return { turnOn: on, turnOff: off };
  }

  const inCall = (doc) => !!doc.querySelector('[data-call-ended], [jsname="CQylAd"], button[aria-label*="call" i], button[aria-label*="chamada" i], button[aria-label*="llamada" i]');

  const api = { findRegion, readCaptions, readBlock, blocksOf, captionButton, inCall, clean };
  root.HiveCaptions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
