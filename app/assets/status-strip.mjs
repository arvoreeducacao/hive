import { bySeverity, shortTime, worstState } from "/assets/doctor-core.mjs";
import { phrase } from "/assets/i18n.mjs";

export const SLOT_OF = {
  disk: "diskCard",
  credential: "claudeCard",
  "remote-control": "claudeCard",
  "cloud-sessions": "syncCard",
  pod: "hero"
};

export const SLOT_SAYS = {
  diskCard: "about the disk card above",
  claudeCard: "about the Claude card above",
  syncCard: "about the files card above",
  hero: "about the server itself, at the top"
};

export const HEADLINE = {
  config: "your ~/.hive/config is not readable the way the hive expects",
  key: "the signing key is not where the hive looks for it",
  deps: "something the hive needs is missing from PATH",
  clock: "this machine and the server disagree about what time it is",
  pod: "the server is not up",
  "cloud-door": "the door to your server is shut",
  "last-death": "the server died badly the last time it went down",
  "allowed-signers": "the server cannot verify the commits it signs",
  credential: "the Claude credential on the server will not do",
  flags: "the Claude flags on the server are not the ones this hive expects",
  memory: "the team memory is not reachable from the server",
  "cloud-sessions": "the sessions only live on the server's volume",
  "remote-control": "the remote control is not up",
  repos: "the server is missing repos this workspace declares",
  "hub-context": "the seats are reading an old contract",
  "hub-contract": "the seats are reading an old contract",
  gh: "gh on the server is not signed in",
  disk: "/workspace is running out of room"
};

export const GROUP_HEADLINE = {
  "hub-checkout": "the seats are reading an old contract"
};

export const slotOf = (id) => SLOT_OF[id] || "";

export function headlineOf(model) {
  const said = (model?.group && GROUP_HEADLINE[model.group]) || HEADLINE[model?.id] || model?.title || "";
  return said ? phrase(said) : "";
}

export function fuse(items) {
  const out = [];
  const joined = new Map();
  for (const item of items || []) {
    if (!item?.id) continue;
    if (!item.group) {
      out.push({ ...item, ids: [item.id], fixId: item.fix ? item.id : "" });
      continue;
    }
    const seen = joined.get(item.group);
    if (!seen) {
      const made = { ...item, ids: [item.id], fixId: item.fix ? item.id : "" };
      joined.set(item.group, made);
      out.push(made);
      continue;
    }
    seen.ids.push(item.id);
    seen.state = worstState([{ state: seen.state }, { state: item.state }]);
    seen.detail = [seen.detail, item.detail].filter(Boolean).join(" · ");
    const better = item.fix && (!seen.fix || (seen.fix.kind !== "fix" && item.fix.kind === "fix"));
    if (better) {
      seen.fix = item.fix;
      seen.fixId = item.id;
    }
  }
  return out;
}

const SILENCED = new Map();

export function markOf(model) {
  return `${model?.state || ""}:${model?.detail || ""}`;
}

export function keyOf(model) {
  return (model?.ids || (model?.id ? [model.id] : [])).join("+");
}

export function canSilence(model) {
  return model?.state === "warn";
}

export function silenced(model) {
  const key = keyOf(model);
  return SILENCED.has(key) && SILENCED.get(key) === markOf(model);
}

export function silence(model) {
  if (!canSilence(model)) return false;
  SILENCED.set(keyOf(model), markOf(model));
  return true;
}

export function unsilence(model) {
  SILENCED.delete(keyOf(model));
}

export function silencedEntries() {
  return [...SILENCED.entries()];
}

export function loadSilenced(entries) {
  SILENCED.clear();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!Array.isArray(entry)) continue;
    const [key, mark] = entry;
    if (typeof key === "string" && typeof mark === "string") SILENCED.set(key, mark);
  }
}

const IGNORED = new Map();

export function loadIgnored(ignored) {
  IGNORED.clear();
  for (const [id, until] of Object.entries(ignored && typeof ignored === "object" ? ignored : {})) {
    if (Number.isFinite(until)) IGNORED.set(id, until);
  }
}

export function ignoredUntil(model, now = Date.now()) {
  const ids = model?.ids || (model?.id ? [model.id] : []);
  if (!ids.length) return null;
  const untils = ids.map((id) => IGNORED.get(id));
  const forGood = (until) => until === 0;
  if (untils.some((until) => until === undefined || (!forGood(until) && until <= now))) return null;
  if (model.state === "fail" && untils.some(forGood)) return null;
  const timed = untils.filter((until) => !forGood(until));
  return timed.length ? Math.min(...timed) : 0;
}

export function ignored(model, now = Date.now()) {
  return ignoredUntil(model, now) !== null;
}

const quieted = (m) => silenced(m) || ignored(m);

export function findings(report) {
  const loud = (m) => m.state === "warn" || m.state === "fail";
  return bySeverity(fuse(report?.items || []).filter((m) => loud(m) && !quieted(m)));
}

export function silencedOf(report) {
  return fuse(report?.items || []).filter((m) => (m.state === "warn" || m.state === "fail") && quieted(m));
}

const RESULTS = new Map();

export function keepResult(id, result) {
  const stamped = { at: Date.now(), ...result };
  if (id) RESULTS.set(id, stamped);
  return stamped;
}

export function resultFor(model) {
  for (const id of model?.ids || (model?.id ? [model.id] : [])) {
    if (RESULTS.has(id)) return RESULTS.get(id);
  }
  return null;
}

export function forgetResult(id) {
  RESULTS.delete(id);
}

export function cardsOf(report) {
  const all = fuse(report?.items || []);
  const loud = (m) => m.state === "warn" || m.state === "fail";
  const settled = all.filter((m) => !loud(m) && resultFor(m));
  return [...bySeverity(all.filter(loud)), ...settled];
}

