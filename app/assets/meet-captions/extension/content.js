(function () {
  const ext = globalThis.browser || globalThis.chrome;
  const read = globalThis.HiveCaptions;
  const tongue = globalThis.AveiaCaptionLanguage;
  const BEAT_MS = 4000;
  const SCAN_MS = 1000;
  const SETTLE_MS = 700;
  const QUEUE_MAX = 4000;
  const LANGUAGE_TRIES = 4;
  const LANGUAGE_GAP_MS = 3500;
  const session = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  const seen = new WeakMap();
  const queue = [];
  let count = 0;
  let recording = false;
  let sending = false;
  let watched = null;
  let watcher = null;
  let askedAt = 0;
  let command = "";
  let startedAt = 0;
  let skew = 0;
  let reach = "";
  let trouble = "";
  let view = null;
  let language = tongue.DEFAULT;
  let languageTries = 0;
  let languageAt = 0;
  let languageBusy = false;
  let languageSettled = false;
  let languageFailed = false;
  const PT = /^pt/i.test(navigator.language || "");
  const SAY = PT
    ? {
      start: "Gravar", recordingNow: "Gravando", stop: "Parar e gerar notas", working: "…", captions: "Ligue a legenda (tecla C)", captionsWhy: "A extensão lê a legenda do Meet e não consegue ligá-la sozinha. Aperte C ou clique no botão CC. O Meet lembra da escolha nas próximas chamadas.",
      heading: "Gravar esta reunião", lead: "A extensão lê as legendas do Meet e manda o texto pra onde você tem conta.", where: "Onde gravar",
      tell: "Avise quem está na chamada. Ninguém além de você vê que a reunião está sendo gravada.", openAveia: "Abrir no Aveia", close: "Fechar",
      lines: (n) => (n === 1 ? "1 fala" : `${n} falas`),
      aveiaAs: (email) => (email ? `Conectada como ${email}` : "Conectada"), aveiaSignIn: "Entre no Aveia para conectar", aveiaExpired: "A conexão com o Aveia expirou.", aveiaAgain: "Entre de novo para conectar",
      aveiaHeld: (n) => `Sem conexão com o Aveia. ${n === 1 ? "1 fala guardada" : `${n} falas guardadas`}, envio quando a conexão voltar.`, aveiaAway: "Sem conexão com o Aveia agora. O que for dito fica guardado e segue quando ela voltar.",
      hiveReady: "Pronto neste computador", hiveOn: "Gravando neste computador", hiveLooking: "Procurando o Hive neste computador…", hiveMissing: "Não encontrei o Hive neste computador. Só quem tem o app instalado grava nele.", hiveShut: "O Hive está fechado. Abra o app para gravar nele.",
      nowhere: "Para gravar, entre no Aveia ou abra o Hive neste computador.", nowhereHive: "Para gravar, abra o Hive neste computador.", pick: "Marque pelo menos um lugar para gravar.", closedWhy: "Nenhum lugar para gravar ainda. Clique para ver como conectar.", lost: "A extensão não respondeu. Recarregue a página da chamada.",
      language: "Idioma das legendas", languageStuck: "Não consegui mudar o idioma das legendas. Troque no seletor do Meet, no canto inferior esquerdo."
    }
    : {
      start: "Record", recordingNow: "Recording", stop: "Stop and write the notes", working: "…", captions: "Turn captions on (C key)", captionsWhy: "The extension reads the call's captions and cannot turn them on by itself. Press C or click the CC button. Meet remembers the choice in later calls.",
      heading: "Record this meeting", lead: "The extension reads Meet's captions and sends the text to where you have an account.", where: "Where to record",
      tell: "Tell the people on the call. Nobody but you sees that the meeting is being recorded.", openAveia: "Open in Aveia", close: "Close",
      lines: (n) => (n === 1 ? "1 line" : `${n} lines`),
      aveiaAs: (email) => (email ? `Connected as ${email}` : "Connected"), aveiaSignIn: "Sign in to Aveia to connect", aveiaExpired: "The connection to Aveia expired.", aveiaAgain: "Sign in again to connect",
      aveiaHeld: (n) => `No connection to Aveia. ${n === 1 ? "1 line is kept" : `${n} lines are kept`} and sent when it comes back.`, aveiaAway: "No connection to Aveia right now. What is said is kept and sent when it comes back.",
      hiveReady: "Ready on this computer", hiveOn: "Recording on this computer", hiveLooking: "Looking for the Hive on this computer…", hiveMissing: "The Hive was not found on this computer. Only people with the app installed record in it.", hiveShut: "The Hive is closed. Open the app to record in it.",
      nowhere: "To record, sign in to Aveia or open the Hive on this computer.", nowhereHive: "To record, open the Hive on this computer.", pick: "Tick at least one place to record.", closedWhy: "Nowhere to record yet. Click to see how to connect.", lost: "The extension did not answer. Reload the call's page.",
      language: "Caption language", languageStuck: "The caption language could not be changed. Change it in Meet's selector, at the bottom left."
    };
  const onCall = () => /^\/[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}/i.test(location.pathname);
  const callTitle = () => String(document.title || "").replace(/^(Meet|Google Meet)\s*[-–—:]\s*/i, "").trim();
  const STYLE = `
    :host { all: initial; position: fixed; z-index: 2147483647; display: block; }
    .root { all: initial; display: block; font: 400 14px/1.4 "Google Sans", Roboto, system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #23261f; }
    *, *::before, *::after { box-sizing: border-box; }
    button, a, input, select { font: inherit; }
    :focus-visible { outline: 3px solid #1a73e8; outline-offset: 2px; }
    .pill { display: flex; align-items: center; justify-content: center; gap: 8px; height: 48px; min-width: 48px; padding: 0 18px; border: 0; border-radius: 24px; background: #333537; color: #e3e3e3; font-weight: 500; letter-spacing: .01em; white-space: nowrap; cursor: pointer; }
    .pill:hover { background: #414345; }
    .pill:focus-visible { outline-color: #a8c7fa; }
    .pill .mark { width: 10px; height: 10px; border-radius: 50%; background: #f28b82; flex: none; }
    .pill[data-state="on"] { background: #b3261e; color: #fff; }
    .pill[data-state="on"]:hover { background: #9c1f18; }
    .pill[data-state="on"] .mark { background: #fff; }
    .pill[data-state="deaf"] { background: #ffdf99; color: #3d2e00; }
    .pill[data-state="deaf"] .mark { background: #3d2e00; }
    .pill[data-state="closed"] { color: #c4c7c5; }
    .pill[data-state="closed"] .mark { background: transparent; border: 2px solid #c4c7c5; }
    .menu { position: absolute; right: 0; bottom: calc(100% + 12px); width: 360px; max-width: calc(100vw - 16px); max-height: calc(100vh - 110px); overflow: auto; padding: 18px; border-radius: 16px; background: #faf8f3; color: #23261f; box-shadow: 0 12px 40px rgba(0, 0, 0, .5); }
    .menu[hidden] { display: none; }
    .row { display: flex; align-items: center; gap: 10px; }
    .grow { flex: 1; }
    h2 { margin: 0; font: 500 20px/1.25 Georgia, "Times New Roman", serif; color: #23261f; }
    p { margin: 0; }
    .lead { margin-top: 2px; font-size: 13px; color: #565b4e; }
    fieldset { margin: 12px 0 0; padding: 0; border: 0; min-width: 0; }
    legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .opt { display: grid; grid-template-columns: 20px 1fr auto; gap: 2px 10px; align-items: start; margin-top: 8px; padding: 12px; border: 1px solid #d9d5c9; border-radius: 12px; background: #fff; }
    .opt[data-on="true"] { border-color: #48652f; background: #e9f0df; }
    .opt input { grid-row: 1 / span 2; width: 18px; height: 18px; margin: 2px 0 0; accent-color: #48652f; cursor: pointer; }
    .opt input:disabled { cursor: not-allowed; }
    .opt label { font-weight: 600; cursor: pointer; }
    .opt .chip { grid-column: 3; grid-row: 1; }
    .opt .say { grid-column: 2 / span 2; font-size: 13px; color: #4a4f43; overflow-wrap: anywhere; }
    a { color: #36501f; font-weight: 600; text-decoration: underline; border-radius: 4px; }
    .chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .chip.g { background: #d7e4c8; color: #2c4219; }
    .chip.r { background: #f9dedc; color: #8c1d18; }
    .chip[hidden], .btn[hidden], .hint[hidden], .notice[hidden], .opt[hidden] { display: none; }
    .lang { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 8px; padding: 10px 12px; border: 1px solid #d9d5c9; border-radius: 12px; background: #fff; }
    .lang label { font-weight: 600; }
    .lang select { flex: 1 1 150px; min-width: 0; min-height: 36px; padding: 0 8px; border: 1px solid #8a8f80; border-radius: 8px; background: #fff; color: #23261f; cursor: pointer; }
    .notice.warn { background: #f9dedc; color: #8c1d18; }
    .notice { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: #fbf0d5; color: #5c4300; font-size: 13px; }
    .hint { margin-top: 10px; font-size: 13px; color: #8c1d18; }
    .foot { margin-top: 14px; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 16px; border: 0; border-radius: 20px; font-weight: 600; font-size: 14px; text-decoration: none; cursor: pointer; }
    .btn.ghost { background: transparent; color: #23261f; }
    .btn.ghost:hover { background: #ece8dd; }
    .btn.go { background: #48652f; color: #fff; }
    .btn.go:hover { background: #3b5426; }
    .btn.rec { background: #b3261e; color: #fff; }
    .btn.rec:hover { background: #9c1f18; }
    .btn:disabled { background: #d9d5c9; color: #565b4e; cursor: not-allowed; }
  `;
  let host = null;
  let pill = null;
  let ui = null;
  let menuOpen = false;
  let captionsOn = false;
  let recordingSince = 0;
  let hidden = null;
  let fitted = null;
  let quiet = null;
  let fit = "";

  const make = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  const lane = (name) => (view && view.destinations && view.destinations[name]) || { enabled: true, available: false, known: false, recording: false, waiting: false, accepted: 0, pending: 0, error: "" };
  const ask = (message) => ext.runtime.sendMessage({ captions: captionsOn, inCall: onCall(), ...message });

  function placePill() {
    let left = Infinity;
    let middle = 0;
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      if (el === host) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 30 || box.width > 64 || box.bottom < innerHeight - 110 || box.left < innerWidth * 0.75) continue;
      if (box.left < left) { left = box.left; middle = box.top + box.height / 2; }
    }
    if (left === Infinity) {
      host.style.left = "auto"; host.style.top = "auto"; host.style.right = "24px"; host.style.bottom = "16px";
      return;
    }
    host.style.right = "auto"; host.style.bottom = "auto";
    host.style.left = `${Math.max(8, left - 8 - host.offsetWidth)}px`;
    host.style.top = `${middle - 24}px`;
  }

  function took(said) {
    if (!said || said.error) return false;
    view = said;
    startedAt = said.startedAt || 0;
    if (said.now) skew = said.now - Date.now();
    const wanted = said.captionLanguage ? tongue.prefOf(said.captionLanguage) : language;
    const was = recording;
    recording = !!said.recording;
    if (recording && !was) recordingSince = Date.now();
    if (wanted !== language || recording !== was) forgetLanguage();
    language = wanted;
    return true;
  }

  function forgetLanguage() {
    languageTries = 0;
    languageAt = 0;
    languageSettled = false;
    languageFailed = false;
  }

  function languageRow() {
    const box = make("div", "lang");
    const label = make("label", "", SAY.language);
    label.htmlFor = "caption-language";
    const pick = make("select");
    pick.id = label.htmlFor;
    for (const code of tongue.CODES) {
      const one = make("option", "", tongue.labelOf(code, PT));
      one.value = code;
      pick.appendChild(one);
    }
    box.append(label, pick);
    pick.addEventListener("change", async () => {
      const wanted = tongue.prefOf(pick.value);
      if (wanted !== language) forgetLanguage();
      language = wanted;
      try { took(await ask({ type: "aveia-language", language: wanted })); } catch {}
      drawPill();
      keepLanguage(scan(false));
    });
    return { box, pick };
  }

  function option(name, title) {
    const box = make("div", "opt");
    const tick = make("input");
    tick.type = "checkbox";
    tick.id = `to-${name}`;
    const label = make("label", "", title);
    label.htmlFor = tick.id;
    const chip = make("span", "chip g");
    const say = make("div", "say");
    say.id = `say-${name}`;
    tick.setAttribute("aria-describedby", say.id);
    const text = make("span");
    const link = make("a");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    say.append(text, link);
    box.append(tick, label, chip, say);
    tick.addEventListener("change", async () => {
      try { took(await ask({ type: "aveia-targets", targets: { [name]: tick.checked }, title: callTitle() })); } catch {}
      drawPill();
    });
    return { box, tick, chip, text, link };
  }

  function buildUi() {
    host = document.createElement("div");
    host.id = "aveia-meet-recorder";
    const shadow = host.attachShadow({ mode: "closed" });
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(STYLE); shadow.adoptedStyleSheets = [sheet]; } catch { shadow.appendChild(make("style", "", STYLE)); }
    pill = make("button", "pill");
    pill.type = "button";
    pill.setAttribute("aria-haspopup", "dialog");
    pill.append(make("span", "mark"), make("span", "label"));
    const menu = make("div", "menu");
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-labelledby", "menu-title");
    menu.tabIndex = -1;
    menu.hidden = true;
    const top = make("div", "row");
    const heading = make("h2", "", SAY.heading);
    heading.id = "menu-title";
    const timer = make("span", "chip r");
    top.append(heading, make("span", "grow"), timer);
    const places = make("fieldset");
    places.appendChild(make("legend", "", SAY.where));
    const aveia = option("aveia", "Aveia");
    const hive = option("hive", "Hive");
    places.append(aveia.box, hive.box);
    const tongues = languageRow();
    const stuck = make("p", "notice warn", SAY.languageStuck);
    stuck.setAttribute("role", "status");
    stuck.hidden = true;
    const hint = make("p", "hint");
    hint.setAttribute("role", "status");
    const foot = make("div", "row foot");
    const openAveia = make("a", "btn ghost", SAY.openAveia);
    openAveia.target = "_blank";
    openAveia.rel = "noopener noreferrer";
    const act = make("button", "btn go");
    act.type = "button";
    foot.append(openAveia, make("span", "grow"), act);
    menu.append(top, make("p", "lead", SAY.lead), places, tongues.box, stuck, make("p", "notice", SAY.tell), hint, foot);
    const frame = make("div", "root");
    frame.append(menu, pill);
    shadow.appendChild(frame);
    ui = { menu, timer, aveia, hive, hint, openAveia, act, pick: tongues.pick, stuck };
    pill.addEventListener("click", () => toggleMenu(!menuOpen));
    act.addEventListener("click", () => {
      if (command) return;
      command = recording ? "stop" : "start";
      if (command === "stop") toggleMenu(false);
      drawPill();
      beat();
    });
    for (const kind of ["keydown", "keyup", "keypress"]) host.addEventListener(kind, (event) => {
      if (kind === "keydown" && event.key === "Escape" && menuOpen) toggleMenu(false);
      event.stopPropagation();
    });
    document.addEventListener("pointerdown", (event) => { if (menuOpen && host && !event.composedPath().includes(host)) toggleMenu(false, true); }, true);
    document.documentElement.appendChild(host);
  }

  function toggleMenu(open, quietly) {
    menuOpen = open;
    drawPill();
    if (!open) { if (!quietly) pill.focus(); return; }
    const first = [ui.aveia.tick, ui.hive.tick, ui.act, ui.aveia.link].find((el) => !el.disabled && !el.hidden) || ui.menu;
    first.focus();
    ask({ type: "aveia-state", refresh: true }).then((said) => { took(said); drawPill(); }, () => {});
  }

  function safeLink(url, base) {
    if (!url) return "";
    try {
      const home = new URL(base);
      const to = new URL(String(url || ""), home);
      return to.origin === home.origin && /^https?:$/.test(to.protocol) ? to.href : "";
    } catch { return ""; }
  }

  function drawOption(part, state, said) {
    const usable = !!state.available;
    part.tick.checked = usable && state.enabled !== false;
    part.tick.disabled = !usable;
    part.box.dataset.on = String(part.tick.checked);
    const live = state.recording || state.waiting;
    part.chip.hidden = !live;
    part.chip.textContent = SAY.lines(state.accepted || 0);
    part.text.textContent = said.text;
    part.link.hidden = !said.href;
    if (said.href) { part.link.href = said.href; part.link.textContent = said.link; } else part.link.removeAttribute("href");
  }

  function aveiaSays(state) {
    const href = safeLink(state.connectUrl, state.baseUrl);
    if (!state.available) return state.expired ? { text: `${SAY.aveiaExpired} `, link: SAY.aveiaAgain, href } : { text: "", link: SAY.aveiaSignIn, href };
    if (state.error && state.pending) return { text: SAY.aveiaHeld(state.pending) };
    if (state.error) return { text: SAY.aveiaAway };
    return { text: SAY.aveiaAs(state.email) };
  }

  function hiveSays(state) {
    if (state.available) return { text: state.recording ? SAY.hiveOn : SAY.hiveReady };
    if (!state.known) return { text: SAY.hiveLooking };
    return { text: state.error === "no-host" ? SAY.hiveMissing : SAY.hiveShut };
  }

  function drawMenu(clock) {
    const aveia = lane("aveia");
    const hive = lane("hive");
    ui.menu.hidden = !menuOpen;
    pill.setAttribute("aria-expanded", String(menuOpen));
    if (!menuOpen) return;
    ui.timer.hidden = !clock;
    ui.timer.textContent = clock;
    ui.aveia.box.hidden = aveia.configured === false;
    drawOption(ui.aveia, aveia, aveiaSays(aveia));
    drawOption(ui.hive, hive, hiveSays(hive));
    const anywhere = aveia.available || hive.available;
    const picked = (aveia.available && aveia.enabled !== false) || (hive.available && hive.enabled !== false);
    const why = reach === "closed" ? SAY.lost : !anywhere ? (aveia.configured === false ? SAY.nowhereHive : SAY.nowhere) : !picked && !recording ? SAY.pick : "";
    if (ui.pick.value !== language) ui.pick.value = language;
    ui.stuck.hidden = !languageFailed;
    ui.hint.hidden = !why;
    ui.hint.textContent = why;
    const live = safeLink(view && view.url, aveia.baseUrl);
    ui.openAveia.hidden = !live;
    if (live) ui.openAveia.href = live; else ui.openAveia.removeAttribute("href");
    ui.act.textContent = command ? SAY.working : recording ? SAY.stop : SAY.start;
    ui.act.className = `btn ${recording ? "rec" : "go"}`;
    ui.act.disabled = !!command || (!recording && !picked);
  }

  function drawPill() {
    if (!onCall()) { host?.remove(); host = null; pill = null; ui = null; menuOpen = false; return; }
    if (!host) buildUi();
    const closed = reach === "closed" || !(lane("aveia").available || lane("hive").available);
    let clock = "";
    if (recording && startedAt) {
      const secs = Math.max(0, Math.round((Date.now() + skew - startedAt) / 1000));
      clock = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
    }
    const deaf = recording && !closed && !captionsOn && Date.now() - recordingSince > 6000;
    let label = recording ? (clock ? `${SAY.recordingNow} · ${clock}` : SAY.recordingNow) : SAY.start;
    if (deaf) label = SAY.captions;
    if (command) label = SAY.working;
    pill.dataset.state = deaf ? "deaf" : recording ? "on" : closed ? "closed" : "idle";
    pill.lastChild.textContent = label;
    const say = deaf ? `${SAY.captions}. ${SAY.captionsWhy}` : closed && !recording ? `${SAY.start}. ${reach === "closed" ? SAY.lost : SAY.closedWhy}` : label;
    pill.title = deaf ? SAY.captionsWhy : closed && !recording ? (reach === "closed" && trouble ? `${SAY.lost} (${trouble})` : SAY.closedWhy) : "";
    pill.setAttribute("aria-label", say);
    drawMenu(clock);
    placePill();
  }

  function panelOf(region) {
    for (let el = region; el && el !== document.body; el = el.parentElement) {
      if (getComputedStyle(el).position === "absolute" && /bottom/.test(el.getAttribute("style") || "")) return el;
    }
    return region;
  }

  function stageFit(panel) {
    const stage = document.querySelector("main");
    if (!stage || !panel || panel.contains(stage)) return "";
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const tile of stage.children) {
      const style = tile.getAttribute("style") || "";
      if (!/width/.test(style) || !/height/.test(style) || !tile.offsetWidth || !tile.offsetHeight) continue;
      left = Math.min(left, tile.offsetLeft); top = Math.min(top, tile.offsetTop);
      right = Math.max(right, tile.offsetLeft + tile.offsetWidth); bottom = Math.max(bottom, tile.offsetTop + tile.offsetHeight);
    }
    const wide = right - left;
    const tall = bottom - top;
    const room = stage.offsetHeight + panel.offsetHeight;
    if (!(wide > 0) || !(tall > 0) || !stage.offsetWidth || !panel.offsetHeight) return "";
    const grow = Math.max(1, Math.min(2.5, room / tall, stage.offsetWidth / wide));
    const dx = (stage.offsetWidth - wide * grow) / 2 - left * grow;
    const dy = (room - tall * grow) / 2 - top * grow;
    return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${grow.toFixed(4)})`;
  }

  function showCaptions() {
    if (hidden) { hidden.style.removeProperty("opacity"); hidden.style.removeProperty("pointer-events"); hidden = null; }
    if (fitted) { fitted.style.removeProperty("transform"); fitted.style.removeProperty("transform-origin"); fitted = null; fit = ""; }
  }

  function hideCaptions(now) {
    if (!now.region) quiet = null;
    if (recording && now.region) quiet = now.region;
    if (!now.region || quiet !== now.region || languageFailed) return showCaptions();
    const panel = panelOf(now.region);
    if (hidden !== panel) {
      showCaptions();
      hidden = panel;
      hidden.style.setProperty("opacity", "0", "important");
      hidden.style.setProperty("pointer-events", "none", "important");
    }
    const want = stageFit(panel);
    const stage = document.querySelector("main");
    if (!want || !stage) { if (fitted) { fitted.style.removeProperty("transform"); fitted.style.removeProperty("transform-origin"); fitted = null; fit = ""; } return; }
    if (want === fit && fitted === stage && stage.style.transform) return;
    fitted = stage;
    fit = want;
    stage.style.setProperty("transform-origin", "0 0");
    stage.style.setProperty("transform", want);
  }

  function note(block) {
    let known = seen.get(block.el);
    if (!known) { known = { key: `${session}-${++count}`, text: "", speaker: "", at: Date.now(), sent: "" }; seen.set(block.el, known); }
    if (block.speaker) known.speaker = block.speaker;
    if (block.text === known.text) return known;
    known.text = block.text;
    known.changed = Date.now();
    return known;
  }

  function scan(flush) {
    const now = read.readCaptions(document);
    if (now.region !== watched) {
      watcher?.disconnect();
      watched = now.region;
      if (watched) { watcher = new MutationObserver(() => scan(false)); watcher.observe(watched, { childList: true, subtree: true, characterData: true }); }
    }
    captionsOn = now.on;
    hideCaptions(now);
    if (!recording) return now;
    for (const block of now.blocks) {
      const known = note(block);
      if (known.text === known.sent) continue;
      if (!flush && Date.now() - (known.changed || 0) < SETTLE_MS && known.sent) continue;
      known.sent = known.text;
      const waiting = queue.find((one) => one.key === known.key);
      if (waiting) { waiting.text = known.text; waiting.speaker = known.speaker; }
      else queue.push({ key: known.key, speaker: known.speaker, text: known.text, seenAt: known.at });
      if (queue.length > QUEUE_MAX) queue.splice(0, queue.length - QUEUE_MAX);
    }
    return now;
  }

  function keepCaptionsOn(now) {
    if (!recording || now.on || Date.now() - askedAt < 10000) return;
    const button = read.captionButton(document).turnOn;
    if (!button) return;
    askedAt = Date.now();
    button.click();
  }

  async function keepLanguage(now) {
    if (!recording || !now.on || language === tongue.KEEP || languageSettled || languageBusy) return;
    if (languageFailed) {
      const picker = tongue.findPicker(document);
      if (picker && !tongue.needsSwitch(language, picker.shown)) { languageFailed = false; languageSettled = true; drawPill(); }
      return;
    }
    if (Date.now() - languageAt < LANGUAGE_GAP_MS) return;
    languageBusy = true;
    languageAt = Date.now();
    languageTries += 1;
    const asked = language;
    let state = "";
    try { state = (await tongue.setLanguage(document, asked)).state; } catch {}
    languageBusy = false;
    if (asked !== language) return;
    if (state === "same" || state === "switched") languageSettled = true;
    else if (languageTries >= LANGUAGE_TRIES) languageFailed = true;
    drawPill();
  }

  async function beat() {
    if (sending) return;
    sending = true;
    const now = scan(true);
    keepCaptionsOn(now);
    keepLanguage(now);
    const lines = queue.slice(0, 200);
    try {
      const asked = command;
      const was = recording;
      const said = await ask({ type: "aveia-captions", captions: now.on, lines, sentAt: Date.now(), command: asked, title: asked === "start" ? callTitle() : "" });
      if (asked) command = "";
      reach = !said || said.error ? "closed" : "";
      trouble = !said ? "no answer from the extension" : said.error || "";
      if (took(said)) {
        if (said.taken !== false) queue.splice(0, lines.length);
        if (!recording) queue.length = 0;
        if (recording && !was) { scan(true); setTimeout(beat, 700); }
      }
    } catch (wrong) { reach = "closed"; trouble = String(wrong && wrong.message || wrong); }
    sending = false;
    drawPill();
  }

  setInterval(() => scan(false), SCAN_MS);
  setInterval(beat, BEAT_MS);
  setInterval(drawPill, 1000);
  addEventListener("pagehide", () => { scan(true); beat(); });
  beat();
})();
