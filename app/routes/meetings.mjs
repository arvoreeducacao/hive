import { randomBytes } from "node:crypto";
import {
  MEETING_MODELS, MEETING_SHELF_DIR, MEETING_SOURCES, addLine, heardText, cleanMeetingSettings, dropLocalMeeting, dropSharedMeeting, editMeeting,
  isMeetingId, isSharedMeeting, matchesMeeting, meetingCommitLine, meetingRow, meetingsOf, newMeeting, ownsMeeting, readLocalMeeting,
  readLocalMeetings, readSharedMeetings, seesMeeting, summaryFromAnswer, summaryPrompt, transcriptText, writeLocalMeeting, writeSharedMeeting
} from "../lib/meetings.mjs";
import { sttModel } from "../lib/stt-download.mjs";
import { STT_SAMPLE_RATE } from "../lib/stt-engine.mjs";
import { soundBody } from "./stt.mjs";
import { createOutputTap, listOutputs, loudEnough } from "../lib/meeting-outputs.mjs";
import { aveiaOriginOf, captionStatus, createCaptionWatch, installCaptionBridge, openCaptionFolder, upsertCaption } from "../lib/meeting-captions.mjs";

export const MEETINGS_PULL_EVERY = 30000;
export const CHUNK_CEILING = 8 << 20;
export const BROWSER_GONE = 45000;