export function settledOf(report) {
  const loud = (m) => m.state === "warn" || m.state === "fail";
  return fuse(report?.items || []).filter((m) => !loud(m) && resultFor(m));
}

export function autoFixable(report) {
  return findings(report)
    .filter((m) => m.fixId && m.fix && m.fix.kind === "fix")
    .map((m) => m.fixId);
}

export function lineOf(report) {
  const items = report?.items || [];
  const found = findings(report);
  if (!items.length) return { state: "ok", count: 0, title: phrase("No diagnosis yet"), rest: "" };
  const quiet = silencedOf(report).length;
  if (!found.length) {
    return {
      state: "ok",
      count: 0,
      title: phrase("Environment ok"),
      rest: quiet
        ? `${phrase("{n} checks, none of them complaining", { n: items.length })} · ${phrase("{n} silenced", { n: quiet })}`
        : phrase("{n} checks, none of them complaining", { n: items.length })
    };
  }
  const worst = found[0];
  if (worst.state === "fail" || found.length === 1) {
    return { state: worst.state, count: found.length, title: headlineOf(worst), rest: worst.detail || "" };
  }
  return {
    state: "warn",
    count: found.length,
    title: phrase("{n} warnings", { n: found.length }),
    rest: phrase("the worst of them: {what}", { what: headlineOf(worst) })
  };
}

