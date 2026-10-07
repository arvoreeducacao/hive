(function (root) {
  const builtOrigins = root.AveiaOrigin || (typeof require === "function" ? require("./aveia-origin.js") : null);
  const QUEUE_MAX = 4000;
  const BATCH = 200;
  const ROUNDS = 12;
  const RETRY_FIRST = 4000;
  const RETRY_MOST = 60000;
  const ASK_TIMEOUT = 8000;
  const WHO_EVERY = 60000;
  const PROBE_EVERY = 30000;
  const AVEIA_GIVES_UP = 45000;
  const HEARD_STEP = 15000;

  function createQueue(max = QUEUE_MAX) {
    let lines = [];
    return {
      get size() { return lines.length; },
      add(line) {
        if (!line || typeof line.key !== "string" || !line.key) return;
        const held = lines.find((one) => one.key === line.key);
        if (held) { held.text = line.text; held.speaker = line.speaker; return; }
        lines.push({ key: line.key, speaker: line.speaker || "", text: line.text || "", seenAt: line.seenAt || 0 });
        if (lines.length > max) lines.splice(0, lines.length - max);
      },
      peek(count) { return lines.slice(0, count).map((line) => ({ ...line })); },
      settle(sent) {
        const said = new Map(sent.map((line) => [line.key, line.text]));
        lines = lines.filter((line) => !said.has(line.key) || said.get(line.key) !== line.text);
      },
      clear() { lines = []; },
      dump() { return lines.map((line) => ({ ...line })); },
      load(saved) { lines = []; for (const line of Array.isArray(saved) ? saved.slice(-max) : []) this.add(line); }
    };
  }

  function createLane({ name, send, now = Date.now, idleBeats = false, latch = false, givesUpAfter = 0, max = QUEUE_MAX }) {
    const queue = createQueue(max);
    const lane = {
      name, queue, enabled: true, available: false, known: false, recording: false, startedAt: 0, url: "", meetingId: "", error: "", title: "", heardAt: 0, endedUrl: "",
      start: null, stopping: false, busy: false, failures: 0, retryAt: 0, counted: new Set(), countedBefore: 0, probedAt: 0
    };
    const holding = () => lane.recording || !!lane.start;
    const forget = () => { lane.recording = false; lane.start = null; lane.stopping = false; lane.url = ""; lane.meetingId = ""; lane.startedAt = 0; queue.clear(); };

    lane.holding = holding;
    lane.accepted = () => lane.countedBefore + lane.counted.size;
    lane.begin = (title) => { lane.title = String(title || ""); lane.heardAt = 0; lane.endedUrl = ""; lane.start = { title: lane.title }; lane.stopping = false; lane.counted = new Set(); lane.countedBefore = 0; lane.startedAt = now(); lane.url = ""; lane.meetingId = ""; lane.retryAt = 0; queue.clear(); };
    lane.end = () => { if (holding()) { lane.stopping = true; lane.retryAt = 0; } };
    lane.take = (lines) => { if (!lane.enabled || !holding() || lane.stopping) return; for (const line of lines || []) queue.add(line); };

    function failed(answer, asked) {
      lane.known = true;
      lane.error = answer.error || answer.kind || "failed";
      if (answer.kind === "unauthorized" || answer.kind === "signed-out") { lane.available = false; if (!latch) forget(); return; }
      if (answer.kind === "rejected") { queue.settle(asked.lines); if (asked.command === "start") lane.start = null; if (asked.command === "stop") forget(); return; }
      if (!latch) lane.available = false;
      if (!latch && asked.command === "start") forget();
      if (!latch && asked.command === "stop") forget();
      lane.failures += 1;
      lane.retryAt = latch ? now() + Math.min(RETRY_MOST, RETRY_FIRST * 2 ** (lane.failures - 1)) : 0;
    }

    function heard(said, asked) {
      const silent = lane.heardAt ? now() - lane.heardAt : 0;
      lane.heardAt = now();
      lane.known = true;
      lane.available = true;
      lane.error = "";
      lane.failures = 0;
      lane.retryAt = 0;
      if (asked.command === "start") lane.start = null;
      const was = lane.recording;
      lane.recording = !!said.recording && asked.command !== "stop";
      if (was && !lane.recording && !asked.command && !lane.stopping && givesUpAfter > 0 && silent > givesUpAfter) {
        lane.start = { title: lane.title };
        lane.url = "";
        lane.meetingId = "";
        return;
      }
      if (said.taken !== false) {
        queue.settle(asked.lines);
        if (lane.recording) for (const line of asked.lines) lane.counted.add(line.key);
      }
      if (asked.command === "stop" && typeof said.url === "string") lane.endedUrl = said.url;
      if (!lane.recording) { if (!lane.start) forget(); return; }
      if (!was && !asked.command) { lane.counted = new Set(asked.lines.map((line) => line.key)); lane.countedBefore = 0; }
      const skew = Number(said.now) ? Number(said.now) - now() : 0;
      if (Number(said.startedAt)) lane.startedAt = Number(said.startedAt) - skew;
      else if (!lane.startedAt) lane.startedAt = now();
      if (typeof said.url === "string") lane.url = said.url;
      if (said.meetingId != null) lane.meetingId = String(said.meetingId);
    }

    lane.beat = async (beat, { probe = false } = {}) => {
      if (lane.busy) return;
      const due = !!lane.start || lane.stopping || queue.size > 0 || lane.recording || (idleBeats && lane.enabled) || probe;
      if (!due) return;
      if (probe && !lane.start && !lane.stopping && !queue.size && !lane.recording && !(idleBeats && lane.enabled)) {
        if (now() - lane.probedAt < PROBE_EVERY && lane.known) return;
        lane.probedAt = now();
      }
      if (now() < lane.retryAt) return;
      lane.busy = true;
      try {
        for (let round = 0; round < ROUNDS; round++) {
          const lines = queue.peek(BATCH);
          const command = lane.start ? "start" : !lines.length && lane.stopping ? "stop" : "";
          const asked = { captions: !!beat.captions, inCall: !!beat.inCall, lines, sentAt: now(), command, title: command === "start" ? lane.start.title : "", tab: beat.tab || 0 };
          const answer = await send(asked);
          if (!answer || !answer.ok) { failed(answer || { kind: "offline" }, asked); break; }
          heard(answer.said || {}, asked);
          if (!lane.recording && !lane.start) break;
          if (answer.said && answer.said.taken === false) break;
          if (!queue.size && !lane.stopping) break;
        }
      } finally { lane.busy = false; }
    };

    lane.state = () => ({
      enabled: lane.enabled, available: lane.available, known: lane.known, recording: lane.recording, waiting: !!lane.start && !lane.recording,
      accepted: lane.accepted(), pending: queue.size, error: lane.error, startedAt: lane.startedAt, url: lane.url, meetingId: lane.meetingId
    });
    lane.dump = () => ({ enabled: lane.enabled, recording: lane.recording, title: lane.title, heardAt: Math.ceil(lane.heardAt / HEARD_STEP) * HEARD_STEP, startedAt: lane.startedAt, url: lane.url, endedUrl: lane.endedUrl, meetingId: lane.meetingId, start: lane.start, stopping: lane.stopping, accepted: lane.accepted(), lines: queue.dump() });
    lane.load = (saved) => {
      if (!saved || typeof saved !== "object") return;
      lane.enabled = saved.enabled !== false;
      lane.recording = !!saved.recording;
      lane.startedAt = Number(saved.startedAt) || 0;
      lane.title = typeof saved.title === "string" ? saved.title : "";
      lane.endedUrl = typeof saved.endedUrl === "string" ? saved.endedUrl : "";
      lane.heardAt = Number(saved.heardAt) || 0;
      lane.url = typeof saved.url === "string" ? saved.url : "";
      lane.meetingId = typeof saved.meetingId === "string" ? saved.meetingId : "";
      lane.start = saved.start && typeof saved.start === "object" ? { title: String(saved.start.title || "") } : null;
      lane.stopping = !!saved.stopping;
      lane.countedBefore = Number(saved.accepted) || 0;
      queue.load(saved.lines);
    };
    lane.forget = forget;
    return lane;
  }

  function hiveSender(ask) {
    return async (body) => {
      let said;
      try { said = await ask(body); } catch (wrong) { said = { error: String(wrong && wrong.message || wrong) }; }
      if (!said) return { ok: false, kind: "missing", error: "no-host" };
      if (said.error) return { ok: false, kind: said.error === "no-host" ? "missing" : "offline", error: String(said.error) };
      return { ok: true, said };
    };
  }

  function createAveiaLink({ fetch, storage, origins = builtOrigins, now = Date.now, timeout = ASK_TIMEOUT, defer = setTimeout, undefer = clearTimeout }) {
    let held = null;
    let seq = 0;
    let who = { email: "", name: "", at: 0, error: "" };

    const read = async () => {
      if (held) return held;
      let saved = {};
      try { saved = (await storage.get("aveia")).aveia || {}; } catch {}
      const baseUrl = origins.originOf(saved.baseUrl) || origins.DEFAULT_BASE;
      held = { baseUrl, token: baseUrl && typeof saved.token === "string" ? saved.token : "", email: typeof saved.email === "string" ? saved.email : "", name: typeof saved.name === "string" ? saved.name : "", expired: saved.expired === true };
      return held;
    };

    async function call(path, init) {
      const config = await read();
      if (!config.token) return { kind: "signed-out", error: "signed-out" };
      const stop = typeof AbortController === "function" ? new AbortController() : null;
      const giveUp = defer(() => stop && stop.abort(), timeout);
      try {
        const res = await fetch(`${config.baseUrl}${path}`, { ...init, credentials: "omit", cache: "no-store", signal: stop ? stop.signal : undefined, headers: { ...(init.headers || {}), authorization: `Bearer ${config.token}` } });
        if (res.status === 401) {
          held = null;
          who = { email: "", name: "", at: 0, error: "" };
          try { await storage.set({ aveia: { baseUrl: config.baseUrl, token: "", email: config.email, name: config.name, expired: true } }); } catch {}
          return { kind: "unauthorized", error: "unauthorized" };
        }
        if (res.status >= 500 || res.status === 408 || res.status === 429) return { kind: "offline", error: `http-${res.status}` };
        if (res.status < 200 || res.status >= 300) return { kind: "rejected", error: `http-${res.status}` };
        let said;
        try { said = await res.json(); } catch { return { kind: "offline", error: "bad-answer" }; }
        return { ok: true, said: said && typeof said === "object" ? said : {} };
      } catch { return { kind: "offline", error: "offline" }; } finally { undefer(giveUp); }
    }

    return {
      changed() { held = null; who = { email: "", name: "", at: 0, error: "" }; },
      config: read,
      async send(body) {
        const answer = await call("/api/ext/captions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, id: ++seq }) });
        return { ok: false, ...answer };
      },
      async whoAmI(how) {
        const config = await read();
        if (!config.token) return { connected: false, email: config.email, expired: config.expired, baseUrl: config.baseUrl, error: "" };
        if (how !== "force" && who.at && (how !== "fresh" || now() - who.at < WHO_EVERY)) return { connected: true, email: who.email || config.email, name: who.name, baseUrl: config.baseUrl, error: who.error || "" };
        const answer = await call("/api/ext/me", { method: "GET" });
        if (answer.ok) {
          who = { email: typeof answer.said.email === "string" ? answer.said.email : config.email, name: typeof answer.said.name === "string" ? answer.said.name : "", at: now(), error: "" };
          return { connected: true, email: who.email, name: who.name, baseUrl: config.baseUrl, error: "" };
        }
        if (answer.kind === "unauthorized") return { connected: false, email: config.email, expired: true, baseUrl: config.baseUrl, error: "unauthorized" };
        who = { email: who.email, name: who.name, at: now(), error: answer.error || "offline" };
        return { connected: true, email: who.email || config.email, name: who.name, baseUrl: config.baseUrl, error: who.error };
      },
      async signOut() {
        const config = await read();
        held = null;
        who = { email: "", name: "", at: 0, error: "" };
        try { await storage.set({ aveia: { baseUrl: config.baseUrl, token: "", email: "", name: "" } }); } catch {}
      }
    };
  }

  function createRouter({ askHive, fetch, storage, memory = storage, origins = builtOrigins, now = Date.now, defer, undefer }) {
    const link = createAveiaLink({ fetch, storage, origins, now, ...(defer ? { defer, undefer } : {}) });
    const hive = createLane({ name: "hive", send: hiveSender(askHive), now, idleBeats: true });
    const aveia = createLane({ name: "aveia", send: link.send, now, latch: true, givesUpAfter: AVEIA_GIVES_UP });
    const lanes = { hive, aveia };
    let title = "";
    let account = { connected: false, email: "", expired: false, baseUrl: origins.DEFAULT_BASE, error: "" };
    let savedAs = "";

    const keep = async () => {
      const snapshot = JSON.stringify({ title, hive: { enabled: hive.enabled, accepted: hive.accepted() }, aveia: aveia.dump() });
      if (snapshot === savedAs) return;
      savedAs = snapshot;
      try { await memory.set({ lanes: JSON.parse(snapshot) }); } catch {}
    };

    const greet = async (how) => {
      account = await link.whoAmI(how);
      aveia.available = account.connected;
      aveia.known = true;
      if (!account.connected && aveia.holding() && account.expired) aveia.error = "unauthorized";
      return account;
    };

    const ready = (async () => {
      let saved = {};
      let targets = {};
      try { saved = (await memory.get("lanes")).lanes || {}; } catch {}
      try { targets = (await storage.get("targets")).targets || {}; } catch {}
      title = typeof saved.title === "string" ? saved.title : "";
      aveia.load(saved.aveia);
      if (saved.hive) hive.countedBefore = Number(saved.hive.accepted) || 0;
      if (targets.hive === false) hive.enabled = false;
      if (targets.aveia === false) aveia.enabled = false;
      await greet("held");
    })();

    const recording = () => Object.values(lanes).some((lane) => lane.holding() && !lane.stopping);

    function state() {
      const live = Object.values(lanes).filter((lane) => lane.holding() && !lane.stopping);
      const started = live.map((lane) => lane.startedAt).filter(Boolean);
      const hiveState = hive.state();
      const aveiaState = { ...aveia.state(), available: account.connected, email: account.email || "", expired: !!account.expired, configured: !!account.baseUrl, baseUrl: account.baseUrl, connectUrl: account.baseUrl ? `${account.baseUrl}/conectar-extensao` : "" };
      if (!aveiaState.error && account.error && account.connected) aveiaState.error = account.error;
      return {
        recording: live.length > 0, startedAt: started.length ? Math.min(...started) : 0, now: now(), taken: true, url: aveia.holding() ? aveia.url : aveia.endedUrl,
        usable: (hive.enabled && hive.available) || (aveia.enabled && account.connected),
        destinations: { hive: hiveState, aveia: aveiaState }
      };
    }

    async function beat(message) {
      await ready;
      const asked = message.command === "start" || message.command === "stop" ? message.command : "";
      await greet("held");
      if (asked === "start") {
        title = String(message.title || "");
        for (const lane of Object.values(lanes)) {
          if (!lane.enabled || lane.holding()) continue;
          if (lane === aveia && !account.connected) continue;
          lane.begin(title);
        }
      }
      if (asked === "stop") for (const lane of Object.values(lanes)) lane.end();
      for (const lane of Object.values(lanes)) lane.take(message.lines);
      await Promise.all(Object.values(lanes).map((lane) => lane.beat(message).catch((wrong) => { lane.error = String(wrong && wrong.message || wrong); })));
      if (aveia.error === "unauthorized") await greet("force");
      await keep();
      return state();
    }

    async function setTargets(wanted, message = {}) {
      await ready;
      const live = recording();
      for (const [name, lane] of Object.entries(lanes)) {
        if (typeof wanted[name] !== "boolean" || wanted[name] === lane.enabled) continue;
        lane.enabled = wanted[name];
        if (lane.enabled && live && !lane.holding() && (lane !== aveia || account.connected)) lane.begin(message.title || title);
        if (!lane.enabled && lane.holding()) lane.end();
      }
      await Promise.all(Object.values(lanes).map((lane) => lane.beat({ captions: !!message.captions, inCall: !!message.inCall, tab: message.tab || 0 }).catch(() => {})));
      try { await storage.set({ targets: { hive: hive.enabled, aveia: aveia.enabled } }); } catch {}
      await keep();
      return state();
    }

    async function look(message = {}) {
      await ready;
      await greet(message.refresh === true ? "fresh" : "held");
      if (message.refresh === true) await hive.beat({ captions: !!message.captions, inCall: !!message.inCall, tab: message.tab || 0 }, { probe: true }).catch(() => {});
      return state();
    }

    async function accountChanged() {
      await ready;
      link.changed();
      const was = account.connected;
      await greet("force");
      if (account.connected && !was) { aveia.retryAt = 0; aveia.error = ""; }
      return state();
    }

    async function signOut() {
      await ready;
      await link.signOut();
      aveia.forget();
      aveia.endedUrl = "";
      await greet("held");
      await keep();
      return state();
    }

    return { beat, setTargets, look, accountChanged, signOut, state, lanes, ready };
  }

  const api = { QUEUE_MAX, BATCH, createQueue, createLane, createAveiaLink, createRouter, hiveSender };
  root.AveiaDestinations = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