const newMeetingId = () => `m${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

export function registerMeetingRoutes(on, context) {
  const {
    bodyOf, home, me, shelf, readConfig, engine, summarize, people = async () => [], onThePod = () => false,
    now = Date.now, newId = newMeetingId, log = () => {}, outputs = listOutputs, openOutput = createOutputTap,
    captionAssets = "", sock = "", aveiaUrl = "", meetingsGuide = "", bridge = { status: captionStatus, install: installCaptionBridge, open: openCaptionFolder }
  } = context;
  const watch = createCaptionWatch({ now });

  let pulledAt = 0;
  let live = "";
  let healed = false;
  const writing = new Map();
  let tap = null;
  const summarizing = new Set();

  const settings = async () => {
    const { config } = await readConfig();
    return {
      meetings: cleanMeetingSettings(config.meetings),
      stt: config.stt === true,
      sttLanguage: config.sttLanguage || "",
      sttModel: config.sttModel,
      spoken: String(config.language || "en").slice(0, 2).toLowerCase()
    };
  };

  const languageOf = (said) => {
    if (said.sttLanguage) return said.sttLanguage;
    return sttModel(said.sttModel).detectsLanguage ? "" : said.spoken;
  };

  const listening = (said) => {
    if (onThePod()) return { ready: false, why: "pod" };
    if (!said.stt) return { ready: false, why: "off" };
    const state = engine.status();
    const there = state.engine === "ready" && (state.model === "ready" || state.model === "handy");
    return { ready: there, why: there ? "" : "missing" };
  };

  const pullNow = async (force = false) => {
    if (!shelf.home() && !force) return;
    if (!force && now() - pulledAt < MEETINGS_PULL_EVERY) return;
    pulledAt = now();
    await shelf.pull().catch(() => ({}));
  };

  const heal = () => {
    if (healed) return;
    healed = true;
    for (const one of readLocalMeetings(home)) {
      if (one.id === live || (one.state !== "recording" && one.state !== "summarizing")) continue;
      writeLocalMeeting(home, { ...one, state: "summary-failed", endedAt: one.endedAt || now(), trouble: "the hive closed before this meeting was summarized" });
    }
  };

  const everything = () => meetingsOf({ local: readLocalMeetings(home), shared: readSharedMeetings(shelf.home()), me: me() });

  const find = (id) => {
    if (!isMeetingId(id)) return null;
    const mine = readLocalMeeting(home, id);
    if (mine && mine.owner === me()) return mine;
    const theirs = readSharedMeetings(shelf.home()).find((one) => one.id === id);
    return theirs && seesMeeting(theirs, me()) ? theirs : null;
  };

  const onShelf = (work, line) => shelf.turn(async () => {
    const opened = await shelf.pull();
    if (opened.error) return { error: "the team's meetings live in the shelf repo, and it is not reachable", why: opened.error };
    pulledAt = now();
    await work(opened.home);
    const sent = await shelf.push(line, [MEETING_SHELF_DIR]);
    if (sent.error && !sent.committed) return { error: sent.error };
    return { pushed: !!sent.pushed, ...(sent.error ? { warning: sent.error } : {}) };
  });

  const share = async (meeting, what) => {
    if (meeting.state === "recording" || meeting.state === "summarizing") return { pushed: false };
    if (!isSharedMeeting(meeting)) return { pushed: false };
    return onShelf((shelfHome) => writeSharedMeeting(shelfHome, meeting), meetingCommitLine(meeting, what));
  };

  const unshare = (meeting, what) => onShelf((shelfHome) => dropSharedMeeting(shelfHome, meeting.id), meetingCommitLine(meeting, what));

  async function settleSummary(id, model) {
    if (summarizing.has(id)) return;
    summarizing.add(id);
    try {
      await Promise.allSettled([...(writing.get(id) || [])]);
      writing.delete(id);
      let meeting = readLocalMeeting(home, id);
      if (!meeting) return;
      const said = await settings();
      const picked = MEETING_MODELS.some((one) => one.id === model) ? model : said.meetings.model;
      if (!meeting.lines.length) {
        meeting = { ...meeting, state: "ready", summary: null, model: "", trouble: "" };
      } else {
        try {
          const out = await summarize({ model: picked, prompt: summaryPrompt({ instructions: said.meetings.instructions, owner: meeting.owner }), input: transcriptText(meeting, { mic: meeting.owner }) });
          const summary = summaryFromAnswer(out);
          if (!summary) throw new Error("the model did not answer with notes");
          meeting = {
            ...meeting, state: "ready", summary, model: picked, trouble: "",
            title: !meeting.titled && summary.title ? summary.title : meeting.title
          };
        } catch (wrong) {
          log(`meetings: ${id} was not summarized — ${wrong.message}`);
          meeting = { ...meeting, state: "summary-failed", trouble: String(wrong.message || wrong).slice(0, 300) };
        }
      }
      const fresh = readLocalMeeting(home, id);
      if (!fresh) return;
      meeting = { ...meeting, who: fresh.who, people: fresh.people, title: fresh.titled ? fresh.title : meeting.title, titled: fresh.titled };
      writeLocalMeeting(home, meeting);
      const sent = await share(meeting, meeting.summary ? "summarized" : "transcribed");
      if (sent.error) log(`meetings: ${id} stayed on this machine — ${sent.error}`);
    } finally {
      summarizing.delete(id);
    }
  }

  on("GET", "/api/meetings", async (req, res, url, json) => {
    heal();
    await pullNow(url.searchParams.get("fresh") === "1");
    const said = await settings();
    const query = url.searchParams.get("q") || "";
    const all = everything().filter((one) => matchesMeeting(one, query));
    return json({
      me: me(),
      people: await people().catch(() => []),
      meetings: all.map(meetingRow),
      live: live || "",
      captions: watch.state(),
      settings: said.meetings,
      models: MEETING_MODELS,
      listening: listening(said),
      shelf: !!shelf.home(),
      now: now()
    });
  });

  on("GET", "/api/meetings/one", async (req, res, url, json) => {
    const meeting = find(url.searchParams.get("id"));
    if (!meeting) return json({ error: "no meeting with that id — it may have been removed" }, 404);
    return json({ meeting, mine: ownsMeeting(meeting, me()) });
  });

  const captioned = (id, at, pcm) => {
    const meeting = readLocalMeeting(home, id);
    if (!meeting) return false;
    const from = meeting.startedAt + at * 1000;
    const to = from + (pcm.length / STT_SAMPLE_RATE) * 1000;
    return watch.covered(from, to);
  };

  const hear = (id, source, at, pcm, language) => {
    if (captioned(id, at, pcm)) return Promise.resolve("");
    const work = engine.transcribe(pcm, { language }).then((out) => {
      const fresh = readLocalMeeting(home, id);
      if (!fresh) return "";
      const seconds = Math.max(fresh.seconds || 0, at + pcm.length / STT_SAMPLE_RATE);
      const text = heardText(out.text, language);
      writeLocalMeeting(home, { ...addLine(fresh, { at, source, text }), seconds: Math.round(seconds) });
      return text;
    });
    if (!writing.has(id)) writing.set(id, new Set());
    const held = writing.get(id);
    held.add(work);
    work.catch(() => {}).finally(() => held.delete(work));
    return work;
  };

  const closeTap = async (id, discard) => {
    if (!tap || tap.id !== id) return;
    const held = tap;
    tap = null;
    await held.tap.stop({ discard });
  };

  let callSeenAt = 0;
  const callOpen = () => callSeenAt > 0 && now() - callSeenAt <= 12000;
  const SELF = new Set(["você", "voce", "you", "tú", "tu", "vous", "du", "ich", "eu"]);
  const speakerOf = (name) => (SELF.has(String(name || "").trim().toLowerCase()) ? me() : name);

  const finish = async (meeting, { seconds = 0 } = {}) => {
    if (live === meeting.id) live = "";
    await closeTap(meeting.id, false);
    const fresh = readLocalMeeting(home, meeting.id) || meeting;
    if (fresh.state !== "recording") return fresh;
    const lasted = Math.max(fresh.seconds || 0, Math.round(Number(seconds) || 0), Math.round((now() - fresh.startedAt) / 1000));
    const next = { ...fresh, state: "summarizing", endedAt: now(), seconds: lasted };
    writeLocalMeeting(home, next);
    settleSummary(meeting.id).catch((wrong) => log(`meetings: ${meeting.id} — ${wrong.message}`));
    return next;
  };

  const liveMeeting = () => {
    const meeting = live ? readLocalMeeting(home, live) : null;
    return meeting && meeting.state === "recording" ? meeting : null;
  };

  const fromBrowser = async (body) => {
    if (onThePod()) return null;
    const said = await settings();
    const title = String(body.title || "").replace(/\s+/g, " ").trim();
    const made = newMeeting({ id: newId(), owner: me(), title: /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(title) ? "" : title, who: said.meetings.who, at: now(), language: said.spoken });
    if (made.error) return null;
    const meeting = { ...made.meeting, via: "extension" };
    writeLocalMeeting(home, meeting);
    live = meeting.id;
    watch.reset();
    return meeting;
  };

  const answer = (meeting) => (meeting ? { recording: true, taken: true, meetingId: meeting.id, startedAt: meeting.startedAt, now: now() } : { recording: false, now: now() });

  on("POST", "/api/meetings/captions", async (req, res, url, json) => {
    const body = await bodyOf(req);
    if (body.inCall === true) callSeenAt = now();
    let meeting = liveMeeting();
    if (body.command === "start" && !meeting) meeting = await fromBrowser(body);
    if (body.command === "stop" && meeting) { await finish(meeting); return json(answer(null)); }
    if (!meeting) return json(answer(null));
    watch.beat(body.captions === true);
    let next = meeting;
    const at = Math.max(0, (now() - meeting.startedAt) / 1000);
    for (const line of Array.isArray(body.lines) ? body.lines.slice(0, 400) : []) {
      const seenAt = Number(line?.seenAt);
      const when = Number.isFinite(seenAt) && seenAt >= meeting.startedAt && seenAt <= now() + 5000 ? (seenAt - meeting.startedAt) / 1000 : at;
      next = upsertCaption(next, { key: line?.key, speaker: speakerOf(line?.speaker), text: line?.text, at: when });
    }
    if (next !== meeting) {
      writeLocalMeeting(home, { ...next, seconds: Math.max(next.seconds || 0, Math.round(at)) });
      watch.wrote();
    }
    return json(answer(meeting));
  });

  const sweep = async () => {
    const meeting = liveMeeting();
    if (!meeting || meeting.via !== "extension") return false;
    if (watch.quietFor() < BROWSER_GONE) return false;
    log(`meetings: ${meeting.id} ended because the browser went quiet`);
    await finish(meeting);
    return true;
  };

  on("GET", "/api/meetings/extension", async (req, res, url, json) => json({ ...bridge.status({ home }), ...watch.state(), call: callOpen(), aveia: aveiaOriginOf(typeof aveiaUrl === "function" ? aveiaUrl() : aveiaUrl), guide: meetingsGuide }));

  on("POST", "/api/meetings/extension/install", async (req, res, url, json) => {
    if (onThePod()) return json({ error: "the browser extension is set up on your own machine" }, 409);
    const done = bridge.install({ home, assets: captionAssets, sock: typeof sock === "function" ? sock() : sock, aveia: typeof aveiaUrl === "function" ? aveiaUrl() : aveiaUrl });
    return json(done.error ? { error: done.error } : { ...done, ...watch.state() }, done.error ? 409 : 200);
  });

  on("POST", "/api/meetings/extension/open", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const done = bridge.open({ home, which: body.which === "firefox" ? "firefox" : "chrome" });
    return json(done, done.error ? 409 : 200);
  });

  on("GET", "/api/meetings/outputs", async (req, res, url, json) => json(await outputs()));

  on("GET", "/api/meetings/level", async (req, res, url, json) => json({ id: tap?.id || "", system: tap ? tap.tap.level() : 0, heard: tap ? tap.tap.heard() : false, captions: watch.state() }));

  on("POST", "/api/meetings/start", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const said = await settings();
    if (live && readLocalMeeting(home, live)?.state === "recording") return json({ error: "a meeting is already being recorded", id: live }, 409);
    if (body.captionsOnly === true && !callOpen()) return json({ error: "no call is open in the browser", why: "no-call" }, 409);
    const able = listening(said);
    if (!able.ready && !(body.captionsOnly === true && callOpen())) return json({ error: "this machine is not ready to write down what it hears", why: able.why }, 409);
    if (body.captionsOnly === true) {
      const meeting = await fromBrowser({ title: body.title });
      if (!meeting) return json({ error: "the meeting did not start" }, 400);
      return json({ ok: true, meeting, system: "captions" });
    }
    const made = newMeeting({ id: newId(), owner: me(), title: body.title, who: body.who || said.meetings.who, people: body.people, at: now(), language: said.spoken });
    if (made.error) return json({ error: made.error }, 400);
    writeLocalMeeting(home, made.meeting);
    live = made.meeting.id;
    watch.reset();
    engine.load().catch(() => {});
    let system = "window";
    if (said.meetings.systemAudio && body.systemByServer === true && (await outputs()).supported) {
      const id = made.meeting.id;
      const language = languageOf(said);
      tap = { id, tap: openOutput({ output: said.meetings.output, log, onChunk: ({ at, pcm }) => { const loud = loudEnough(pcm); if (loud) hear(id, "system", at, loud, language).catch(() => {}); } }) };
      system = "server";
    }
    return json({ ok: true, meeting: made.meeting, system });
  });

  on("POST", "/api/meetings/chunk", async (req, res, url, json) => {
    const id = url.searchParams.get("id");
    const source = url.searchParams.get("source");
    const at = Number(url.searchParams.get("at")) || 0;
    const meeting = readLocalMeeting(home, id);
    if (!meeting || meeting.owner !== me()) return json({ error: "no meeting with that id" }, 404);
    if (meeting.state !== "recording" && meeting.state !== "summarizing") return json({ error: "that meeting is no longer taking sound" }, 409);
    if (!MEETING_SOURCES.includes(source)) return json({ error: "the sound should come from mic or system" }, 400);
    const { oversized, pcm } = await soundBody(req, CHUNK_CEILING);
    if (oversized) return json({ error: "that is more sound than one piece of a meeting carries" }, 413);
    if (!pcm) return json({ error: "that was not sound the way we send it" }, 400);
    const said = await settings();
    try {
      const text = await hear(id, source, at, pcm, languageOf(said));
      return json({ ok: true, text });
    } catch (wrong) {
      return json({ error: wrong.message, code: wrong.code || "run" }, 500);
    }
  });

  on("POST", "/api/meetings/stop", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const meeting = readLocalMeeting(home, String(body.id || ""));
    if (!meeting || meeting.owner !== me()) return json({ error: "no meeting with that id" }, 404);
    if (body.discard === true) {
      if (live === meeting.id) live = "";
      await closeTap(meeting.id, true);
      writing.delete(meeting.id);
      dropLocalMeeting(home, meeting.id);
      return json({ ok: true, discarded: true });
    }
    if (meeting.state !== "recording") return json({ ok: true, meeting });
    return json({ ok: true, meeting: await finish(meeting, { seconds: body.seconds }) });
  });

  on("POST", "/api/meetings/summarize", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const meeting = readLocalMeeting(home, String(body.id || ""));
    if (!meeting || meeting.owner !== me()) return json({ error: "only who recorded a meeting asks for its notes again" }, 404);
    if (meeting.state === "recording") return json({ error: "stop the recording first" }, 409);
    if (summarizing.has(meeting.id)) return json({ ok: true, meeting });
    const next = { ...meeting, state: "summarizing", trouble: "" };
    writeLocalMeeting(home, next);
    settleSummary(meeting.id, String(body.model || "")).catch((wrong) => log(`meetings: ${meeting.id} — ${wrong.message}`));
    return json({ ok: true, meeting: next });
  });

  on("POST", "/api/meetings/edit", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const before = readLocalMeeting(home, String(body.id || ""));
    if (!before) return json({ error: "only who recorded a meeting changes it" }, 404);
    const change = {};
    if (body.title !== undefined) change.title = body.title;
    if (body.who !== undefined) change.who = body.who;
    if (body.people !== undefined) change.people = body.people;
    const edited = editMeeting(before, change, { me: me() });
    if (edited.error) return json({ error: edited.error }, 400);
    writeLocalMeeting(home, edited.meeting);
    let sent = { pushed: false };
    if (isSharedMeeting(edited.meeting)) sent = await share(edited.meeting, "edited");
    else if (isSharedMeeting(before) && shelf.home() && (before.state === "ready" || before.state === "summary-failed")) sent = await unshare(before, "back to one person");
    return json({ ok: true, meeting: edited.meeting, pushed: !!sent.pushed, ...(sent.error ? { warning: sent.error } : {}) });
  });

  on("POST", "/api/meetings/remove", async (req, res, url, json) => {
    const body = await bodyOf(req);
    const meeting = readLocalMeeting(home, String(body.id || ""));
    if (!meeting || meeting.owner !== me()) return json({ error: "only who recorded a meeting removes it" }, 404);
    if (live === meeting.id) live = "";
    await closeTap(meeting.id, true);
    let sent = { pushed: false };
    if (isSharedMeeting(meeting) && shelf.home() && (meeting.state === "ready" || meeting.state === "summary-failed")) sent = await unshare(meeting, "removed");
    if (sent.error) return json({ error: sent.error }, 502);
    dropLocalMeeting(home, meeting.id);
    return json({ ok: true, pushed: !!sent.pushed });
  });

  return { settleSummary, sweep };
}