export function seatNameOf(model, at) {
  const when = shortTime(at || new Date().toISOString()).replace(/[^0-9]/g, "").slice(-6);
  return `ambiente-${(model?.ids || [])[0] || "doctor"}-${when}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

const doctorCommand = (report) => `${report?.ranWith || "the doctor"} --json`;

export function missionOf(model, report) {
  const lines = [
    phrase("Mission: {what}.", { what: headlineOf(model) }),
    "",
    phrase("The hive doctor failed the check {id} on {dev}'s machine, at {when}.", {
      id: (model?.ids || []).join(" + "),
      dev: report?.dev || "this",
      when: shortTime(report?.generatedAt)
    }),
    "",
    phrase("What it saw: {detail}", { detail: model?.detail || "" })
  ];
  if (model?.fix) {
    lines.push("", phrase("The recipe the doctor suggests, which you may run, adapt or throw away:"), `  ${model.fix.command}`);
  }
  lines.push(
    "",
    phrase("Before you run anything, distrust the recipe: the doctor only looks at what this one check looks at, so the cause can be one step upstream. Read the state yourself first, and say so if the recipe is wrong."),
    "",
    phrase("Done when {command} reports {id} as ok. Run it and paste the output. If it does not go green, say what is stopping it — do not insist.", {
      command: doctorCommand(report),
      id: (model?.ids || []).join(" + ")
    })
  );
  return lines.join("\n");
}

export function missionOfAll(models, report) {
  const lines = [
    phrase("Mission: the hive doctor is complaining about {n} things on this machine.", { n: models.length }),
    "",
    phrase("It ran on {dev}'s machine at {when}. Each finding below carries the recipe the doctor suggests — run, adapt or throw each one away, and distrust all of them: the doctor only looks at what each check looks at.", {
      dev: report?.dev || "this",
      when: shortTime(report?.generatedAt)
    }),
    ""
  ];
  for (const model of models) {
    lines.push(`- ${(model.ids || []).join(" + ")} · ${headlineOf(model)}`);
    if (model.detail) lines.push(`  ${model.detail}`);
    if (model.fix) lines.push(`  ${model.fix.command}`);
  }
  lines.push(
    "",
    phrase("Done when {command} is green on every id above. Take them one at a time, paste what each one answered, and say which ones you could not close and why.", { command: doctorCommand(report) })
  );
  return lines.join("\n");
}

const STYLE = `
#status-strip { display: flex; align-items: center; gap: 9px; min-width: 0; height: 30px; padding: 0 14px; border-bottom: 1px solid var(--line); background: var(--panel-2); font-size: 12px; color: var(--txt-2); overflow: hidden; }
#status-strip:empty { height: 0; padding: 0; border-bottom-width: 0; }
#status-strip .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--green); }
#status-strip.warn .dot { background: var(--yellow); }
#status-strip.fail .dot { background: var(--red); box-shadow: 0 0 0 3px rgba(214,92,92,.16); }
#status-strip b { color: var(--txt); font-weight: 600; white-space: nowrap; }
#status-strip .sep { color: var(--line-3); flex: none; }
#status-strip .rest { color: var(--txt-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#status-strip .grow { flex: 1; min-width: 0; }
#status-strip .when { font-family: var(--mono); font-size: 10.5px; color: var(--txt-3); flex: none; }
#status-strip .go { all: unset; cursor: pointer; flex: none; font-size: 11px; color: var(--accent-hi); border: 1px solid var(--accent-d); background: var(--accent-bg); border-radius: 4px; padding: 2px 9px; }
#status-strip .go:hover { color: var(--txt); }
#status-strip .go.pri { background: var(--accent); border-color: var(--accent); color: #160B07; font-weight: 600; }
#status-strip .go.pri:hover { color: #160B07; }
#status-strip .go:disabled { cursor: default; opacity: .5; }
#status-strip .quiet { all: unset; cursor: pointer; flex: none; font-size: 10.5px; color: var(--txt-3); border: 1px solid transparent; border-radius: 4px; padding: 2px 8px; }
#status-strip .quiet:hover { color: var(--txt-2); border-color: var(--line-2); }

#doctor-panel { position: fixed; inset: 0; z-index: 86; display: grid; place-items: center; padding: 28px; background: rgba(6,6,6,.58); backdrop-filter: blur(6px) saturate(120%); -webkit-backdrop-filter: blur(6px) saturate(120%); animation: dr-fade 140ms var(--ease); }
#doctor-panel:empty { display: none; }
#doctor-panel .dr-card { box-sizing: border-box; width: min(960px, 100%); max-height: min(84vh, 820px); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; overflow: hidden; background: var(--panel); border: 1px solid var(--line-2); border-radius: var(--r3); box-shadow: 0 30px 80px -20px rgba(0,0,0,.8), var(--hair); outline: none; animation: dr-rise 180ms var(--ease); }
@keyframes dr-fade { from { opacity: 0; } }
@keyframes dr-rise { from { opacity: 0; transform: translateY(10px) scale(.985); } }
@media (prefers-reduced-motion: reduce) { #doctor-panel, #doctor-panel .dr-card { animation: none; } }
#doctor-panel .grow { flex: 1; min-width: 0; }
#doctor-panel .dr-head { display: flex; align-items: center; gap: 12px; padding: 18px 22px 16px; border-bottom: 1px solid var(--line); }
#doctor-panel .dr-badge { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: var(--r2); background: color-mix(in srgb, var(--green) 14%, transparent); color: var(--green); }
#doctor-panel .dr-badge.warn { background: color-mix(in srgb, var(--yellow) 14%, transparent); color: var(--yellow); }
#doctor-panel .dr-badge.fail { background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red); }
#doctor-panel .dr-badge .ic { width: 16px; height: 16px; }
#doctor-panel .dr-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
#doctor-panel .dr-head h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.01em; color: var(--txt); }
#doctor-panel .dr-head .cnt { font-size: 12px; color: var(--txt-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#doctor-panel .dr-head .x { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--r1); font-size: 18px; line-height: 1; color: var(--txt-3); }
#doctor-panel .dr-head .x:hover, #doctor-panel .dr-head .x:focus-visible { color: var(--txt); background: var(--panel-3); }
#doctor-panel .dr-body { overflow-y: auto; padding: 14px 22px 18px; scrollbar-width: thin; }
#doctor-panel .dr-list { display: grid; gap: 8px; }
#doctor-panel .dr-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; align-items: start; column-gap: 12px; padding: 13px 12px 13px 14px; border: 1px solid var(--line); border-radius: var(--r2); background: var(--panel-2); transition: border-color 120ms var(--ease), background 120ms var(--ease); }
#doctor-panel .dr-row.fail, #doctor-panel .dr-row.warn { cursor: pointer; }
#doctor-panel .dr-row.fail:hover, #doctor-panel .dr-row.warn:hover { border-color: var(--line-2); }
#doctor-panel .dr-row.open { cursor: default; border-color: var(--line-3); background: var(--panel-3); }
#doctor-panel .dr-row.fail.open { border-color: color-mix(in srgb, var(--red) 45%, var(--line-2)); }
#doctor-panel .dr-row.warn.open { border-color: color-mix(in srgb, var(--yellow) 40%, var(--line-2)); }
#doctor-panel .dr-row.mute, #doctor-panel .dr-row.done { background: transparent; }
#doctor-panel .dr-row .ic { width: 15px; height: 15px; flex: none; display: block; margin-top: 1px; }
#doctor-panel .dr-row.fail .ic { color: var(--red); }
#doctor-panel .dr-row.warn .ic { color: var(--yellow); }
#doctor-panel .dr-row.done .ic { color: var(--green); }
#doctor-panel .dr-row.mute .ic { color: var(--txt-3); }
#doctor-panel .dr-say { all: unset; cursor: pointer; display: block; min-width: 0; border-radius: var(--r1); }
#doctor-panel .dr-say:focus-visible, #doctor-panel .tog:focus-visible, #doctor-panel .fold:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#doctor-panel .ttl { display: block; font-size: 13.5px; font-weight: 600; line-height: 1.4; color: var(--txt); }
#doctor-panel .dr-row.mute .ttl, #doctor-panel .dr-row.done .ttl { font-weight: 500; color: var(--txt-2); }
#doctor-panel .det { display: block; margin-top: 4px; font-size: 12px; line-height: 1.5; color: var(--txt-2); overflow-wrap: anywhere; }
#doctor-panel .dr-row:not(.open) .det { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
#doctor-panel .dr-side { display: flex; align-items: center; gap: 6px; }
#doctor-panel .act { all: unset; cursor: pointer; font-size: 12px; border-radius: var(--r1); padding: 5px 11px; white-space: nowrap; border: 1px solid var(--line-2); background: var(--panel-3); color: var(--txt); }
#doctor-panel .act:hover { border-color: var(--line-3); }
#doctor-panel .act:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#doctor-panel .act.pri { background: var(--accent); border-color: var(--accent); color: var(--bg); font-weight: 600; }
#doctor-panel .act.ghost { background: transparent; border-color: transparent; color: var(--txt-3); padding: 5px 8px; }
#doctor-panel .act.ghost:hover { color: var(--txt-2); border-color: var(--line-2); }
#doctor-panel .act:disabled { cursor: default; opacity: .5; }
#doctor-panel .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
#doctor-panel .tog { all: unset; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: var(--r1); color: var(--txt-3); }
#doctor-panel .tog:hover { color: var(--txt); background: var(--panel-3); }
#doctor-panel .chev { width: 12px; height: 12px; flex: none; color: inherit; transition: transform 140ms var(--ease); }
#doctor-panel .dr-row.open .chev, #doctor-panel .fold[aria-expanded="true"] .chev { transform: rotate(180deg); }
#doctor-panel .drawer { grid-column: 2 / -1; min-width: 0; margin-top: 12px; }
#doctor-panel .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
#doctor-panel .ids { font-family: var(--mono); font-size: 10.5px; color: var(--txt-3); }
#doctor-panel .slot { font-family: var(--mono); font-size: 10.5px; color: var(--txt-3); border: 1px solid var(--line-2); border-radius: var(--r1); padding: 1px 6px; }
#doctor-panel .cmd { margin: 10px 0 0; background: var(--well); border: 1px solid var(--line); border-radius: var(--r1); padding: 10px 12px; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: var(--txt-2); white-space: pre-wrap; word-break: break-all; }
#doctor-panel .acts { display: flex; align-items: center; gap: 7px; margin-top: 12px; flex-wrap: wrap; }
#doctor-panel .res { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 12px; line-height: 1.5; padding: 7px 11px; border-radius: var(--r1); color: var(--txt-2); background: var(--panel-3); border: 1px solid var(--line-2); }
#doctor-panel .res.ok { color: var(--green-hi); background: color-mix(in srgb, var(--green) 9%, transparent); border-color: var(--green-d); }
#doctor-panel .res.no { color: var(--red); background: color-mix(in srgb, var(--red) 9%, transparent); border-color: var(--red-d); }
#doctor-panel .out { margin: 10px 0 0; background: var(--well); border: 1px solid var(--line); border-radius: var(--r1); padding: 9px 11px; font-family: var(--mono); font-size: 10.5px; line-height: 1.55; color: var(--txt-2); white-space: pre-wrap; overflow-x: auto; max-height: 220px; overflow-y: auto; }
#doctor-panel .fold { all: unset; cursor: pointer; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 12px; margin-top: 6px; padding: 11px 12px 11px 14px; border: 1px solid var(--line); border-radius: var(--r2); font-size: 12.5px; color: var(--txt-2); }
#doctor-panel .fold:hover { color: var(--txt); border-color: var(--line-2); }
#doctor-panel .fold[aria-expanded="true"] { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
#doctor-panel .fold .ic { width: 15px; height: 15px; color: var(--green); flex: none; }
#doctor-panel .fold b { color: var(--txt); font-weight: 600; }
#doctor-panel .passed { display: grid; gap: 0; margin-top: -8px; padding: 6px 14px 10px 41px; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 var(--r2) var(--r2); }
#doctor-panel .passed .one { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); align-items: baseline; gap: 16px; font-size: 12.5px; color: var(--txt-2); padding: 6px 0; border-top: 1px solid var(--line); }
#doctor-panel .passed .one:first-child { border-top: 0; }
#doctor-panel .passed .one > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#doctor-panel .passed .one .w { font-family: var(--mono); font-size: 10.5px; color: var(--txt-3); }
#doctor-panel .dr-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 22px 14px; border-top: 1px solid var(--line); background: var(--panel-2); }
#doctor-panel .dr-foot .dr-hint { font-size: 11.5px; color: var(--txt-3); }
@media (max-width: 860px) {
  #doctor-panel { padding: 12px; }
  #doctor-panel .dr-card { max-height: calc(100vh - 24px); }
  #doctor-panel .dr-head, #doctor-panel .dr-body, #doctor-panel .dr-foot { padding-left: 14px; padding-right: 14px; }
  #doctor-panel .passed .one { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  #status-strip .when { display: none; }
}
body.look-dimension #status-strip { display: flex; align-items: center; gap: 10px; min-width: 0; height: 30px; margin: 0; padding: 0 24px; border: 0; background: none; box-shadow: none; font-size: 12px; color: var(--txt-2); white-space: nowrap; overflow: hidden; }
body.look-dimension #status-strip:empty { height: 0; }
body.look-dimension #status-strip .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--txt); }
body.look-dimension #status-strip.warn .dot { background: var(--yellow); }
body.look-dimension #status-strip.fail .dot { background: var(--red); }
body.look-dimension #status-strip b { color: var(--txt); font-weight: 500; white-space: nowrap; }
body.look-dimension #status-strip .sep { color: var(--txt-3); flex: none; }
body.look-dimension #status-strip .rest { color: var(--txt-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
body.look-dimension #status-strip .grow { flex: 1; min-width: 0; }
body.look-dimension #status-strip .when { font-family: var(--mono); font-size: 11px; color: var(--txt-3); flex: none; }
body.look-dimension #status-strip .go { all: unset; cursor: pointer; flex: none; font-size: 11.5px; line-height: 1.4; color: var(--txt-2); border: 1px solid color-mix(in srgb, var(--txt) 26%, transparent); background: transparent; border-radius: 10px; padding: 3px 8px; }
body.look-dimension #status-strip .go:hover { color: var(--txt); background: color-mix(in srgb, var(--txt) 10%, transparent); }
body.look-dimension #status-strip .go.pri { background: var(--txt); border-color: var(--txt); color: var(--bg); font-weight: 500; border-radius: 9999px; }
body.look-dimension #status-strip .go.pri:hover { color: var(--bg); background: var(--txt); }
body.look-dimension #status-strip .go:disabled { cursor: default; opacity: .5; }
body.look-dimension #status-strip .quiet { all: unset; cursor: pointer; flex: none; font-size: 10.5px; line-height: 1; color: var(--txt-3); border: 1px solid transparent; border-radius: 999px; padding: 4px 9px; }
body.look-dimension #status-strip .quiet:hover { color: var(--txt-2); border-color: var(--line-2); }
`;

const EVERY = 600000;
const FOCUS_GUARD = 60000;

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const raycastOn = () => !!document.body?.classList.contains("experience-raycast");

let strip = null;
let panel = null;
let report = null;
let checking = false;
let hidden = false;
let panelOn = false;
let seeAllOk = false;
let openId = "";
let fixingAll = false;
let clock = null;
let footClock = null;
let pressedOutside = false;
let lastPull = 0;
let lastCheck = "";
const busy = new Set();

const SILENCE_KEY = "hive.doctor.silenced";

function rememberSilenced() {
  try {
    localStorage.setItem(SILENCE_KEY, JSON.stringify(silencedEntries()));
  } catch {}
}

function recallSilenced() {
  try {
    loadSilenced(JSON.parse(localStorage.getItem(SILENCE_KEY) || "[]"));
  } catch {}
}

function mount() {
  recallSilenced();
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);
  strip = document.getElementById("status-strip");
  if (!strip) {
    strip = document.createElement("section");
    strip.id = "status-strip";
    strip.setAttribute("aria-live", "polite");
    const top = document.getElementById("top");
    if (top) top.insertAdjacentElement("afterend", strip);
    else document.body.prepend(strip);
  }
  panel = document.getElementById("doctor-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "doctor-panel";
    const shell = document.getElementById("shell");
    if (shell) shell.insertAdjacentElement("afterend", panel);
    else document.body.appendChild(panel);
  }
  strip.addEventListener("click", onClick);
  panel?.addEventListener("pointerdown", (event) => { pressedOutside = event.target === panel; });
  panel?.addEventListener("click", onClick);
}

function tell() {
  const quiet = new Set(silencedOf(report).flatMap((m) => m.ids));
  const loud = (report?.items || []).filter((i) => (i.state === "warn" || i.state === "fail") && !quiet.has(i.id));
  document.dispatchEvent(new CustomEvent("hive-alerts", {
    detail: {
      count: loud.length,
      state: loud.length ? worstState(loud) : "ok",
      hidden,
      items: loud.map((item) => ({ ...item, headline: headlineOf(item) })),
      automatic: report?.automatic || [],
      checked: report?.generatedAt ? shortTime(report.generatedAt) : "",
      checking
    }
  }));
}

function drawLine() {
  if (!strip) return;
  if (hidden || panelOn || !report) {
    strip.className = "";
    strip.innerHTML = "";
    return;
  }
  if (report.error && raycastOn()) {
    strip.className = "lost";
    strip.innerHTML = `<span class="dot"></span><b>${esc(phrase("The doctor did not answer"))}</b><i class="sep" aria-hidden="true"></i><span class="rest">${esc(report.error)}</span><span class="grow"></span><button class="go" data-doctor="reload">${esc(phrase("check again"))}</button>`;
    return;
  }
  if (report.error) {
    strip.className = "fail";
    strip.innerHTML = `<span class="dot"></span><b>${esc(phrase("The doctor did not answer"))}</b><span class="sep">·</span><span class="rest">${esc(report.error)}</span><span class="grow"></span><button class="quiet" data-doctor="reload">${esc(phrase("check again"))}</button>`;
    return;
  }
  const said = lineOf(report);
  if (said.state === "ok") {
    strip.className = "";
    strip.innerHTML = "";
    return;
  }
  strip.className = said.state;
  const auto = autoFixable(report);
  const off = fixingAll || busy.size || checking ? "disabled" : "";
  const resolve = auto.length
    ? `<button class="go pri" data-doctor="fix-all" ${off}>${esc(fixingAll
        ? phrase("fixing…")
        : auto.length === 1 ? phrase("fix it") : phrase("fix the {n}", { n: auto.length }))}</button>`
    : "";
  const count = said.count === 1 ? phrase("1 open") : phrase("{n} open", { n: said.count });
  const worst = said.count === 1 ? said.rest : headlineOf(findings(report)[0]);
  if (raycastOn()) {
    strip.innerHTML = `<span class="dot"></span><b>${esc(count)}</b>${worst ? `<i class="sep" aria-hidden="true"></i><span class="rest">${esc(worst)}</span>` : ""}<span class="grow"></span>${resolve}<button class="go" data-doctor="open">${esc(phrase("open"))}</button><button class="quiet" data-doctor="dismiss" title="${esc(phrase("hide this line — the counter in the header brings it back"))}">${esc(phrase("hide"))}</button>`;
    return;
  }
  strip.innerHTML = `<span class="dot"></span><b>${esc(count)}</b>${worst ? `<span class="sep">·</span><span class="rest">${esc(worst)}</span>` : ""}<span class="grow"></span>${resolve}<button class="go" data-doctor="open">${esc(phrase("open"))}</button><button class="quiet" data-doctor="dismiss" title="${esc(phrase("hide this line — the counter in the header brings it back"))}">${esc(phrase("hide"))}</button>`;
}

function severityWord(state) {
  if (state === "fail") return phrase("failure");
  if (state === "warn") return phrase("warning");
  if (state === "mute") return phrase("silenced");
  return phrase("solved");
}

const ICON = {
  fail: `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke-linecap="round"/></svg>`,
  warn: `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.4 14.6 13.6H1.4z"/><path d="M8 6.6v3.1" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".85" fill="currentColor" stroke="none"/></svg>`,
  done: `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M5.3 8.2 7.2 10.1l3.5-4"/></svg>`,
  mute: `<svg class="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.6 3.2 5.4 5.9H2.9v4.2h2.5l3.2 2.7z"/><path d="M11.4 6.2l2.7 3.6M14.1 6.2l-2.7 3.6"/></svg>`
};

const CHEV = `<svg class="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.6 4.4 6 7.8l3.4-3.4"/></svg>`;

const SHORT = {
  fix: "Fix it",
  investigate: "Look into it",
  copy: "Copy command"
};

function actionButton(model, whole) {
  if (!model.fix) return "";
  const off = busy.has(model.fixId) ? "disabled" : "";
  const id = esc(model.fixId);
  const what = model.fix.kind === "copy" ? "copy" : "fix";
  const weight = model.fix.kind === "fix" ? "act pri" : "act";
  const says = whole ? phrase(model.fix.label) : phrase(SHORT[model.fix.kind] || SHORT.fix);
  const hint = whole ? "" : ` title="${esc(phrase(model.fix.label))}"`;
  return `<button class="${weight}" data-doctor="${what}" data-id="${id}"${hint} ${off}>${esc(says)}</button>`;
}

function resultBlock(result) {
  if (!result) return "";
  const out = result.output ? `<pre class="out">${esc(result.output)}</pre>` : "";
  if (result.kind === "investigate" && result.ok) return `${result.text ? `<div class="res">${esc(result.text)}</div>` : ""}${out}`;
  const tone = result.running ? "" : result.ok ? " ok" : " no";
  return `${result.text ? `<div class="res${tone}">${esc(result.text)}</div>` : ""}${out}`;
}

function drawer(model) {
  const slot = slotOf(model.ids[0]);
  return `<div class="drawer">
    <div class="meta"><span class="ids">${esc(model.ids.join(" + "))}</span>${slot ? `<span class="slot">${esc(phrase(SLOT_SAYS[slot]))}</span>` : ""}</div>
    ${model.fix ? `<pre class="cmd">${esc(model.fix.command)}</pre>` : ""}
    ${resultBlock(resultFor(model))}
    <div class="acts">
      ${actionButton(model, true)}
      <button class="act ghost" data-doctor="chat" data-id="${esc(model.ids[0])}">${esc(phrase("Solve in a chat"))}</button>
      ${canSilence(model) ? `<button class="act ghost" data-doctor="silence" data-id="${esc(model.ids[0])}">${esc(phrase("don't warn me until this changes"))}</button>` : ""}
      ${report?.ignored ? `<button class="act ghost" data-doctor="ignore" data-id="${esc(model.ids[0])}">${esc(model.state === "fail" ? phrase("ignore it for 7 days") : phrase("ignore it for good"))}</button>` : ""}
    </div>
  </div>`;
}

function mutedSays(model) {
  const until = ignoredUntil(model);
  if (until === null) return phrase("silenced until it changes");
  if (until === 0) return phrase("ignored for good");
  return phrase("ignored until {when}", { when: new Date(until).toLocaleDateString() });
}

async function setIgnored(model, forget) {
  try {
    const r = await fetch("/api/doctor/ignore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: model.ids, state: model.state, forget })
    });
    const answer = await r.json();
    if (answer?.ignored) {
      loadIgnored(answer.ignored);
      report = { ...report, ignored: answer.ignored };
    }
  } catch {}
  if (openId === keyOf(model)) openId = "";
  draw();
}

function row(model, kind) {
  const state = kind || (model.state === "fail" ? "fail" : "warn");
  const loud = state === "fail" || state === "warn";
  const open = loud && openId === keyOf(model);
  const result = resultFor(model);
  const solved = result?.at ? phrase("solved {when}", { when: shortTime(new Date(result.at).toISOString()) }) : "";
  const said = loud
    ? model.detail || ""
    : state === "mute"
      ? mutedSays(model)
      : [solved, result?.text].filter(Boolean).join(" — ");
  const side = state === "mute"
    ? ignored(model)
      ? `<button class="act" data-doctor="unignore" data-id="${esc(model.ids[0])}">${esc(phrase("bring it back"))}</button>`
      : `<button class="act" data-doctor="unsilence" data-id="${esc(model.ids[0])}">${esc(phrase("bring it back"))}</button>`
    : loud && !open
      ? actionButton(model)
      : "";
  const toggle = loud
    ? `<button class="tog" data-doctor="expand" data-id="${esc(keyOf(model))}" aria-expanded="${open}" aria-label="${esc(open ? phrase("collapse") : phrase("expand"))}" tabindex="-1">${CHEV}</button>`
    : "";
  return `<article class="dr-row ${state}${open ? " open" : ""}" data-ids="${esc(model.ids.join(" "))}"${loud ? ` data-key="${esc(keyOf(model))}"` : ""}>
    ${ICON[state]}
    ${loud
      ? `<button class="dr-say" data-doctor="expand" data-id="${esc(keyOf(model))}" aria-expanded="${open}">
          <span class="sr">${esc(severityWord(state))}</span>
          <span class="ttl">${esc(headlineOf(model))}</span>
          ${said ? `<span class="det">${esc(said)}</span>` : ""}
        </button>`
      : `<div>
          <span class="sr">${esc(severityWord(state))}</span>
          <span class="ttl">${esc(state === "mute" ? headlineOf(model) : phrase(model.title || model.ids[0]))}</span>
          ${said ? `<span class="det">${esc(said)}</span>` : ""}
        </div>`}
    <div class="dr-side">${side}${toggle}</div>
    ${open ? drawer(model) : ""}
  </article>`;
}

function passedFold(report) {
  const kept = new Set([...settledOf(report), ...silencedOf(report)].flatMap((m) => m.ids));
  const quiet = (report.items || []).filter((i) => (i.state === "ok" || i.state === "skip") && !kept.has(i.id));
  if (!quiet.length) return "";
  const rows = quiet.map((i) => `<div class="one"><span>${esc(phrase(i.title))}</span><span class="w">${esc(i.detail || "")}</span></div>`).join("");
  return `<button class="fold" data-doctor="see-ok" aria-expanded="${seeAllOk}">
      ${ICON.done}
      <span><b>${esc(phrase("{n} checks passed", { n: quiet.length }))}</b></span>
      <span class="grow"></span>
      ${CHEV}
    </button>${seeAllOk ? `<div class="passed">${rows}</div>` : ""}`;
}

function nextIn() {
  const left = Math.max(0, EVERY - (Date.now() - lastPull));
  const minutes = Math.round(left / 60000);
  return minutes <= 1
    ? phrase("next check in under a minute · or when this window comes back into focus")
    : phrase("next check in {n} min · or when this window comes back into focus", { n: minutes });
}

function cardOf() {
  let card = panel.querySelector(".dr-card");
  if (card) return card;
  card = document.createElement("div");
  card.className = "dr-card";
  card.tabIndex = -1;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "dr-title");
  panel.appendChild(card);
  queueMicrotask(() => card.focus({ preventScroll: true }));
  return card;
}

function drawPanel() {
  if (!panel) return;
  if (!panelOn || !report || report.error) {
    panel.innerHTML = "";
    return;
  }
  const when = report.generatedAt ? shortTime(report.generatedAt) : "";
  const open = findings(report);
  const count = open.length
    ? phrase("{n} open of {all}", { n: open.length, all: (report.items || []).length })
    : phrase("all {n} checks passed", { n: (report.items || []).length });
  const auto = autoFixable(report);
  const off = fixingAll || busy.size || checking ? "disabled" : "";
  const worst = open.length ? (open[0].state === "fail" ? "fail" : "warn") : "done";
  const card = cardOf();
  const scrolled = card.querySelector(".dr-body")?.scrollTop || 0;
  const focused = document.activeElement && card.contains(document.activeElement) ? document.activeElement : null;
  const refocus = focused?.dataset?.doctor ? `[data-doctor="${focused.dataset.doctor}"]${focused.dataset.id ? `[data-id="${CSS.escape(focused.dataset.id)}"]` : ""}` : "";
  card.innerHTML = `
    <div class="dr-head">
      <span class="dr-badge ${worst === "done" ? "" : worst}">${ICON[worst]}</span>
      <div class="dr-title">
        <h3 id="dr-title">${esc(phrase("Environment"))}</h3>
        <span class="cnt">${esc(count)} · ${esc(report.pod || report.dev || "")}</span>
      </div>
      <span class="grow"></span>
      <button class="act" data-doctor="reload" ${checking ? "disabled" : ""}>${esc(checking ? phrase("checking…") : phrase("check again"))}</button>
      <button class="x" data-doctor="close" aria-label="${esc(phrase("close"))}" title="${esc(phrase("close"))}">×</button>
    </div>
    <div class="dr-body">
      <div class="dr-list">
        ${open.map((model) => row(model)).join("")}
        ${silencedOf(report).map((model) => row(model, "mute")).join("")}
        ${settledOf(report).map((model) => row(model, "done")).join("")}
        ${passedFold(report)}
      </div>
    </div>
    <div class="dr-foot">
      <span class="dr-hint">${esc(when ? phrase("checked {when}", { when }) : "")}${when ? " · " : ""}${esc(lastCheck || nextIn())}</span>
      <span class="grow"></span>
      ${settledOf(report).length ? `<button class="act ghost" data-doctor="clear-settled">${esc(phrase("clear"))}</button>` : ""}
      ${auto.length ? `<button class="act pri" data-doctor="fix-all" ${off}>${esc(fixingAll ? phrase("fixing…") : auto.length === 1 ? phrase("fix it") : phrase("fix the {n}", { n: auto.length }))}</button>` : ""}
      ${open.length > 1 ? `<button class="act" data-doctor="chat-all">${esc(phrase("Solve the {n} in one chat", { n: open.length }))}</button>` : ""}
    </div>`;
  const body = card.querySelector(".dr-body");
  if (body) body.scrollTop = scrolled;
  if (refocus) card.querySelector(refocus)?.focus({ preventScroll: true });
}

function draw() {
  tell();
  drawLine();
  drawPanel();
}

const signature = () => (report?.items || []).map((i) => `${i.id}:${i.state}:${i.detail}`).join("|");

async function pull(force) {
  if (force) {
    checking = true;
    draw();
  }
  try {
    const r = await fetch(`/api/doctor${force ? "?force=1" : ""}`);
    if (r.status === 404) return stopChecking();
    const before = signature();
    report = await r.json();
    if (report.ignored) loadIgnored(report.ignored);
    keepHealed(report.healed);
    lastPull = Date.now();
    lastCheck = force && !report.error && signature() === before ? phrase("checked again — nothing moved") : "";
  } catch {
    report = { ...(report || {}), error: phrase("could not reach the console") };
  }
  checking = false;
  draw();
}

export function keepHealed(healed) {
  for (const attempt of healed || []) {
    const label = phrase(attempt.label || attempt.id);
    keepResult(attempt.id, attempt.ok
      ? { kind: "fix", ok: true, text: phrase("{label} — done on its own", { label }) }
      : { kind: "fix", ok: false, text: phrase("{label} did not run on its own: {why}", { label, why: attempt.error || "" }) });
  }
}

function stopChecking() {
  clearInterval(clock);
  clock = null;
  clearInterval(footClock);
  footClock = null;
  report = null;
  checking = false;
  draw();
}

async function runFix(model) {
  const at = model.fixId || model.ids[0];
  const kind = model.fix.kind;
  busy.add(at);
  keepResult(at, { kind, running: true, text: phrase("running: {label}", { label: phrase(model.fix.label) }) });
  draw();
  let answer = null;
  try {
    const r = await fetch("/api/doctor/fix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: at })
    });
    answer = await r.json();
  } catch {
    answer = { error: phrase("the console did not answer") };
  }
  busy.delete(at);
  const where = answer?.id || at;
  if (answer?.error) {
    keepResult(where, { kind: answer.kind || kind, ok: false, text: answer.error });
  } else if (answer?.kind === "investigate") {
    keepResult(where, { kind: "investigate", ok: true, text: phrase("{label} — read it, it changed nothing", { label: phrase(answer.label || model.fix.label) }), output: answer.output || "" });
  } else {
    keepResult(where, { kind: "fix", ok: true, text: phrase("{label} — the check went green", { label: phrase(answer?.label || model.fix.label) }), output: answer?.output || "" });
  }
  return kind;
}

async function fixAll() {
  if (fixingAll) return;
  const ids = autoFixable(report);
  if (!ids.length) return;
  fixingAll = true;
  draw();
  for (const id of ids) {
    const model = cardsOf(report).find((m) => m.fixId === id);
    if (model?.fix) await runFix(model);
  }
  fixingAll = false;
  await pull(false);
}

async function act(id) {
  const model = cardsOf(report).find((m) => m.fixId === id || m.ids.includes(id));
  if (!model?.fix) return;
  const at = model.fixId || model.ids[0];
  const kind = model.fix.kind;
  if (kind === "copy") {
    await navigator.clipboard.writeText(model.fix.command).catch(() => {});
    keepResult(at, { kind: "copy", ok: true, text: phrase("copied: {command}", { command: model.fix.command }) });
    draw();
    return;
  }
  await runFix(model);
  if (kind === "investigate") draw();
  else await pull(false);
}

async function chat(models) {
  if (!models.length) return;
  const one = models.length === 1 ? models[0] : null;
  const at = one ? one.ids[0] : "__report__";
  const name = seatNameOf(one || { ids: ["all"] }, new Date().toISOString());
  const title = one ? phrase("environment: {what}", { what: headlineOf(one) }) : phrase("environment: {n} findings", { n: models.length });
  keepResult(at, { kind: "chat", ok: true, text: phrase("opening a local chat on this…") });
  draw();
  let answer = null;
  try {
    const r = await fetch("/api/spawn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        title,
        where: "local",
        prompt: one ? missionOf(one, report) : missionOfAll(models, report),
        structured: true,
        agent: "claude"
      })
    });
    answer = await r.json();
  } catch (err) {
    answer = { error: err.message };
  }
  if (answer?.ok) keepResult(at, { kind: "chat", ok: true, text: phrase("a local chat is on it: {name}", { name }) });
  else keepResult(at, { kind: "chat", ok: false, text: phrase("could not open the chat: {why}", { why: answer?.error || "unknown" }) });
  draw();
}

function openPanel(id) {
  hidden = false;
  window.hiveOpenPod?.();
  if (id) show(id);
  else draw();
}

function show(id) {
  panelOn = true;
  const wanted = findings(report).find((m) => m.ids.includes(id));
  if (wanted) openId = keyOf(wanted);
  drawPanel();
  const found = panel?.querySelector(`[data-ids~="${CSS.escape(id)}"]`);
  found?.scrollIntoView({ block: "nearest" });
}

function onClick(event) {
  if (event.target === panel && pressedOutside) {
    panelOn = false;
    drawPanel();
    return;
  }
  const target = event.target.closest("[data-doctor]");
  if (!target) {
    const shut = event.target.closest(".dr-row[data-key]:not(.open)");
    if (shut) {
      openId = shut.dataset.key;
      drawPanel();
    }
    return;
  }
  const what = target.dataset.doctor;
  if (what === "dismiss") {
    hidden = true;
    draw();
    return;
  }
  if (what === "open") {
    openPanel(findings(report)[0]?.ids?.[0] || "");
    return;
  }
  if (what === "close") {
    panelOn = false;
    drawPanel();
    return;
  }
  if (what === "reload") {
    pull(true);
    return;
  }
  if (what === "see-ok") {
    seeAllOk = !seeAllOk;
    drawPanel();
    return;
  }
  if (what === "expand") {
    openId = openId === target.dataset.id ? "" : target.dataset.id;
    drawPanel();
    return;
  }
  if (what === "fix-all") {
    fixAll();
    return;
  }
  if (what === "silence" || what === "unsilence") {
    const model = cardsOf(report).find((m) => m.ids.includes(target.dataset.id));
    if (model) {
      if (what === "silence") {
        silence(model);
        if (openId === keyOf(model)) openId = "";
      } else unsilence(model);
      rememberSilenced();
      draw();
    }
    return;
  }
  if (what === "ignore" || what === "unignore") {
    const model = cardsOf(report).find((m) => m.ids.includes(target.dataset.id));
    if (model) setIgnored(model, what === "unignore");
    return;
  }
  if (what === "clear-settled") {
    for (const model of settledOf(report)) model.ids.forEach(forgetResult);
    draw();
    return;
  }
  if (what === "chat-all") {
    chat(findings(report));
    return;
  }
  if (what === "chat") {
    const model = cardsOf(report).find((m) => m.ids.includes(target.dataset.id));
    if (model) chat([model]);
    return;
  }
  if (what === "fix" || what === "copy") act(target.dataset.id);
}

if (typeof document !== "undefined") {
  window.hiveDoctorFix = (id) => {
    openPanel(id);
    act(id);
  };

  window.hiveDoctorChat = (id) => {
    const model = cardsOf(report).find((m) => m.ids.includes(id));
    if (model) chat([model]);
  };

  window.hiveDoctorCheck = () => {
    if (checking) return false;
    pull(true);
    return true;
  };

  window.hiveDoctorPull = (force) => pull(!!force);

  window.hiveDoctorPanel = (visible) => {
    panelOn = !!visible;
    drawPanel();
  };

  window.hiveDoctorPanelOn = () => panelOn;

  window.hiveDoctorOpen = (id) => openPanel(id || "");

  window.hiveAlertsToggle = () => {
    hidden = !hidden;
    draw();
    return hidden;
  };

  mount();
  document.addEventListener("hive:experience", () => {
    drawLine();
    tell();
  });
  pull(false);
  clock = setInterval(() => pull(false), EVERY);
  footClock = setInterval(() => {
    const hint = panel?.querySelector(".dr-foot .dr-hint");
    if (hint) hint.textContent = nextIn();
  }, 30000);
  window.addEventListener("focus", () => {
    if (Date.now() - lastPull < FOCUS_GUARD) return;
    pull(false);
  });
}
