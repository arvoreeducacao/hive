import { catalogRun as runProviderCatalog, catalogRpc as rpcProviderCatalog } from "../server/provider-catalog.mjs";
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import { chmodSync, closeSync, createReadStream, existsSync, realpathSync, mkdirSync, openSync, readdirSync, readFileSync, readSync as readBytesSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { CREDENTIAL_SAVED, loginConfirmed } from "./lib/server-login.mjs";
import { serverGuideOf } from "./lib/server-guide.mjs";
import { writeFile, mkdir, rename, rm, unlink, appendFile } from "node:fs/promises";
import { parse as parseJsonc, printParseErrorCode, modify, applyEdits } from "jsonc-parser";
import { createHash, randomUUID } from "node:crypto";
import { seatKey, fleetPlan, ownsFleet, localRestoreScript, localRestorePlan, seatIsRestorable, archiveEntry, seatFromArchive, archiveOrder, GAVE_UP_NOTHING_TO_RESUME, withoutTheLiving, HELD_STILL_ANSWERS, settleSpawnJobs, forgetSpawnJobsOf } from "./lib/fleet.mjs";
import { secretsForSeats } from "./lib/secrets.mjs";
import { PEER_MODULE_PROBE, peerToolsCommand } from "./lib/peer-tools.mjs";
import { peerEntry } from "../server/engine/peer-module.mjs";
import { accountsDir, readAccounts as accountsHeld, shapeAccount } from "./lib/accounts.mjs";
import { PROVIDERS, PROVIDER_IDS, parseVersion, providerHomeOf, providerReadiness, providerSettings, readProviderAccounts, shapeProviderAccount } from "./lib/providers.mjs";
import { accountNameInCommand, isProvider, oneLoginOnly, providerEnv, providerEnvDir } from "../server/engine/providers.mjs";
import { DEFAULT_ACCOUNT, accountDir, accountOrder, accountsRoot, noteBack, writeOrder } from "../server/engine/accounts.mjs";
import { registerProviderRoutes } from "./routes/providers.mjs";
import { accountDirOf, seatArgv, seatCommand } from "../server/engine/seat-command.mjs";
import { inlineImageMarks, missionImagesFile } from "../server/engine/protocol.mjs";
import { hiveShellExec, writeHiveShellRc } from "../server/engine/hive-shell.mjs";
import { socketPathFor, isNamedPipe, whoHasTheDoor, sweepStale } from "./lib/doorstep.mjs";
import { strandedHelpers, strandedServers } from "./lib/helpers.mjs";
import { loginUrlIn, loginVerdict } from "./lib/mcp-login.mjs";
import { keepShot, readShot } from "./lib/shot.mjs";
import { machineName, peerOfTheBoard, teamFromBoard, liveliestOfDev, POKE_FRESH, GRANT_MS, LIVE_DIR, panelOf, pagesOf, watchersOf, readPanel, knockOf, pokeOf, readKnock, readSay, sayLine, grantLive, turnsOfTail, liveOfTail, liveFileOf, readPoke, canPoke, askOf, readAsk, readOutbox, answerOf, readAnswer, askLine, owedOf, owedLive, owedText, owedFrom, OWED_FILE } from "./lib/team.mjs";
import { pickRepo, runsFromBundle, builtBundle, sameCommit, notesFromSubjects, updateFromReleases, updatePicked, releasesQuery, releaseOf, notesBetween, downloadScript, verifyScript, unpackScript, unpackedBundle, rpmInstallOf } from "./main/update.js";
import { packOf, signatureOf, verifyPack, jsRootOf, sweepJsScript, unpackPackScript, signingTeam, sdkAgreement } from "./main/ota.js";
import { extensionOf, refuseDrop, FILE_CEILING } from "./assets/drops.mjs";
import { addComment, askedTab, canonicalLabel, catchUp, commentCommitLine, commitLine, keepPrint, leafIdOf, oneAtATime, PRINT_KINDS, printsDir, printsPage, readComments as readShelfComments, readPage as readShelfPage, readMeta as readShelfMeta, readPrints, keepThumb, PNG_DATA_URL, readThumb, sendToShelf, settleComment, settleCommitLine, shelfIndex, shelve, slugOf, tabOf, TABS, thumbQueue } from "./lib/shelf.mjs";
import { withPinShim } from "./lib/shelf-pins.mjs";
import { rebuildWhenStale } from "./lib/fresh-bundle.mjs";
import { leafReady } from "./lib/leaf-held.mjs";
import { sendToLeaf } from "./lib/leaf-page.mjs";
import { byErrand, closedErrands, errandOf, forgetOldKin, goneKin, keepErrands, markSeen, noteErrand, readErrands, readSeen, renameErrand, withErrands, zonesOf } from "./lib/errands.mjs";
import { seatsOfStatus, takeoverMessages } from "./lib/canopy-watch.mjs";
import { assertSpawnArgs } from "./lib/spawn-args.mjs";
import { freeNameAmong, nameFromAnswer, nameFromMission, namerCommand, pastHandles, slug } from "./lib/naming.mjs";
import { codexKnownServers, codexServerToAdd } from "./lib/codex-mcp.mjs";
import { isPlainObject, FONT_DEFAULTS, GITHUB_REPO_URL, cleanFont, cleanKeys, cleanSound, cleanSounds, cleanVolume, cleanFlag, cleanMachine, cleanLayout, cleanBlockSize, cleanLanguage, cleanTerminal, cleanSttLanguage, cleanSttModel, cleanPet, cleanBrandFace, cleanGaze, cleanExperience, cleanExperienceOff, cleanInfoWidth, cleanInfoHeight, cleanThreadWidth, cleanPaneWidth, cleanLook, cleanStructure, cleanVisual, cleanShelf, cleanThemeName, cleanThemes, cleanAvatar, cleanWear, cleanPatch, cleanAutocompact, cleanQuietDays, cleanProviders, cleanExtensions, sameGithubRepo } from "./lib/config.mjs";
import { seatsGoneQuiet, quietReason, QUIET_SWEEP_EVERY_MS } from "./lib/quiet-seats.mjs";
import { cleanDiaryDays, diariesToPrune, pruneDiary, readDiaries, readSeatMeta, syncedSessionIds } from "./lib/diary-prune.mjs";
import { autocompactFromConfig } from "../server/engine/agents.mjs";
import { leftoversOf, readTable, reap } from "../server/engine/leftovers.mjs";
import { builtinClaudePath, bundledClaudeVersion, chosenClaude, claudeOnPath } from "../server/engine/claude-binary.mjs";
import { behindOf, createLatestVersions, tailOfUpdate, updatePlanOf } from "./lib/agent-updates.mjs";
import { readScreen, findThinking, deriveState, modelOnScreen, since } from "./lib/screen.mjs";
import { TRAILS_KEPT, trailCwds, treesOfSeat } from "./lib/trails.mjs";
import { CHANGES_SCRIPT, DIFF_SCRIPT, DISCARD_SCRIPT, readChanges, readDiff } from "./lib/changes.mjs";
import { createReach } from "./lib/cloud-reach.mjs";
import { bridgeTerminal } from "./lib/seat-terminal.mjs";
import { browserState, registerBrowserRoutes } from "./routes/browser.mjs";
import { deviceState, registerDeviceRoutes } from "./routes/device.mjs";
import { registerPrRoutes } from "./routes/prs.mjs";
import { registerWorkspaceRoutes } from "./routes/workspace.mjs";
import { registerAccountRoutes } from "./routes/accounts.mjs";
import { registerArchiveRoutes } from "./routes/archive.mjs";
import { registerArtifactRoutes } from "./routes/artifacts.mjs";
import { registerCanopyRoutes } from "./routes/canopy.mjs";
import { registerConfigRoutes } from "./routes/config.mjs";
import { createSttInstaller, registerSttRoutes } from "./routes/stt.mjs";
import { createSttEngine } from "./lib/stt-engine.mjs";
import { registerDoctorRoutes } from "./routes/doctor.mjs";
import { registerErrandRoutes } from "./routes/errands.mjs";
import { registerTaskRoutes } from "./routes/tasks.mjs";
import { registerMeetingRoutes } from "./routes/meetings.mjs";
import { cleanMeetingSettings, summarizerCommand } from "./lib/meetings.mjs";
import { registerRoutineRoutes } from "./routes/routines.mjs";
import { registerExtensionRoutes } from "./routes/extensions.mjs";
import { createRegistry as createExtensionRegistry } from "./lib/extensions.mjs";
import { createStore as createExtensionStore } from "./lib/extension-store.mjs";
import { registerFilesRoutes } from "./routes/files.mjs";
import { registerChangesRoutes } from "./routes/changes.mjs";
import { registerHistoryRoutes } from "./routes/history.mjs";
import { registerHiveRoutes } from "./routes/hive.mjs";
import { registerDraftRoutes } from "./routes/drafts.mjs";
import { draftOf, dropGoneDrafts, keepDraft, readDrafts } from "./lib/drafts.mjs";
import { registerMcpRoutes } from "./routes/mcp.mjs";
import { registerOnboardingRoutes } from "./routes/onboarding.mjs";
import { registerPortariaRoutes } from "./routes/portaria.mjs";
import { registerSeatRoutes } from "./routes/seats.mjs";
import { registerSlackRoutes } from "./routes/slack.mjs";
import { registerTeamRoutes } from "./routes/team.mjs";
import { registerThreadRoutes } from "./routes/threads.mjs";
import { registerUpdateRoutes } from "./routes/updates.mjs";
import { registerUsageRoutes } from "./routes/usage.mjs";
import { registerWorktreeRoutes } from "./routes/worktrees.mjs";
import { registerMemoryRoutes } from "./routes/memories.mjs";
import { createMemorySource, MEMORY_TOKEN_KEY } from "./lib/memories.mjs";
import { createDemoLogin, createMemoryLogin, fileClientStore, memoryOrigin } from "./lib/memory-login.mjs";
import { vaultAccount, vaultFollowing } from "./lib/memory-vault.mjs";
import { asTheSystemWritesIt, HOME, HIVE_HOME, SANDBOX, HIVE_ENV_CONFIG, NS, AWS_PROFILE, CLUSTER, RELEASE_REPO, HUB_FOLDER, REPO_FOLDER, POD_HUB, serverIsWanted, clusterIsWanted, HUB, DEV, POD, STS, ENV_FILE, POKERS, DEPLOYMENT_DIR, LEAF_URL, LEAF_PARENT, MEMORY_SERVER_URL, AVEIA_URL, EXTENSIONS_REPO, readHiveEnvConfig, loadConfig } from "./lib/env.mjs";
import { measureShots, shotsDaysOf, sweepShots } from "./lib/shots-sweep.mjs";
import { withinRoots } from "./lib/bounds.mjs";
import { SLACK_LINK, threadKey, threadCache, storeSessionThreads, collectThreads, readThreadRegistry, writeThreadRegistry, replyOnSlack, reactOnSlack, markOnSlack, slackFileOut, facesOnSlack, nameFromEmail } from "./lib/slack.mjs";
import { storeSessionPrs } from "./lib/prs.mjs";
import { codexLimitsPerAccount, createPlanMemory, dryAccounts, kimiFileStore, kimiLimitsPerAccount, kiroLimitsPerAccount, limitsPerAccount, tightestAccount } from "./lib/limits.mjs";
import { createServers } from "./lib/servers.mjs";
import { createBrokerClient } from "../server/client.mjs";
import { createDesk } from "./lib/seat-desk.mjs";
import { SEAT_KINDS, createRelay } from "./lib/seat-relay.mjs";
import { createPhoneBridge } from "./lib/phone-bridge.mjs";
import { createSlackBridge } from "./lib/slack-bridge.mjs";
import { relayOf, slackKeys } from "./lib/slack-hive.mjs";
import { createSlackLinker } from "./lib/slack-link.mjs";
import { createSessions, driverFileFor } from "../server/sessions.mjs";
import { OWN_SESSION_ID, hiveEventMessages, parseHiveSessions } from "./lib/own-history.mjs";
import { oneRowPerSession, readSeatRecords, scanTranscriptsApart } from "./lib/archive-scan.mjs";
import { foldText, wordsOf } from "./assets/archive-search.mjs";
import { noteSpent, readLedger } from "../server/engine/accounts.mjs";
import { blindNamingError, namesRead } from "./lib/seat-names.mjs";
import { attachServerStream } from "./lib/server-stream.mjs";
import { attachSeat } from "./lib/seat-link.mjs";
import { askTheDoor, findCloudServer, NO_ADDRESS } from "./lib/cloud-door.mjs";
import { avatarFor, avatarKey } from "./assets/avatar/avatar.mjs";
import { moodOf } from "./assets/mood.mjs";
import { workspaceOf, readManifest } from "./lib/hub-workspace.mjs";
import { cloudRepoOfTheHub, hubPathFrom } from "./lib/hub-path.mjs";
import { FIRST_FLIGHT, firstFlightMission } from "./lib/first-flight.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, join } from "node:path";
import { homedir, hostname, tmpdir, userInfo } from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import pty from "node-pty";
import { KEY_BYTES, createNativeRoom, whereExe, pickWhere } from "./lib/native-room.mjs";
import { bashOnWindows } from "./doctor/fix-shell.mjs";
import { installCommand } from "./doctor/installer.mjs";
import { HighlightJS as hljs } from "highlight.js/lib/core";
import hlBash from "highlight.js/lib/languages/bash";
import hlCss from "highlight.js/lib/languages/css";
import hlElixir from "highlight.js/lib/languages/elixir";
import hlJs from "highlight.js/lib/languages/javascript";
import hlJson from "highlight.js/lib/languages/json";
import hlMd from "highlight.js/lib/languages/markdown";
import hlPy from "highlight.js/lib/languages/python";
import hlSql from "highlight.js/lib/languages/sql";
import hlTs from "highlight.js/lib/languages/typescript";
import hlXml from "highlight.js/lib/languages/xml";
import hlYaml from "highlight.js/lib/languages/yaml";

for (const [name, definition] of Object.entries({
  bash: hlBash, css: hlCss, elixir: hlElixir, javascript: hlJs, json: hlJson,
  markdown: hlMd, python: hlPy, sql: hlSql, typescript: hlTs, xml: hlXml, yaml: hlYaml
})) hljs.registerLanguage(name, definition);

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_GUIDE = (() => { try { return serverGuideOf(JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"))); } catch { return ""; } })();
const IS_WINDOWS = process.platform === "win32";

if (IS_WINDOWS) process.env.MSYS2_ARG_CONV_EXCL = "*";

/* on Windows the server and the doctor look for bash in the same place, so
   a Git installed for one user only (under LOCALAPPDATA) is found by both,
   and no BASH || "bash" below ever falls through to the WSL launcher */
const BASH = IS_WINDOWS ? bashOnWindows() : "bash";
const TMUX = "tmux";
/* on Windows a seat is a pty this server holds, with a screen of its own, instead of a
   window of the tmux session — tmux never enters that side, and neither does bash for
   anything a seat does. */
const NATIVE = IS_WINDOWS;
const WINDOWS_FOLDER = /^[A-Za-z]:[\\/][\w.\\/~ ()-]*$/;
const TEMP_DIR = IS_WINDOWS ? tmpdir() : "/tmp";
const SERVER_CONSOLE = "console";
const RECONNECT_KEY = process.platform === "darwin" ? "\u2325R" : "Ctrl+E";

let tmuxAvailable = false;

async function hasTmux() {
  if (NATIVE || tmuxAvailable) return true;
  const r = await shr(...viaBash(TMUX, ["-V"]), { timeout: 20000 });
  tmuxAvailable = r.ok;
  return tmuxAvailable;
}

function viaBash(exe, args) {
  if (!IS_WINDOWS || !BASH) return [exe, args];
  return [BASH, ["-c", 'PATH="/usr/bin:/bin:$PATH"; exec "$0" "$@"', exe, ...args]];
}

function inBash(script) {
  return [BASH || "bash", ["-c", IS_WINDOWS ? 'PATH="/usr/bin:/bin:$PATH"; ' + script : script]];
}

function clusterSaid(error, action) {
  const raw = String(error || "");
  if (/forbidden|cannot (get|update|patch|create)/i.test(raw)) {
    return `your cluster user is not allowed to ${action} the pod — whoever runs the cluster has to grant it (RBAC) or do it for you`;
  }
  if (/no objects passed|not ?found/i.test(raw)) {
    return `there is no statefulset ${STS} in the cluster — your pod has not been provisioned yet`;
  }
  return raw.split("\n").filter(Boolean).pop() || "the cluster refused";
}

const CANOPY_TOKEN_FILE = join(HOME, ".canopy", "token");

function canopyBaseOf(env) {
  return String(env.CANOPY_URL || `http://127.0.0.1:${env.CANOPY_PORT || 4664}`).replace(/\/+$/, "");
}

async function canopyStateOf() {
  const url = canopyBaseOf(process.env);
  let token = "";
  try { token = readFileSync(CANOPY_TOKEN_FILE, "utf8").trim(); } catch {}
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2500);
  try {
    const r = await fetch(`${url}/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: abort.signal });
    return { url, up: r.ok };
  } catch {
    return { url, up: false };
  } finally {
    clearTimeout(timer);
  }
}
const CONFIG_FILE = process.env.HIVE_CONFIG || join(HIVE_HOME, "config.jsonc");
let extensions = createExtensionRegistry();
const LEGACY_KEYS_FILE = process.env.HIVE_KEYBINDINGS || join(homedir(), ".hive/keybindings.jsonc");
const PORT = Number(process.env.PORT || 8790);
const LOCAL_SESSION = process.env.HIVE_LOCAL_SESSION || "hive-local";

let room = null;

function nativeRoom() {
  if (!room) room = createNativeRoom({ hub: HUB, claude: () => theClaude(), log: (line) => console.log(`room: ${line}`) });
  return room;
}

async function nativeProgram(exe, args) {
  const found = await nativeRoom().program(exe === theClaude() ? "claude" : exe);
  if (!found) throw new Error(`${exe} is not installed on this machine`);
  return [found.file, [...found.args, ...args]];
}
const OWNS_FLEET = ownsFleet({ owns: process.env.HIVE_OWNS_FLEET, sandbox: SANDBOX });
const CLOUD = serverIsWanted(process.env, readHiveEnvConfig());
const PHONES = process.env.HIVE_PHONES === "1";
const BIND = PHONES ? (process.env.HIVE_BIND || "127.0.0.1") : "127.0.0.1";
const DEVICES_FILE = process.env.HIVE_DEVICES || join(HIVE_HOME, "devices.json");
const ANOTHER_HIVE_OWNS_THE_PORT = 75;
const LINES = 120;

const CONFIG_HEADER = `// hive — written by the app's panels, safe to edit by hand.
// The app follows this file while it runs, and a write from a panel keeps the
// comments and the formatting you put here.
// Sections: font, sound (the chime when a seat needs you), answered (the notice
// when a seat answers), sounds and volume (which sound each one plays and how
// loud — the knock on a keyboard is always on, and always the one from MSN), look, calm (fewer
// animations, whatever the system asks), avatar, keys,
// share (whether the team sees your fleet), phone (whether your own paired
// phone may read and drive the seats of this machine), machines (whether your own
// other computers may do the same), shelf (the private GitHub repo the
// pages you publish live in), autocompact (how far a seat's conversation runs
// before it is summed up and carried on — \`auto\` leaves it to the agent,
// \`100k\` to \`1000k\` sets your own ceiling; a seat takes it when it comes
// back), theme (the name of the palette the
// app wears) and themes (your custom palettes — shareable as json).`;

const JSONC_FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
const tilde = (file) => file.replace(homedir(), "~");

function configStamp() {
  const at = (file) => { try { return statSync(file).mtimeMs; } catch { return 0; } };
  return `${at(CONFIG_FILE)}:${at(LEGACY_KEYS_FILE)}`;
}

async function readConfigFile(file) {
  if (!existsSync(file)) return { value: null, text: "", error: "" };
  const text = await readFile(file, "utf8");
  const problems = [];
  const value = parseJsonc(text, problems, { allowTrailingComma: true });
  if (problems.length) {
    const first = problems[0];
    return { value: null, text, error: `${tilde(file)}: ${printParseErrorCode(first.error)} at offset ${first.offset}` };
  }
  if (value !== undefined && !isPlainObject(value)) return { value: null, text, error: `${tilde(file)}: expected an object` };
  return { value: value || {}, text, error: "" };
}


async function readConfig() {
  const [main, legacy] = await Promise.all([readConfigFile(CONFIG_FILE), readConfigFile(LEGACY_KEYS_FILE)]);
  const unreadable = [main.error, legacy.error].filter(Boolean);
  const problems = [];
  const raw = main.value || {};
  const fromLegacy = raw.keys === undefined && !!legacy.value && Object.keys(legacy.value).length > 0;
  const config = {
    font: cleanFont(raw.font, tilde(CONFIG_FILE), problems),
    sound: cleanSound(raw.sound, tilde(CONFIG_FILE), problems),
    answered: cleanFlag(raw.answered, "answered", tilde(CONFIG_FILE), problems, false),
    sounds: cleanSounds(raw.sounds, tilde(CONFIG_FILE), problems),
    volume: cleanVolume(raw.volume, tilde(CONFIG_FILE), problems),
    layout: cleanLayout(raw.layout, tilde(CONFIG_FILE), problems),
    blockSize: cleanBlockSize(raw.blockSize, tilde(CONFIG_FILE), problems),
    autocompact: cleanAutocompact(raw.autocompact, tilde(CONFIG_FILE), problems),
    closeQuietAfterDays: cleanQuietDays(raw.closeQuietAfterDays, tilde(CONFIG_FILE), problems),
    pruneDiariesAfterDays: cleanDiaryDays(raw.pruneDiariesAfterDays, tilde(CONFIG_FILE), problems),
    language: cleanLanguage(raw.language, tilde(CONFIG_FILE), problems),
    terminal: cleanTerminal(raw.terminal, tilde(CONFIG_FILE), problems),
    pet: cleanPet(raw.pet, tilde(CONFIG_FILE), problems),
    brandFace: cleanBrandFace(raw.brandFace, tilde(CONFIG_FILE), problems),
    gaze: cleanGaze(raw.gaze, tilde(CONFIG_FILE), problems),
    experience: cleanExperience(raw.experience, tilde(CONFIG_FILE), problems),
    experienceOff: cleanExperienceOff(raw.experienceOff, tilde(CONFIG_FILE), problems),
    infoWidth: cleanInfoWidth(raw.infoWidth, tilde(CONFIG_FILE), problems),
    infoHeight: cleanInfoHeight(raw.infoHeight, tilde(CONFIG_FILE), problems),
    threadWidth: cleanThreadWidth(raw.threadWidth, tilde(CONFIG_FILE), problems),
    paneWidth: cleanPaneWidth(raw.paneWidth, tilde(CONFIG_FILE), problems),
    splitsLearned: cleanFlag(raw.splitsLearned, "splitsLearned", tilde(CONFIG_FILE), problems, false),
    look: cleanLook(raw.look, tilde(CONFIG_FILE), problems),
    structure: cleanStructure(raw.structure, tilde(CONFIG_FILE), problems),
    theme: cleanThemeName(raw.theme, tilde(CONFIG_FILE), problems),
    themes: cleanThemes(raw.themes, tilde(CONFIG_FILE), problems),
    dim: cleanFlag(raw.dim, "dim", tilde(CONFIG_FILE), problems),
    visual: cleanVisual(raw.visual, tilde(CONFIG_FILE), problems),
    composer: cleanFlag(raw.composer, "composer", tilde(CONFIG_FILE), problems),
    share: cleanFlag(raw.share, "share", tilde(CONFIG_FILE), problems),
    knocks: cleanFlag(raw.knocks, "knocks", tilde(CONFIG_FILE), problems),
    phone: cleanFlag(raw.phone, "phone", tilde(CONFIG_FILE), problems, false),
    stt: cleanFlag(raw.stt, "stt", tilde(CONFIG_FILE), problems, false),
    sttLanguage: cleanSttLanguage(raw.sttLanguage, tilde(CONFIG_FILE), problems),
    sttModel: cleanSttModel(raw.sttModel, tilde(CONFIG_FILE), problems),
    meetings: cleanMeetingSettings(raw.meetings, tilde(CONFIG_FILE), problems),
    machines: cleanFlag(raw.machines, "machines", tilde(CONFIG_FILE), problems, false),
    machine: cleanMachine(raw.machine, tilde(CONFIG_FILE), problems),
    shelf: cleanShelf(raw.shelf, tilde(CONFIG_FILE), problems),
    avatar: cleanAvatar(raw.avatar, tilde(CONFIG_FILE), problems),
    providers: cleanProviders(raw.providers, tilde(CONFIG_FILE), problems),
    extensions: cleanExtensions(raw.extensions, tilde(CONFIG_FILE), problems),
    wear: cleanWear(raw.wear, tilde(CONFIG_FILE), problems),
    keys: fromLegacy ? cleanKeys(legacy.value, tilde(LEGACY_KEYS_FILE), problems) : cleanKeys(raw.keys, tilde(CONFIG_FILE), problems)
  };
  if (!config.avatar) config.avatar = avatarKey(avatarFor(DEV || ""));
  const has = { terminal: raw.terminal !== undefined, experience: raw.experience !== undefined, experienceOff: raw.experienceOff !== undefined, infoWidth: raw.infoWidth !== undefined, infoHeight: raw.infoHeight !== undefined, threadWidth: raw.threadWidth !== undefined, paneWidth: raw.paneWidth !== undefined, splitsLearned: raw.splitsLearned !== undefined, font: raw.font !== undefined, sound: raw.sound !== undefined, answered: raw.answered !== undefined, sounds: raw.sounds !== undefined, volume: raw.volume !== undefined, look: raw.look !== undefined, structure: raw.structure !== undefined, layout: raw.layout !== undefined, blockSize: raw.blockSize !== undefined, theme: raw.theme !== undefined, themes: raw.themes !== undefined, dim: raw.dim !== undefined, visual: raw.visual !== undefined, composer: raw.composer !== undefined, share: raw.share !== undefined, knocks: raw.knocks !== undefined, phone: raw.phone !== undefined, stt: raw.stt !== undefined, sttLanguage: raw.sttLanguage !== undefined, sttModel: raw.sttModel !== undefined, meetings: raw.meetings !== undefined, machines: raw.machines !== undefined, machine: raw.machine !== undefined, shelf: raw.shelf !== undefined, avatar: raw.avatar !== undefined, wear: raw.wear !== undefined, providers: raw.providers !== undefined, extensions: raw.extensions !== undefined, brandFace: raw.brandFace !== undefined, gaze: raw.gaze !== undefined, autocompact: raw.autocompact !== undefined, closeQuietAfterDays: raw.closeQuietAfterDays !== undefined, pruneDiariesAfterDays: raw.pruneDiariesAfterDays !== undefined, keys: raw.keys !== undefined || fromLegacy };
  return { config, defaults: { font: FONT_DEFAULTS }, file: tilde(CONFIG_FILE), has, fromLegacy, error: unreadable.join(" · "), ignored: problems.join(" · ") };
}

async function autocompactNow() {
  const { config } = await readConfig();
  return autocompactFromConfig(config);
}

function editLeaves(text, patch, current, path = []) {
  let out = text;
  for (const [key, value] of Object.entries(patch)) {
    const here = [...path, key];
    if (!isPlainObject(value)) {
      out = applyEdits(out, modify(out, here, value, JSONC_FORMAT));
      continue;
    }
    const before = isPlainObject(current?.[key]) ? current[key] : {};
    out = editLeaves(out, value, before, here);
    for (const gone of Object.keys(before)) {
      if (!(gone in value)) out = applyEdits(out, modify(out, [...here, gone], undefined, JSONC_FORMAT));
    }
  }
  return out;
}

async function ensureConfigFile() {
  if (existsSync(CONFIG_FILE)) return;
  try {
    await mkdir(dirname(CONFIG_FILE), { recursive: true });
    await writeFile(CONFIG_FILE, `${CONFIG_HEADER}\n{}\n`);
  } catch {}
}

async function writeConfig(patch) {
  const { clean, problems } = cleanPatch(patch);
  if (problems.length) return { ...(await readConfig()), refused: problems.join(" · ") };

  const current = await readConfigFile(CONFIG_FILE);
  if (current.error) return { ...(await readConfig()), error: current.error };

  const text = current.text || `${CONFIG_HEADER}\n{}\n`;
  const next = editLeaves(text, clean, current.value || {});

  await mkdir(dirname(CONFIG_FILE), { recursive: true });
  const scratch = `${CONFIG_FILE}.writing`;
  await writeFile(scratch, next.endsWith("\n") ? next : `${next}\n`);
  await rename(scratch, CONFIG_FILE);

  let migrated = "";
  if (clean.keys !== undefined && existsSync(LEGACY_KEYS_FILE)) {
    const retired = `${LEGACY_KEYS_FILE}.migrated`;
    await rename(LEGACY_KEYS_FILE, retired);
    migrated = tilde(retired);
  }
  return { ...(await readConfig()), migrated };
}


const ownHelpers = new Set();

function killGroup(pid) {
  try { process.kill(-pid, "SIGKILL"); return true; } catch {}
  return false;
}

function killTree(pid) {
  if (killGroup(pid)) return true;
  try { process.kill(pid, "SIGKILL"); return true; } catch {}
  return false;
}

function killOwnHelpers() {
  for (const pid of ownHelpers) killTree(pid);
  ownHelpers.clear();
}

async function sweepStrandedHelpers() {
  if (IS_WINDOWS) return 0;
  const seen = await sh("ps", ["-eo", "pid=,ppid=,args="], { timeout: 8000, maxBuffer: 16 << 20 });
  const pids = strandedHelpers(seen);
  const killed = pids.filter((pid) => pid !== process.pid && killTree(pid));
  if (killed.length) console.log(`hive: killed ${killed.length} model helpers a dead panel left behind`);

  const servers = strandedServers(seen).filter((pid) => pid !== process.pid && killTree(pid));
  if (servers.length) console.log(`hive: killed ${servers.length} servers this machine no longer runs`);
  return killed.length + servers.length;
}

function shOwned(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, detached: !IS_WINDOWS, env: { ...process.env, AWS_PROFILE, ...(opts.env || {}) } });
    const cap = opts.maxBuffer || 4 << 20;
    let out = "", bad = "", spilled = false, settled = false;
    const keep = (held, chunk) => (held.length >= cap ? (spilled = true, held) : held + chunk);
    child.stdout.on("data", (chunk) => { out = keep(out, String(chunk)); });
    child.stderr.on("data", (chunk) => { bad = keep(bad, String(chunk)); });
    if (child.pid) ownHelpers.add(child.pid);
    const timer = setTimeout(() => { spilled = true; if (child.pid) killTree(child.pid); }, opts.timeout || 8000);
    const finish = (code, broke) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid) { killGroup(child.pid); ownHelpers.delete(child.pid); }
      const wrong = broke || spilled || code !== 0;
      resolve({ ok: !wrong, out, error: wrong ? (broke || bad.trim() || `the helper stopped (${code})`) : "" });
    };
    child.on("error", (e) => finish(1, String(e.message || e)));
    child.on("close", (code) => finish(code, ""));
    if (opts.input !== undefined) { try { child.stdin.end(opts.input); } catch {} }
  });
}

function shr(cmd, args, opts = {}) {
  const argv = args;
  if (opts.own) return shOwned(cmd, argv, opts);
  return new Promise((resolve) => {
    const child = execFile(cmd, argv, { timeout: opts.timeout || 8000, maxBuffer: opts.maxBuffer || 4 << 20, cwd: opts.cwd, env: { ...process.env, AWS_PROFILE, ...(opts.env || {}) } },
      (err, stdout, stderr) => resolve({
        ok: !err,
        out: stdout || "",
        error: err ? String(stderr || err.message || "").trim() : ""
      }));
    if (opts.input !== undefined) { try { child.stdin.end(opts.input); } catch {} }
  });
}

async function sh(cmd, args, opts = {}) {
  const r = await shr(cmd, args, opts);
  return r.ok || r.out ? r.out : "";
}

const mirrors = new Set();
const attachedTerminals = new Map();
let viewSeq = 0;

function holdTerminal(name, handle) {
  if (!attachedTerminals.has(name)) attachedTerminals.set(name, new Set());
  attachedTerminals.get(name).add(handle);
}

function releaseTerminal(name, handle) {
  const held = attachedTerminals.get(name);
  if (!held) return;
  held.delete(handle);
  if (!held.size) attachedTerminals.delete(name);
}

function endTerminalsOf(name, why) {
  for (const handle of [...(attachedTerminals.get(name) || [])]) handle.end(why);
}

const SEAT_NAME = /^[A-Za-z0-9._-]{1,80}$/;
const isSeatName = (name) => SEAT_NAME.test(String(name || ""));
const quoted = (text) => `'${String(text).replace(/'/g, `'\\''`)}'`;

const nextView = (name) => `mirror-${name}-${++viewSeq}`;

async function openMirror(session, name) {
  const group = LOCAL_SESSION;
  const seat = quoted(session);
  const target = quoted(`${session}:${name}`);
  const prep = `tmux new-session -d -s ${seat} -t ${group} 2>/dev/null; ` +
    `tmux set-option -t ${seat} status off; ` +
    `tmux set-option -t ${seat} mouse off; ` +
    `tmux set-option -s set-clipboard on; ` +
    `tmux set-option -t ${seat} history-limit 20000; ` +
    `tmux set-window-option -t ${target} aggressive-resize on; ` +
    `tmux set-window-option -t ${target} window-size latest; ` +
    `tmux select-window -t ${quoted(`${session}:=${name}`)}; true`;
  await sh(...inBash(prep), { timeout: 6000 });
  mirrors.add(session);
}

async function closeMirror(session) {
  if (!mirrors.delete(session)) return;
  await sh(...inBash(`tmux kill-session -t ${quoted(session)} 2>/dev/null; true`), { timeout: 5000 });
}

async function openAuthMirror(session, id) {
  const target = AUTH_SESSION(id);
  const has = await shr(TMUX, ["has-session", "-t", target], { timeout: 4000 }).catch(() => ({ ok: false }));
  if (!has.ok) return false;
  const view = quoted(session);
  const prep = `tmux new-session -d -s ${view} -t ${quoted(target)} 2>/dev/null; ` +
    `tmux set-option -t ${view} status off; ` +
    `tmux set-option -t ${view} mouse off; ` +
    `tmux set-window-option -t ${view} aggressive-resize on; ` +
    `tmux set-window-option -t ${view} window-size latest; true`;
  await sh(...inBash(prep), { timeout: 6000 });
  mirrors.add(session);
  return true;
}

function pipeNative(ws, name, cols, rows, gone = `there is no seat called ${name} on this machine`) {
  const view = nativeRoom().attach(name, {
    cols,
    rows,
    onData: (d) => { if (d && ws.readyState === 1) ws.send(d); },
    onExit: (exitCode) => {
      if (ws.readyState !== 1) return;
      ws.send(`\r\n\x1b[2m─ disconnected (code ${exitCode}) · reconnecting · ${RECONNECT_KEY} forces it ─\x1b[0m\r\n`);
      ws.close();
    }
  });
  if (!view) {
    ws.send(`\r\n\x1b[2m─ ${gone} ─\x1b[0m\r\n`);
    return ws.close();
  }
  ws.on("message", (raw) => {
    const txt = raw.toString();
    if (txt[0] === "\x01") {
      try {
        const { c, r } = JSON.parse(txt.slice(1));
        if (c > 0 && r > 0) view.resize(c, r);
      } catch {}
      return;
    }
    view.write(txt);
  });
  ws.on("close", () => view.detach());
}

function pipeTmux(ws, session, cols, rows, name = "") {
  let child;
  try {
    child = pty.spawn(TMUX, ["attach", "-t", session], {
      name: "xterm-256color",
      cols, rows,
      cwd: HUB,
      env: { ...process.env, TERM: "xterm-256color" }
    });
  } catch (e) {
    if (ws.readyState === 1) ws.send("\r\n\x1b[31mcould not open the terminal: " + e.message + "\x1b[0m\r\n");
    ws.close();
    return;
  }
  child.onData((d) => { if (d && ws.readyState === 1) ws.send(d); });
  child.onExit(({ exitCode }) => {
    if (ws.readyState === 1) {
      ws.send(`\r\n\x1b[2m─ disconnected (code ${exitCode}) · reconnecting · ${RECONNECT_KEY} forces it ─\x1b[0m\r\n`);
      ws.close();
    }
  });
  ws.on("message", (raw) => {
    const txt = raw.toString();
    if (txt[0] === "\x01") {
      try {
        const { c, r } = JSON.parse(txt.slice(1));
        if (c > 0 && r > 0) child.resize(c, r);
      } catch {}
      return;
    }
    child.write(txt);
  });
  const handle = {
    end(why) {
      if (ws.readyState === 1) {
        if (why) ws.send(`\r\n\x1b[2m─ ${why} ─\x1b[0m\r\n`);
        ws.close();
      }
    }
  };
  if (name) holdTerminal(name, handle);
  ws.on("close", () => {
    if (name) releaseTerminal(name, handle);
    try { child.kill(); } catch {}
    closeMirror(session);
  });
}

const SWEEP = `for p in $(ps -eo pid=,args= | awk '$2=="tmux" && $3=="attach" && $5 ~ /^mirror-/ {print $1}'); do kill -9 $p 2>/dev/null; done
tmux list-sessions -F "#{session_id} #{session_name}" 2>/dev/null | while read -r id rest; do
  case "$rest" in mirror-*) tmux kill-session -t "$id" 2>/dev/null;; esac
done
true`;

function readEnvFile(text) {
  const out = {};
  for (const line of String(text).split("\n")) {
    const clean = line.trim();
    if (!clean || clean.startsWith("#")) continue;
    const at = clean.indexOf("=");
    if (at < 1) continue;
    const key = clean.slice(0, at).replace(/^export\s+/, "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    out[key] = clean.slice(at + 1).trim().replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
  return out;
}

async function hubSeatEnv() {
  let env = {};
  let wanted = new Set();
  try {
    env = readEnvFile(await readFile(join(HUB, ".env"), "utf8"));
    const mcp = await readFile(join(HUB, ".mcp.json"), "utf8");
    wanted = new Set([...mcp.matchAll(/\$\{([A-Z0-9_]+)\}/g)].map((m) => m[1]));
  } catch { return {}; }
  const found = secretsForSeats(wanted, { env, hub: HUB });
  const held = {};
  for (const key of wanted) if (found[key]) held[key] = found[key];
  return held;
}

async function hubEnvIntoTmux() {
  if (NATIVE) return 0;
  const found = await hubSeatEnv();
  if (!Object.keys(found).length) return 0;
  const already = new Map();
  for (const line of (await sh(TMUX, ["show-environment", "-t", LOCAL_SESSION], { timeout: 5000 })).split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) already.set(line.slice(0, at), line.slice(at + 1));
  }
  const lines = [];
  for (const [key, value] of Object.entries(found)) {
    if (already.get(key) === value) continue;
    lines.push(`tmux set-environment -g ${key} ${quoted(value)} 2>/dev/null`);
    lines.push(`tmux set-environment -t ${LOCAL_SESSION} ${key} ${quoted(value)} 2>/dev/null`);
  }
  if (!lines.length) return 0;
  await sh(...inBash(`tmux has-session -t ${LOCAL_SESSION} 2>/dev/null || tmux new-session -d -s ${LOCAL_SESSION} -c "$HOME" -n hub "sleep 999999"; ${lines.join("; ")}; true`), { timeout: 20000, cwd: HOME });
  return lines.length / 2;
}

const AUTOPUSH_HERE = join(HERE, "autopush.mjs");

const AUTOPUSH_LOCAL = `tmux has-session -t=autopush 2>/dev/null || tmux new-session -d -s autopush -c "$HOME" "cd \\"$HOME\\" || exit 1; exec ${quoted(process.execPath)} ${quoted(AUTOPUSH_HERE)} --daemon --hub ${quoted(HUB)}"; true`;

let autopushChild = null;

async function keepAutopushAlive() {
  if (NATIVE) {
    if (autopushChild && autopushChild.exitCode === null) return;
    autopushChild = spawn(process.execPath, [AUTOPUSH_HERE, "--daemon", "--hub", HUB], { cwd: HOME, stdio: "ignore", windowsHide: true });
    autopushChild.on("error", () => { autopushChild = null; });
    return;
  }
  await sh(...inBash(AUTOPUSH_LOCAL), { timeout: 10000, cwd: HOME });
}

async function mirrorMemory() {
  if (SANDBOX || !CLOUD) return;
  const script = deploymentScript("pod-memory-sync.sh");
  if (!script || !existsSync(script)) return;
  if (!(await podUp())) return;
  await sh(...inBash(`bash ${quoted(script)} --quiet`), {
    timeout: 120000,
    env: { HIVE_HOME, HIVE_HUB: HUB, HIVE_POD: POD, HIVE_NAMESPACE: NS }
  });
}

/* a loan that ended with the app is a conversation still sitting on the volume, where anyone on the
   team reads it with the same exec the deck already uses. Nothing is lent at boot, so nothing there is
   worth keeping — and the flag that spares the mirrors spares this too: a second panel on this machine
   has no business wiping what the first one is publishing right now. */
async function sweepLive() {
  if (SANDBOX || !CLOUD || !(await podUp())) return;
  await onTheServer("rm -rf \"$1\"", [LIVE_DIR], { timeout: 15000 });
}

async function sweepStrandedMirrors() {
  mirrors.clear();
  if (!NATIVE) await sh(...inBash(SWEEP), { timeout: 8000 });
  await onTheServer(SWEEP, [], { timeout: 20000 });
}

const NO_TMUX_SESSION = /can't find session|no server running|session not found|no such session/i;
let lastLocalWindows = [];

function accountOf(command) {
  return accountNameInCommand(command);
}

const WINDOW_ROW = "#W\t#{pane_dead}\t#{pane_start_command}";

async function localWindows() {
  if (NATIVE) {
    lastLocalWindows = nativeRoom().list({ dead: true }).filter((one) => isSeatName(one.name)).map(({ name, dead, account }) => ({ name, dead, account }));
    return lastLocalWindows;
  }
  let r = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", WINDOW_ROW], { timeout: 8000 });
  if (!r.ok && !lastLocalWindows.length) {
    r = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", WINDOW_ROW], { timeout: 15000 });
  }
  if (!r.ok && !NO_TMUX_SESSION.test(r.error)) return lastLocalWindows;
  lastLocalWindows = r.out.split("\n").map((l) => l.split("\t"))
    .map(([name, dead, ...rest]) => ({ name: String(name || "").trim(), dead: String(dead || "").trim() === "1", account: accountOf(rest.join("\t")) }))
    .filter((w) => w.name && w.name !== "hub" && isSeatName(w.name));
  return lastLocalWindows;
}

async function localWindowNamed(name) {
  const windows = await localWindows().catch(() => []);
  return windows.find((w) => w.name === name) || null;
}

async function powerSwitch(...verb) {
  const script = deploymentScript("pod-power.sh");
  if (!script || !existsSync(script)) return { ok: false, out: "", error: "this hive has no power switch — its server is not one anybody here can turn on" };
  return shr(BASH || "bash", [script, ...verb], { timeout: 40000 });
}

const hasPowerSwitch = () => {
  const script = deploymentScript("pod-power.sh");
  return !!script && existsSync(script);
};

const POD_UP_FRESH = 15000;
let podUpCache = { at: 0, up: false, asking: null };

/* A box that opens its own door is up, and that is better evidence than a
   cluster nobody could reach. The switch stays the first question, because it
   is the only one that can also turn a stopped box on; it is just not the only
   witness. Without this, a machine with no kubectl is told its running server
   is down — and worse off than a machine with no deployment at all, which the
   line above waves through. */
async function doorSaysUp() {
  const url = serverAddressOf(DEV);
  if (!url) return false;
  const asked = await askTheDoor(url).catch(() => ({ ok: false }));
  return !!asked.ok;
}

async function podUp({ fresh = false } = {}) {
  if (!hasPowerSwitch()) return true;
  if (!fresh && podUpCache.at && Date.now() - podUpCache.at < POD_UP_FRESH) return podUpCache.up;
  if (podUpCache.asking) return podUpCache.asking;
  podUpCache.asking = powerSwitch("status").then(async (said) => {
    const up = (said.ok && said.out.trim() === "up") || await doorSaysUp();
    podUpCache = { at: Date.now(), up, asking: null };
    return up;
  }).catch(async () => {
    const up = await doorSaysUp();
    podUpCache = { at: up ? Date.now() : 0, up, asking: null };
    return up;
  });
  return podUpCache.asking;
}

const WAKE_TIMEOUT = 180000;

async function wakeAndWait(onStep = () => {}, timeout = WAKE_TIMEOUT) {
  if (!CLOUD) return { error: NO_ADDRESS };
  if (await podUp()) return { ok: true, woke: false };
  onStep("waking the pod");
  const started = await podAction("wake");
  if (started.error) return { error: started.error };
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise((again) => setTimeout(again, 3000));
    if (await podUp({ fresh: true })) {
      invalidatePod();
      return { ok: true, woke: true };
    }
  }
  return { error: `the server did not come up in ${Math.round(timeout / 1000)}s — look at it in the server window` };
}

async function localScreen(name) {
  if (NATIVE) return nativeRoom().capture(name, LINES);
  return sh(TMUX, ["capture-pane", "-t", `${LOCAL_SESSION}:=${name}`, "-p", "-e", "-S", `-${LINES}`], { timeout: 4000 });
}

const KUBECTL_NOISE = /^(?:[EWIF]\d{4} \d{2}:\d{2}:\d{2}\.\d+\s+\d+ \S+:\d+\]|error: (?:error reading from error stream|unable to upgrade connection)).*\r?\n?/gm;

async function cloudWall() {
  const painted = await onCloudSeats("GET", `/wall?lines=${LINES}`);
  if (!painted.ok) return { up: false, windows: {} };
  const held = painted.body.seats || {};
  const windows = {};
  for (const [name, one] of Object.entries(held)) {
    windows[name] = {
      screen: String(one?.screen || ""),
      status: String(one?.status || ""),
      mission: String(one?.mission || ""),
      driver: String(one?.driver || ""),
      session: String(one?.session || ""),
      cwd: String(one?.cwd || "")
    };
  }
  return { up: true, windows };
}

async function cloudSeatNames() {
  const listed = await onCloudSeats("GET", "");
  if (!listed.ok) return { ok: false, out: "", error: listed.error };
  return { ok: true, out: (listed.body.seats || []).map((one) => one.name).join("\n"), error: "" };
}

async function localStatus(name) {
  try { return await readFile(join(HUB, ".hive/status", `${name}.md`), "utf8"); }
  catch { return ""; }
}

async function localMission(name) {
  try { return await readFile(join(HUB, ".hive/prompts", `${name}.md`), "utf8"); }
  catch { return ""; }
}

function readStatus(text) {
  const r = { title: "", summary: "", done: "", now: "", next: "", pr: "", last: null, history: [] };
  if (!text) return r;
  for (const l of text.split("\n")) {
    const head = l.match(/^(title|summary|done|now|next|pr):\s*(.+)$/i);
    if (head) {
      r[head[1].toLowerCase()] = head[2].trim();
      continue;
    }
    const log = l.match(/^(\d{2}:\d{2})\s+\[(\w+)\]\s+(.+)$/);
    if (log) r.history.push({ at: log[1], state: log[2], msg: log[3] });
  }
  r.last = r.history[r.history.length - 1] || null;
  if (!r.now && r.last) r.now = r.last.msg;
  return r;
}


const chosenModels = new Map();

function findModel(name, lines, agent = "claude") {
  if (agent !== "claude") return modelOnScreen(lines, agent) || chosenModels.get(name) || "";
  for (const l of lines) {
    if (!/(context\)|effort|Claude Max)/.test(l)) continue;
    const m = l.match(/\b(Opus|Sonnet|Haiku|Fable)\s+[\d.]+(\s*\([^)]*\))?(\s+with\s+\S+\s+effort)?/);
    if (m) return m[0].trim().replace(/\s+/g, " ");
  }
  return chosenModels.get(name) || "";
}


function extractJson(text) {
  const i = text.indexOf("{");
  const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

const TITLES_FILE = join(HUB, ".hive/titles.json");
const titles = new Map();

async function loadTitles() {
  try {
    const raw = JSON.parse(await readFile(TITLES_FILE, "utf8"));
    for (const [key, value] of Object.entries(raw || {})) if (value?.title && value?.mine) titles.set(key, value);
  } catch {}
}

let titleWrite = null;

function saveTitles() {
  if (titleWrite) return;
  titleWrite = setTimeout(async () => {
    titleWrite = null;
    const obj = {};
    for (const [key, v] of titles) {
      if (v?.title && v?.mine) obj[key] = { title: v.title, mine: true, ...(v.stamped ? { stamped: v.stamped } : {}) };
    }
    try {
      await mkdir(dirname(TITLES_FILE), { recursive: true });
      await writeFile(TITLES_FILE, JSON.stringify(obj, null, 2));
    } catch {}
  }, 2000);
}

function cleanTitle(raw) {
  return String(raw || "").split("\n")[0].replace(/^["'`\s]+|["'`.\s]+$/g, "").slice(0, 60);
}

function titleKey(name, where) {
  return `${where}:${name}`;
}

function myTitle(name, where) {
  const saved = titles.get(titleKey(name, where));
  return saved?.mine ? saved.title || "" : "";
}

function renameSeat(name, where, raw) {
  const key = titleKey(name, where);
  const title = cleanTitle(raw);
  if (title) titles.set(key, { title, mine: true, at: Date.now() });
  else titles.delete(key);
  saveTitles();
  if (title) stampTitle(name, where, title);
  return title;
}


const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAMP_LOOKING_MS = 60000;
const STAMP_SETTLED_MS = 600000;
const STAMP_TAIL_BYTES = 65536;

function stampRecord(id, title) {
  return JSON.stringify({ type: "custom-title", customTitle: title, sessionId: id });
}

async function seatSessionId(name, where) {
  try {
    const raw = where === "cloud"
      ? (await onTheServer('cat "$HIVE_STATE_DIR/sessions/$1.json" 2>/dev/null', [name], { timeout: 15000 })).out
      : await readFile(join(HIVE_HOME, "sessions", `${name}.json`), "utf8");
    const id = String(JSON.parse(raw).session_id || "");
    return SESSION_ID.test(id) ? id : "";
  } catch {
    return "";
  }
}

const TRANSCRIPT_CAP = 12 << 20;

async function seatTranscript(name) {
  const seat = (cache.data?.sessions || []).find((s) => s.name === name) || fleet.get(seatKey("local", name)) || fleet.get(seatKey("cloud", name));
  const where = seat?.where === "cloud" ? "cloud" : "local";
  const id = (await seatSessionId(name, where)) || String(seat?.id || "");
  if (!SESSION_ID.test(id)) return { text: "", why: "that chat has no session on record" };
  if (where === "cloud") {
    const got = await onTheServer(`f=$(ls "$HOME/.claude/projects"/*/"$1".jsonl 2>/dev/null | head -1); [ -n "$f" ] && tail -c ${TRANSCRIPT_CAP} "$f"`, [id], { timeout: 30000 }).catch(() => ({ ok: false, out: "" }));
    return { text: got.ok ? got.out : "", why: got.ok ? "" : "the pod did not hand over the transcript" };
  }
  try {
    for (const dir of readdirSync(CLAUDE_PROJECTS)) {
      const file = join(CLAUDE_PROJECTS, dir, `${id}.jsonl`);
      if (!existsSync(file)) continue;
      const stat = statSync(file);
      if (stat.size <= TRANSCRIPT_CAP) return { text: await readFile(file, "utf8") };
      const fd = await open(file, "r");
      try {
        const buf = Buffer.alloc(TRANSCRIPT_CAP);
        await fd.read(buf, 0, TRANSCRIPT_CAP, stat.size - TRANSCRIPT_CAP);
        return { text: buf.toString("utf8") };
      } finally { await fd.close(); }
    }
  } catch {}
  return { text: "", why: "no transcript of that chat on this machine" };
}

async function stampOnTranscript(id, title, where) {
  if (!title || !SESSION_ID.test(String(id || ""))) return false;
  const record = stampRecord(id, title);
  if (where === "cloud") {
    if (!CLOUD || !(await podUp())) return false;
    const script = [
      `f=$(ls /workspace/home/.claude/projects/*/${id}.jsonl 2>/dev/null | head -1)`,
      `[ -n "$f" ] || exit 0`,
      `tail -c ${STAMP_TAIL_BYTES} "$f" | grep -qF ${quoted(record)} && exit 0`,
      `printf '%s\\n' ${quoted(record)} >> "$f"`,
    ].join("\n");
    return (await onTheServer(script, [], { timeout: 20000 })).ok;
  }
  const file = localTranscriptOf(id);
  if (!file) return false;
  try {
    if (tailOfFile(file, STAMP_TAIL_BYTES).includes(record)) return true;
  } catch {}
  await appendFile(file, record + "\n");
  return true;
}

async function stampTitle(name, where, title) {
  try {
    if (!title || !isSeatName(name)) return;
    const key = titleKey(name, where);
    const saved = titles.get(key) || {};
    const settled = String(saved.stamped || "").endsWith(`|${title}`);
    if (saved.stampAt && Date.now() - saved.stampAt < (settled ? STAMP_SETTLED_MS : STAMP_LOOKING_MS)) return;
    titles.set(key, { ...saved, stampAt: Date.now() });
    const id = await seatSessionId(name, where);
    if (!id || saved.stamped === `${id}|${title}`) return;
    if (!(await stampOnTranscript(id, title, where))) return;
    titles.set(key, { ...(titles.get(key) || {}), stamped: `${id}|${title}` });
    saveTitles();
  } catch {}
}

const PR_LINK = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;

function findPrsOnScreen(lines) {
  return [...new Set(lines.join("\n").match(PR_LINK) || [])];
}

function findThreadsOnScreen(lines) {
  return [...new Set(lines.join("\n").match(SLACK_LINK) || [])];
}

async function eventsTail(file, bytes = 65536) {
  try {
    const { size } = statSync(file);
    const stream = createReadStream(file, { start: Math.max(0, size - bytes) });
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

const structuredModels = new Map();

function rememberStructuredModel(name, info) {
  if (!info) return;
  if (info.model) structuredModels.set(name, info.model);
  else info.model = structuredModels.get(name) || "";
}

const structuredLive = new Map();

function rememberStructuredLive(name, info) {
  if (!info) return;
  if (info.sawLive) structuredLive.set(name, { live: info.live, liveSince: info.liveSince });
  else {
    const kept = structuredLive.get(name);
    info.live = kept?.live || [];
    info.liveSince = kept?.liveSince || "";
  }
  delete info.sawLive;
}

const structuredAccounts = new Map();

function rememberStructuredAccount(name, where, info) {
  if (!info) return;
  if (typeof info.account === "string") structuredAccounts.set(name, info.account);
  else info.account = structuredAccounts.get(name);
  if (typeof info.account !== "string") return;
  const seat = fleet.get(seatKey(where, name));
  if (!seat || (seat.account || "") === info.account) return;
  rememberSeat({ ...seat, account: info.account });
}

/* the app writes a random id into the fleet when it opens a seat, and Claude takes it as
   the transcript's name. The other agents name the session themselves, and the id only
   reaches the driver's init event — so the fleet learns it from there, or the restore
   would hand the driver an id nothing was ever stored under. */
function rememberStructuredSession(name, where, info) {
  const id = String(info?.sessionId || "");
  if (!OWN_SESSION_ID.test(id)) return;
  const seat = fleet.get(seatKey(where, name));
  if (!seat || seat.kind !== "structured" || seat.id === id) return;
  rememberSeat({ ...seat, id });
}

function rememberSeatTitle(name, where, title) {
  const seat = fleet.get(seatKey(where, name));
  if (!seat || !title || seat.title === title) return;
  rememberSeat({ ...seat, title });
}

const MODEL_WORDS = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable" };

function prettyModel(id) {
  const m = String(id || "").match(/^claude-([a-z]+)-([\d.-]+?)(?:-\d{8})?$/);
  if (!m) return "";
  return `${MODEL_WORDS[m[1]] || m[1]} ${m[2].split("-").join(".")}`;
}

async function headOfFile(file, bytes = 6144) {
  try {
    const stream = createReadStream(file, { start: 0, end: bytes - 1 });
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

function structuredTitleOf(sessionJson) {
  try { return cleanTitle(JSON.parse(sessionJson)?.title); } catch { return ""; }
}

function structuredDirsOf(sessionJson) {
  try {
    const dirs = JSON.parse(sessionJson).dirs;
    return Array.isArray(dirs) ? dirs.filter((one) => typeof one === "string") : [];
  } catch { return []; }
}

function structuredModelOf(sessionJson) {
  try {
    const s = JSON.parse(sessionJson);
    const pretty = prettyModel(s.model_id);
    if (pretty) return pretty;
    if (s.agent && s.agent !== "claude") return String(s.model_id || "").split("/").pop() || s.agent;
    return "";
  } catch { return ""; }
}

async function readStructuredEvents(name) {
  const file = join(HIVE_HOME, "events", `${name}.ndjson`);
  const [head, tail, session] = await Promise.all([
    headOfFile(file),
    eventsTail(file),
    readFile(join(HIVE_HOME, "sessions", `${name}.json`), "utf8").catch(() => "")
  ]);
  const info = parseStructuredTail(head + "\n" + tail);
  if (info && !info.model) info.model = structuredModelOf(session);
  if (info) info.title = structuredTitleOf(session);
  if (info) info.dirs = structuredDirsOf(session);
  return info;
}

const FINISH_WORDS = 2500;

function finishOf(e) {
  const text = String(e.result || "").trim();
  return {
    seq: e.seq,
    at: e.ts || "",
    text: text.slice(0, FINISH_WORDS),
    clipped: text.length > FINISH_WORDS,
    ms: e.duration_ms || 0,
    turns: e.num_turns || 0,
    cost: e.total_cost_usd || 0,
    error: !!e.is_error,
    stop: e.stop_reason === "end_turn" ? "" : String(e.stop_reason || ""),
    denials: (e.permission_denials || []).length
  };
}

const LIVE_SHOWN = 6;

function liveTaskOf(task) {
  return {
    id: String(task.task_id || ""),
    kind: String(task.task_type || ""),
    said: String(task.description || "").replace(/\s+/g, " ").trim().slice(0, 140)
  };
}

function parseStructuredTail(tail) {
  if (!tail || !tail.trim()) return null;
  const pending = new Map();
  let finish = null;
  let lastResult = 0, lastActivity = 0, model = "", exited = false, account, sessionId = "";
  let live = [], liveSince = "", sawLive = false;
  for (const line of tail.split("\n")) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.replayed) continue;
    if (e.type === "driver") {
      if (typeof e.account === "string" && (e.subtype === "started" || e.subtype === "account_changed")) account = e.account;
      if (e.subtype === "question") pending.set(e.id, Array.isArray(e.questions) ? e.questions : []);
      if (e.subtype === "plan") pending.set(e.id, []);
      if (e.subtype === "question_answered" || e.subtype === "question_failed" || e.subtype === "question_dismissed") pending.delete(e.id);
      if (e.subtype === "plan_approved" || e.subtype === "plan_dismissed") pending.delete(e.id);
      if (e.subtype === "model_changed" && e.model) model = e.model;
      if (e.subtype === "exit" || e.subtype === "terminated") exited = true;
      if (e.subtype === "started") exited = false;
      if (e.subtype === "started" || e.subtype === "exit" || e.subtype === "terminated") {
        live = []; liveSince = ""; sawLive = true;
      }
      continue;
    }
    if (e.type === "system" && e.subtype === "background_tasks_changed") {
      const tasks = (Array.isArray(e.tasks) ? e.tasks : []).map(liveTaskOf).filter((one) => one.id);
      liveSince = tasks.length ? (live.length ? liveSince : String(e.ts || "")) : "";
      live = tasks;
      sawLive = true;
      continue;
    }
    if (e.type === "result") { lastResult = e.seq; finish = finishOf(e); continue; }
    if (e.type === "assistant" || e.type === "user" || e.type === "stream_event") lastActivity = e.seq;
    if (e.type === "system" && e.subtype === "init") { model = e.model || model; sessionId = e.session_id || sessionId; if (!lastResult) lastActivity = e.seq; }
  }
  return {
    sessionId,
    pending: pending.size > 0,
    asks: [...pending].map(([id, questions]) => ({ id, questions })),
    working: !exited && pending.size === 0 && lastActivity > lastResult,
    model: prettyModel(model),
    account,
    exited,
    live: exited ? [] : live.slice(0, LIVE_SHOWN),
    liveSince: exited ? "" : liveSince,
    sawLive,
    finish,
    prs: [...new Set(tail.match(PR_LINK) || [])]
  };
}

function structuredStateOf(info, status) {
  if (info.pending) return "needs";
  if (info.working) return "working";
  if (status.last?.state === "done") return "done";
  if (status.last?.state === "question" || status.last?.state === "blocked") return "needs";
  return "idle";
}

function missionLine(mission) {
  return String(mission || "").trim().split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 140) || "";
}

function build(name, where, lines, statusText, mission, links = [], account = "", running = false, structured = false, structuredInfo = null) {
  const seat = seatRecord(where, name);
  const agent = seat?.agent || "claude";
  const status = readStatus(statusText);
  const thinking = agent === "claude" ? findThinking(lines) : null;
  const noStatus = !status.last && !status.summary;
  const mine = myTitle(name, where);
  const state = structuredInfo ? structuredStateOf(structuredInfo, status) : deriveState(lines, status, thinking, running, agent);
  const finish = structuredInfo?.finish || null;
  const own = structuredInfo?.title || "";
  const label = mine || own || status.title || "";
  rememberSeatTitle(name, where, label);
  stampTitle(name, where, label || name);
  return {
    name,
    title: label || name,
    naming: !label && namingNow.has(seatKey(where, name)),
    mine: !!mine,
    where,
    kind: seat?.kind || "",
    agent,
    trees: treesOfSeat(trails, seat, dirsOfSeat(seat, structuredInfo, agent)),
    account: typeof structuredInfo?.account === "string" ? structuredInfo.account : account,
    model: structuredInfo?.model || findModel(name, lines, agent),
    state,
    mood: moodOf({ state, finish }),
    verb: structuredInfo ? null : thinking?.verb || null,
    measure: structuredInfo ? "" : thinking?.measure || "",
    live: structuredInfo?.live || [],
    liveSince: structuredInfo?.liveSince || "",
    when: since(status),
    description: missionLine(mission),
    summary: status.summary || status.last?.msg || "",
    done: status.done || "",
    now: status.now || "",
    next: status.next || "",
    prs: [...new Set([status.pr, ...(structuredInfo?.prs || []), ...findPrsOnScreen(lines), ...links.flatMap((l) => l.match(PR_LINK) || [])].filter(Boolean))],
    threads: [...new Set([...findThreadsOnScreen(lines), ...links.flatMap((l) => l.match(SLACK_LINK) || [])].filter(Boolean))],
    noStatus,
    structured,
    asks: structuredInfo?.asks || [],
    finish,
    canopy: canopyOfSeat(name),
    browser: browserState(name),
    device: deviceState(name),
    history: status.history.slice(-14)
  };
}

const BY_EXTENSION = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", json: "json", md: "markdown",
  sh: "bash", bash: "bash", zsh: "bash", py: "python", ex: "elixir", exs: "elixir",
  css: "css", scss: "css", html: "xml", heex: "xml", xml: "xml", svg: "xml",
  yml: "yaml", yaml: "yaml", sql: "sql"
};

function languageOf(path) {
  const name = path.split("/").pop().toLowerCase();
  if (name.startsWith("dockerfile")) return "bash";
  return BY_EXTENSION[name.split(".").pop()] || "";
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function paintLines(text, language) {
  if (!language || !text) return text.split("\n").map(escapeHtml);
  let html;
  try { html = hljs.highlight(text, { language, ignoreIllegals: true }).value; }
  catch { return text.split("\n").map(escapeHtml); }

  const lines = [];
  const stack = [];
  let current = "";
  const pieces = /<span class="([^"]*)">|<\/span>|\n|[^<\n]+|</g;
  let found;
  while ((found = pieces.exec(html)) !== null) {
    const piece = found[0];
    if (piece === "\n") {
      lines.push(current + "</span>".repeat(stack.length));
      current = stack.map((c) => `<span class="${c}">`).join("");
    } else if (found[1] !== undefined) {
      stack.push(found[1]);
      current += piece;
    } else if (piece === "</span>") {
      stack.pop();
      current += piece;
    } else {
      current += piece;
    }
  }
  lines.push(current + "</span>".repeat(stack.length));
  return lines;
}

let cache = { at: 0, data: null };
let podCache = { at: 0, up: false, windows: {}, fetching: null };

async function fromPod() {
  const stale = Date.now() - podCache.at >= 5000;
  if (stale && !podCache.fetching) {
    podCache.fetching = (async () => {
      const painted = await cloudWall();
      podCache = { at: Date.now(), up: painted.up, windows: painted.windows, fetching: null };
      return podCache;
    })().catch(() => {
      podCache.fetching = null;
      return podCache;
    });
  }
  if (podCache.at) return podCache;
  return podCache.fetching || podCache;
}

const dayGroup = (one) => ({
  errand: one.errand,
  asked: one.asked,
  at: one.at,
  closed: !!one.closed,
  race: one.race || 0,
  prs: one.prs.map((link) => (typeof link === "string" ? link : link.url || "")).filter(Boolean),
  seats: one.seats.map((seat) => ({
    name: seat.name, where: seat.where, state: seat.state, title: seat.title || "", now: seat.now || "", asks: seat.asks || [],
    prs: (seat.prs || []).map((link) => (typeof link === "string" ? link : link.url || "")).filter(Boolean)
  }))
});

function dayOf(sessions, errands) {
  const byName = new Map(sessions.map((seat) => [seat.name, seat]));
  const zones = zonesOf({
    sessions,
    prsOf: (name) => byName.get(name)?.prs || [],
    seen: readSeen(HIVE_HOME),
    closed: closedErrands(errands)
  });
  return {
    needsYou: zones.needsYou.map(dayGroup),
    cameBack: zones.cameBack.map(dayGroup),
    onTheWay: zones.onTheWay.map(dayGroup),
    byHand: zones.byHand.map(dayGroup)
  };
}

function archivedTitle(seat) {
  const mine = myTitle(seat.name, seat.where);
  if (mine) return mine;
  if (seat.title) return seat.title;
  if (seat.where !== "local") return "";
  let found = "";
  try {
    found = structuredTitleOf(readFileSync(join(HIVE_HOME, "sessions", `${seat.name}.json`), "utf8"));
  } catch {}
  if (found) seat.title = found;
  return found;
}

function archivedBrief() {
  return archiveOrder([...archivedSeats.values()]).map((seat) => ({
    name: seat.name,
    where: seat.where,
    title: archivedTitle(seat),
    model: seat.model || "",
    agent: seat.agent || "claude",
    cwd: seat.cwd || "",
    archivedAt: seat.archivedAt || 0
  }));
}

async function collect() {
  if (Date.now() - cache.at < 1500 && cache.data) return cache.data;

  const [windows, pod] = await Promise.all([localWindows(), fromPod()]);
  for (const ended of windows.filter((w) => w.dead)) closeEndedSeat(ended.name).catch(() => {});
  const local = windows.filter((w) => !w.dead);
  const missions = new Map();
  const statuses = new Map();

  const sessions = await Promise.all(local.map(async ({ name, account }) => {
    const [screen, st, mission] = await Promise.all([localScreen(name), localStatus(name), localMission(name)]);
    missions.set(seatKey("local", name), mission);
    statuses.set(seatKey("local", name), st);
    const seen = readScreen(screen, seatRecord("local", name)?.agent || "claude");
    const structured = structuredSeat("local", name) || existsSync(join(HIVE_HOME, "events", `${name}.ndjson`));
    const structuredInfo = structured ? await readStructuredEvents(name) : null;
    rememberStructuredModel(name, structuredInfo);
    rememberStructuredLive(name, structuredInfo);
    rememberStructuredAccount(name, "local", structuredInfo);
    rememberStructuredSession(name, "local", structuredInfo);
    return build(name, "local", seen.lines, st, mission, seen.links, account, seen.running, structured, structuredInfo);
  }));
  for (const [name, d] of Object.entries(pod.windows)) {
    missions.set(seatKey("cloud", name), d.mission);
    statuses.set(seatKey("cloud", name), d.status);
    const seen = readScreen(d.screen, seatRecord("cloud", name)?.agent || "claude");
    const structuredInfo = parseStructuredTail(d.driver);
    if (structuredInfo && !structuredInfo.model) structuredInfo.model = structuredModelOf(d.session);
    if (structuredInfo) structuredInfo.title = structuredTitleOf(d.session);
    rememberStructuredModel(name, structuredInfo);
    rememberStructuredLive(name, structuredInfo);
    rememberStructuredSession(name, "cloud", structuredInfo);
    sessions.push(build(name, "cloud", seen.lines, d.status, d.mission, seen.links, "", seen.running, structuredSeat("cloud", name) || !!structuredInfo, structuredInfo));
  }

  const alive = new Set(sessions.map((s) => s.name));
  settleSpawnJobs(spawning, alive);

  storeSessionPrs(sessions);
  storeSessionThreads(sessions);

  const errands = keepErrands(HIVE_HOME, sessions, {
    prsOf: (name) => (sessions.find((s) => s.name === name)?.prs || [])
  }).errands;
  const withErrand = extensions.title(withErrands(sessions, errands), {
    missionOf: (s) => missions.get(seatKey(s.where, s.name)) || "",
    statusOf: (s) => statuses.get(seatKey(s.where, s.name)) || ""
  });
  const grouped = byErrand(withErrand);
  const day = dayOf(withErrand, errands);

  const data = {
    pod: { name: myHiveName() || POD || "", up: pod.up },
    hub: HUB,
    sessions: withErrand,
    gone: goneKin(errands, withErrand),
    errands: grouped.errands.map((one) => ({ errand: one.errand, asked: one.asked, seats: one.seats.map((s) => s.name) })),
    closed: closedErrands(errands).sort((a, b) => b.endedAt - a.endedAt),
    day,
    spawning: [...spawning.values()].map((j) => ({ id: j.id, name: j.name, where: j.where, step: j.step, mission: j.mission, error: j.error, model: j.model, repo: j.repo, by: j.by || "", at: j.at, naming: !!j.titleLater, settled: !!j.settled })),
    worktrees: worktreeBrief(),
    archived: archivedBrief(),
    configAt: configStamp(),
    thumbs: shelfThumbs.next(),
    drafts: readDrafts(HIVE_HOME),
    at: new Date().toISOString()
  };
  dropGoneDrafts(HIVE_HOME, new Set([...alive, ...[...spawning.values()].map((j) => j.name).filter(Boolean)]));
  cache = { at: Date.now(), data };
  return data;
}

const mcpLogins = new Map();

async function runCloudMcpLogin(name, mcpServer, job) {
  const sess = `mcp-auth-${name}`;
  const inner = [
    "export HOME=/workspace/home PATH=/workspace/npm-global/bin:/usr/local/bin:/usr/bin:/bin",
    `cwd=$(sed -n 's/.*"cwd": *"\\([^"]*\\)".*/\\1/p' /workspace/hive/sessions/${name}.json 2>/dev/null | head -1)`,
    `engine=$(sed -n 's/.*"agent": *"\\([^"]*\\)".*/\\1/p' /workspace/hive/sessions/${name}.json 2>/dev/null | head -1)`,
    `cd "\${cwd:-${POD_HUB}}"`,
    'case "$engine" in',
    `  opencode) opencode mcp auth ${quoted(mcpServer)} ;;`,
    `  codex) codex mcp login ${quoted(mcpServer)} ;;`,
    `  kimi|kiro|cursor) echo "$engine has no login command the hive can drive from outside its chat — sign in to ${quoted(mcpServer)} from a $engine terminal on the box, then reopen the seat"; false ;;`,
    `  claude|"") claude mcp login ${quoted(mcpServer)} --no-browser ;;`,
    `  *) echo "$engine is not an agent this box knows how to sign in"; false ;;`,
    "esac",
    'echo "MCPAUTH_DONE:$?"',
    "sleep 600"
  ].join("\n");
  const b64 = Buffer.from(inner, "utf8").toString("base64");
  const boot = `tmux kill-session -t ${sess} 2>/dev/null; echo ${b64} | base64 -d > /tmp/${sess}.sh; ` +
    `tmux new-session -d -s ${sess} -x 400 -y 50 "bash /tmp/${sess}.sh"`;
  const started = await onTheServer(boot, [], { timeout: 20000 });
  if (!started.ok) throw new Error(started.error.slice(0, 200) || "could not open the auth window on the server");
  const deadline = Date.now() + 300000;
  try {
    while (Date.now() < deadline && job.state === "running") {
      await new Promise((r) => setTimeout(r, 2500));
      const screen = (await onTheServer('tmux capture-pane -t "$1" -p -J', [sess], { timeout: 12000 })).out;
      if (!screen) continue;
      const link = loginUrlIn(screen);
      if (link && !job.url) job.url = link;
      const done = screen.match(/MCPAUTH_DONE:(\d+)/);
      if (done) {
        const verdict = loginVerdict(Number(done[1]), screen.replace(/MCPAUTH_DONE:\d+/g, ""));
        job.state = verdict.state;
        job.error = verdict.error;
        return;
      }
    }
    if (job.state === "running") { job.state = "failed"; job.error = "the login timed out"; }
  } finally {
    onTheServer('tmux kill-session -t "$1" 2>/dev/null; rm -f "/tmp/$1.sh"; true', [sess], { timeout: 12000 }).catch(() => {});
  }
}

async function codexKnowsTheServer(mcpServer, cwd) {
  const listed = await shr(...viaBash("codex", ["mcp", "list", "--json"]), { timeout: 15000, cwd });
  const hubJson = await readFile(join(HUB, ".mcp.json"), "utf8").catch(() => "");
  const missing = codexServerToAdd(hubJson, mcpServer, codexKnownServers(listed.out || ""));
  if (!missing) return;
  const added = await shr(...viaBash("codex", ["mcp", "add", missing.name, "--url", missing.url]), { timeout: 15000, cwd, input: "" });
  if (!added.ok) console.log(`hive: codex would not take the mcp server ${missing.name}: ${String(added.error || "").split("\n").filter(Boolean).pop() || "no reason given"}`);
}

const KIRO_LOGIN_WAIT_MS = 300000;

async function kiroMcpLogin(name, mcpServer, job) {
  if (!bridge) throw new Error("no bridge here to ask the seat with");
  const sock = join(HIVE_HOME, "sock", `${name}.sock`);
  const rowNow = async () => {
    const said = await bridge.oneshot(sock, { type: "control", op: "mcp" }, { timeoutMs: 60000 });
    if (!said?.ok) throw new Error(said?.error || "the seat did not list its mcp servers");
    return (Array.isArray(said.data) ? said.data : []).find((s) => s.name === mcpServer) || null;
  };
  const row = await rowNow();
  if (!row) throw new Error(`${mcpServer} is not a server this seat carries`);
  if (row.status === "connected") { job.state = "done"; return; }
  if (!row.login_url) throw new Error("kiro gave no login page for this server — reopen the seat and try again");
  job.url = row.login_url;
  const deadline = Date.now() + KIRO_LOGIN_WAIT_MS;
  while (Date.now() < deadline && job.state === "running") {
    await new Promise((r) => setTimeout(r, 3000));
    const again = await rowNow().catch(() => null);
    if (again?.status === "connected") { job.state = "done"; return; }
  }
  if (job.state === "running") { job.state = "failed"; job.error = "the login did not finish in five minutes"; }
}

function startMcpLogin(name, mcpServer, where = "local") {
  const key = `${name}|${mcpServer}`;
  const running = mcpLogins.get(key);
  if (running?.state === "running") return { state: "running", url: running.url };
  const job = { state: "running", url: "", error: "", where, child: null, at: Date.now() };
  mcpLogins.set(key, job);
  if (where === "cloud") {
    runCloudMcpLogin(name, mcpServer, job).catch((e) => { job.state = "failed"; job.error = e.message; });
    return { state: "running" };
  }
  (async () => {
    let child;
    {
      let cwd = HUB;
      let engine = "claude";
      try {
        const meta = JSON.parse(await readFile(join(HIVE_HOME, "sessions", `${name}.json`), "utf8"));
        if (meta.cwd && existsSync(meta.cwd)) cwd = meta.cwd;
        if (OTHER_AGENTS.has(meta.agent)) engine = meta.agent;
      } catch {}
      if (engine === "kiro") {
        await kiroMcpLogin(name, mcpServer, job);
        return;
      }
      if (engine === "kimi") {
        job.state = "failed";
        job.error = `kimi has no login command the hive can drive from outside its chat — sign in to ${mcpServer} from a kimi terminal in ${cwd}, then reopen the seat`;
        return;
      }
      if (engine === "cursor") {
        job.state = "failed";
        job.error = `cursor's mcp login only knows the servers in its own mcp.json — sign in to ${mcpServer} from a cursor terminal in ${cwd} (agent mcp login), then reopen the seat`;
        return;
      }
      if (engine === "codex") await codexKnowsTheServer(mcpServer, cwd);
      const login = engine === "opencode" ? ["opencode", ["mcp", "auth", mcpServer]]
        : engine === "codex" ? ["codex", ["mcp", "login", mcpServer]]
        : [theClaude(), ["mcp", "login", mcpServer]];
      const [shell, args] = NATIVE ? await nativeProgram(login[0], login[1]) : viaBash(login[0], login[1]);
      child = pty.spawn(shell, args, {
        name: "xterm-256color",
        cols: 400,
        rows: 50,
        cwd,
        env: { ...process.env, AWS_PROFILE, TERM: "xterm-256color" }
      });
    }
    job.child = child;
    let tail = "";
    child.onData((data) => {
      tail = (tail + data).slice(-4000);
      const link = loginUrlIn(tail);
      if (link && !job.url) job.url = link;
    });
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, 300000);
    child.onExit(({ exitCode: code }) => {
      clearTimeout(timer);
      const verdict = loginVerdict(code, tail);
      job.state = verdict.state;
      job.error = verdict.error;
    });
  })().catch((e) => { job.state = "failed"; job.error = String(e?.message || e).slice(0, 200); });
  return { state: "running" };
}

const FIND_FILES = `find . -type d \\( -name node_modules -o -name .git -o -name dist -o -name build -o -name .next -o -name .venv -o -name _build -o -name deps -o -name .worktrees \\) -prune -o -type f -print 2>/dev/null | head -20000`;
const fileLists = new Map();

async function seatFiles(name, where) {
  const key = `${name}|${where}`;
  const hit = fileLists.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.files;
  let out = "";
  if (where === "cloud") {
    const script = `cwd=$(sed -n 's/.*"cwd": *"\\([^"]*\\)".*/\\1/p' /workspace/hive/sessions/${name}.json 2>/dev/null | head -1); cd "\${cwd:-/workspace/repos}" && ${FIND_FILES}`;
    out = (await onTheServer(script, [], { timeout: 25000 })).out;
  } else {
    let cwd = "";
    try { cwd = JSON.parse(await readFile(join(HIVE_HOME, "sessions", `${name}.json`), "utf8")).cwd || ""; } catch {}
    if (!cwd || !existsSync(cwd)) cwd = HUB;
    out = await sh("bash", ["-c", `cd ${JSON.stringify(cwd)} && ${FIND_FILES}`], { timeout: 15000 });
  }
  const files = out.split("\n").map((l) => l.replace(/^\.\//, "").trim()).filter(Boolean);
  fileLists.set(key, { at: Date.now(), files });
  return files;
}

const cloudSeatCwd = (name) => `[ -n "$1" ] || set -- "$(sed -n 's/.*"cwd": *"\\([^"]*\\)".*/\\1/p' /workspace/hive/sessions/${name}.json 2>/dev/null | head -1)" "\${@:2}"\n`;

const EDITOR_SCRIPT = [
  'PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:$HOME/.local/bin"',
  'top=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || top="$1"',
  'f="$top/$2"',
  '[ -e "$f" ] || { echo "that file is not there any more"; exit 3; }',
  'for e in cursor code windsurf; do command -v "$e" >/dev/null 2>&1 && { "$e" -g "$f:$3" >/dev/null 2>&1 & echo "$e"; exit 0; }; done',
  'command -v zed >/dev/null 2>&1 && { zed "$f:$3" >/dev/null 2>&1 & echo zed; exit 0; }',
  'command -v open >/dev/null 2>&1 && { open "$f" && echo open; exit $?; }',
  'command -v xdg-open >/dev/null 2>&1 && { xdg-open "$f" >/dev/null 2>&1 & echo xdg-open; exit 0; }',
  'echo "no editor found on this machine"; exit 4'
].join("\n");

async function changesDirOf(name, where, tree) {
  const seat = (cache.data?.sessions || []).find((one) => one.name === name && one.where === where);
  const trees = seat?.trees || [];
  const picked = trees.find((one) => one.path === tree) || trees[0];
  if (picked?.path) return { dir: picked.path, trees };
  if (where === "cloud") return { dir: "", trees };
  let cwd = "";
  try { cwd = JSON.parse(await readFile(join(HIVE_HOME, "sessions", `${name}.json`), "utf8")).cwd || ""; } catch {}
  return { dir: cwd || HUB, trees };
}

async function inSeatTree({ name, where, tree }, script, extra = []) {
  const { dir, trees } = await changesDirOf(name, where, tree);
  const said = where === "cloud"
    ? await onTheServer(cloudSeatCwd(name) + script, [dir, ...extra], { timeout: 25000 })
    : await shr(BASH, ["-c", script, name, dir, ...extra], { timeout: 15000, maxBuffer: 8 << 20 });
  return { ...said, dir, trees };
}

async function seatChanges(asked) {
  const said = await inSeatTree(asked, CHANGES_SCRIPT);
  const read = readChanges(said.out);
  return {
    ...read,
    where: asked.where,
    tree: said.dir,
    trees: said.trees.map((one) => ({ path: one.path, repo: one.repo, branch: one.branch })),
    ...(read.state === "unread" ? { error: said.error.slice(0, 160) || "git did not answer" } : {})
  };
}

async function seatDiff(asked) {
  const said = await inSeatTree(asked, DIFF_SCRIPT, [asked.path]);
  return { ...readDiff(said.out), path: asked.path };
}

async function discardChange(asked) {
  const said = await inSeatTree(asked, DISCARD_SCRIPT, [asked.path]);
  return said.out.includes("#hive:done") ? { ok: true } : { error: said.error.slice(0, 160) || "git would not put it back" };
}

async function openChange(asked) {
  const { dir } = await changesDirOf(asked.name, asked.where, asked.tree);
  const said = await shr(BASH, ["-c", EDITOR_SCRIPT, "editor", dir, asked.path, String(asked.line)], { timeout: 8000 });
  const editor = said.out.trim().split("\n").pop() || "";
  return said.ok ? { ok: true, editor } : { error: editor || said.error.slice(0, 160) || "the editor did not open" };
}

function rankFiles(files, q) {
  if (!q) return files.slice(0, 20);
  const needle = q.toLowerCase();
  const scored = [];
  for (const f of files) {
    const path = f.toLowerCase();
    const base = path.slice(path.lastIndexOf("/") + 1);
    let score = -1;
    if (base.startsWith(needle)) score = 0;
    else if (base.includes(needle)) score = 1;
    else if (path.includes(needle)) score = 2;
    else {
      let i = 0;
      for (const ch of path) if (ch === needle[i]) i++;
      if (i === needle.length) score = 3;
    }
    if (score >= 0) scored.push([score, f.length, f]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : 1));
  return scored.slice(0, 20).map((s) => s[2]);
}

/* git does the ignoring for us: `git ls-files --cached --others --exclude-standard`
   lists what is tracked plus what is new and not ignored, so every .gitignore in
   the tree — and the global one — is honoured without parsing a single pattern.
   .hiveignore, at the root of the hub, takes out what git has no opinion about. */

const INDEX_TTL = 90000;
const INDEX_CAP = 60000;
const FILE_CAP = 2 << 20;
const HIT_CAP = 200;
const HIT_WIDTH = 320;
const CLOUD_ROOT = "/workspace/repos";

const INDEX_WALK = [
  'root="$1"',
  'for dir in "$root"/*/ "$root"/.worktrees/*/ "$root"/.worktrees/*/*/; do',
  '  [ -e "$dir.git" ] || continue',
  '  rel=${dir#"$root/"}; rel=${rel%/}',
  '  branch=$(git -C "$dir" symbolic-ref --quiet --short HEAD 2>/dev/null || echo detached)',
  '  git -C "$dir" ls-files --cached --others --exclude-standard 2>/dev/null | head -20000 |',
  '    awk -v r="$rel" -v b="$branch" \'{ print r "\\t" b "\\t" $0 }\'',
  'done',
  'true'
].join("\n");

const SEARCH_WALK = [
  'root="$1"; needle="$2"; glob="$3"; fold="$4"',
  'box=$(mktemp -d "${TMPDIR:-/tmp}/hive-grep.XXXXXX") || exit 0',
  'n=0',
  'for dir in "$root"/*/ "$root"/.worktrees/*/; do',
  '  [ -e "$dir.git" ] || continue',
  '  rel=${dir#"$root/"}; rel=${rel%/}',
  '  n=$((n + 1))',
  '  (',
  '    if [ -n "$glob" ]; then',
  '      out=$(git -C "$dir" grep $fold -n -I --untracked --no-color -F -e "$needle" -- "$glob" 2>/dev/null | head -40)',
  '    else',
  '      out=$(git -C "$dir" grep $fold -n -I --untracked --no-color -F -e "$needle" 2>/dev/null | head -40)',
  '    fi',
  '    [ -n "$out" ] || exit 0',
  '    printf "%s\\n" "$out" | awk -v r="$rel" \'{ print r "\\t" $0 }\' > "$box/$n"',
  '  ) &',
  'done',
  'wait',
  'cat "$box"/* 2>/dev/null',
  'rm -rf "$box"',
  'true'
].join("\n");

const READ_FILE = [
  'f="$1"; cap="$2"',
  '[ -f "$f" ] || { echo "no such file"; exit 3; }',
  'size=$(wc -c < "$f" | tr -d " ")',
  '[ "$size" -le "$cap" ] || { echo "too big"; exit 4; }',
  'base64 "$f"'
].join("\n");

const WRITE_FILE = [
  'f="$1"',
  'mkdir -p "$(dirname "$f")"',
  'base64 -d > "$f.hive-tmp" && mv "$f.hive-tmp" "$f"'
].join("\n");

const isRepoRel = (rel) => /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(String(rel || "")) && !String(rel).split("/").includes("..");
const isFileRel = (path) => !!path && !path.startsWith("/") && !path.includes("\\") && !path.split("/").includes("..") && path.length < 400;
const rootOf = (where) => (where === "cloud" ? CLOUD_ROOT : HUB);
const repoNameOf = (rel) => rel.split("/").pop();

function shIn(cmd, args, input, timeout = 20000) {
  const argv = args;
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { env: { ...process.env, AWS_PROFILE } });
    let out = "", err = "";
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeout);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, out, error: e.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, out, error: err.trim() }); });
    child.stdin.end(input);
  });
}

function hiveIgnore() {
  let raw = "";
  try { raw = readFileSync(join(HUB, ".hiveignore"), "utf8"); } catch { return []; }
  return raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((pattern) => {
    const body = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, " ").replace(/\*/g, "[^/]*").replace(/ /g, ".*");
    return new RegExp(pattern.startsWith("/") ? `^${body.slice(1)}` : `(^|/)${body}`);
  });
}

function readIndexWalk(raw, ignores = []) {
  const rows = [];
  for (const line of String(raw || "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const second = line.indexOf("\t", tab + 1);
    if (second < 0) continue;
    const repo = line.slice(0, tab);
    const branch = line.slice(tab + 1, second);
    const path = line.slice(second + 1).trim();
    if (!repo || !path) continue;
    if (ignores.some((re) => re.test(path) || re.test(`${repoNameOf(repo)}/${path}`))) continue;
    rows.push({ repo, name: repoNameOf(repo), branch, path });
    if (rows.length >= INDEX_CAP) break;
  }
  return rows;
}

const indexCache = new Map();

async function fileIndex(where, force) {
  const hit = indexCache.get(where) || { at: 0, rows: [], running: null };
  if (!force && hit.at && Date.now() - hit.at < INDEX_TTL) return hit.rows;
  if (hit.running) return hit.running;
  const running = (async () => {
    const raw = where === "cloud"
      ? (await onTheServer(INDEX_WALK, [CLOUD_ROOT], { timeout: 90000 })).out
      : await sh(BASH, ["-c", INDEX_WALK, "index", HUB], { timeout: 60000 });
    const rows = readIndexWalk(raw, hiveIgnore());
    indexCache.set(where, { at: Date.now(), rows, running: null });
    return rows;
  })().catch(() => {
    indexCache.set(where, { at: Date.now(), rows: hit.rows, running: null });
    return hit.rows;
  });
  indexCache.set(where, { ...hit, running });
  return running;
}

function fuzzyScore(hay, needle) {
  let at = 0, first = -1, last = -1, gaps = 0, edges = 0;
  for (const ch of needle) {
    const found = hay.indexOf(ch, at);
    if (found < 0) return null;
    if (first < 0) first = found;
    else if (found > at) gaps += 1;
    if (found === 0 || /[/._\- ]/.test(hay[found - 1])) edges += 1;
    at = found + 1;
    last = found;
  }
  return (last - first + 1) - needle.length + gaps * 2 - edges * 3;
}

function pathScore(name, path, needle) {
  const hay = `${name}/${path}`.toLowerCase();
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (!needle) return 500 + path.length / 1000;
  if (base === needle) return 0;
  if (base.startsWith(needle)) return 10 + base.length / 1000;
  if (base.includes(needle)) return 20 + base.length / 1000;
  if (hay.includes(needle)) return 40 + hay.length / 1000;
  const onBase = fuzzyScore(base, needle);
  if (onBase !== null) return 100 + onBase + base.length / 1000;
  const onPath = fuzzyScore(hay, needle);
  if (onPath !== null) return 300 + onPath + hay.length / 1000;
  return -1;
}

function rankIndex(rows, q, limit = 30) {
  const needle = String(q || "").toLowerCase().trim();
  const scored = [];
  for (const row of rows) {
    const score = pathScore(row.name, row.path, needle);
    if (score < 0) continue;
    scored.push({ ...row, score, deep: row.repo.includes("/") ? 1 : 0 });
  }
  scored.sort((a, b) => a.score - b.score || a.deep - b.deep || (a.path < b.path ? -1 : 1));
  const out = [];
  const seen = new Map();
  for (const row of scored) {
    const key = `${row.name}|${row.path}`;
    const at = seen.get(key);
    if (at !== undefined) { out[at].copies += 1; continue; }
    if (out.length >= limit) continue;
    seen.set(key, out.length);
    out.push({ repo: row.repo, name: row.name, branch: row.branch, path: row.path, copies: 1 });
  }
  return out;
}

function readSearchWalk(raw) {
  const hits = [];
  for (const line of String(raw || "").split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const repo = line.slice(0, tab);
    const rest = line.slice(tab + 1);
    const colon = rest.indexOf(":");
    if (colon < 0) continue;
    const second = rest.indexOf(":", colon + 1);
    if (second < 0) continue;
    const path = rest.slice(0, colon);
    const at = Number(rest.slice(colon + 1, second));
    if (!path || !Number.isFinite(at)) continue;
    hits.push({ repo, name: repoNameOf(repo), path, line: at, text: rest.slice(second + 1).slice(0, HIT_WIDTH) });
    if (hits.length >= HIT_CAP) break;
  }
  return hits;
}

async function searchCode({ q, where, glob }) {
  const needle = String(q || "");
  if (needle.length < 2) return { hits: [], total: 0 };
  const fold = /[A-Z]/.test(needle) ? "" : "-i";
  const safeGlob = /^[A-Za-z0-9_*./-]{0,40}$/.test(String(glob || "")) ? String(glob || "") : "";
  const raw = where === "cloud"
    ? (await onTheServer(SEARCH_WALK, [CLOUD_ROOT, needle, safeGlob, fold], { timeout: 45000 })).out
    : await sh(BASH, ["-c", SEARCH_WALK, "search", HUB, needle, safeGlob, fold], { timeout: 30000 });
  const hits = readSearchWalk(raw);
  return { hits, total: hits.length };
}

async function readRepoFile({ repo, path, where }) {
  if (!isRepoRel(repo) || !isFileRel(path)) return { error: "that is not a path I will open" };
  const full = `${rootOf(where)}/${repo}/${path}`;
  if (where === "cloud") {
    const r = await onTheServer(READ_FILE, [full, String(FILE_CAP)], { timeout: 25000 });
    if (!r.ok) return { error: r.out.trim() || r.error || "could not read it on the server" };
    return { text: Buffer.from(r.out.replace(/\s/g, ""), "base64").toString("utf8") };
  }
  try {
    if (statSync(full).size > FILE_CAP) return { error: "too big" };
    return { text: await readFile(full, "utf8") };
  } catch (e) { return { error: String(e?.message || e).slice(0, 160) }; }
}

async function writeRepoFile({ repo, path, where, text }) {
  if (!isRepoRel(repo) || !isFileRel(path)) return { error: "that is not a path I will write" };
  if (typeof text !== "string" || text.length > FILE_CAP) return { error: "too big to save" };
  const full = `${rootOf(where)}/${repo}/${path}`;
  if (where === "cloud") {
    const r = await onTheServer(WRITE_FILE, [full], { timeout: 30000, input: Buffer.from(text, "utf8").toString("base64") });
    return r.ok ? { ok: true } : { error: r.error || "could not save it on the server" };
  }
  try {
    if (!existsSync(join(rootOf(where), repo))) return { error: "unknown repo" };
    await writeFile(full, text, "utf8");
    return { ok: true };
  } catch (e) { return { error: String(e?.message || e).slice(0, 160) }; }
}

const HISTORY_LINES = 4000;

async function paneHistory(name, where) {
  if (where === "cloud") {
    const looked = await onCloudSeats("GET", `/${encodeURIComponent(name)}/screen?lines=${HISTORY_LINES}`);
    return looked.ok ? String(looked.body.screen || "") : "";
  }
  if (NATIVE) return nativeRoom().capture(name, HISTORY_LINES);
  return sh(TMUX, ["capture-pane", "-t", `${LOCAL_SESSION}:=${name}`, "-p", "-e", "-S", `-${HISTORY_LINES}`], { timeout: 6000 });
}

const DATA_URL = /^data:([\w+.-]+\/[\w+.-]+)?;base64,/i;

function extOf(name, mime) {
  const named = extensionOf(name);
  if (named) return named;
  const sub = ((mime || "").split("/")[1] || "").replace(/^x-/, "").replace("jpeg", "jpg");
  return /^[a-z0-9]{1,8}$/i.test(sub) ? sub.toLowerCase() : "bin";
}

const bytesOf = (base64) => Math.floor(base64.replace(/=+$/, "").length * 3 / 4);

const SHOTS_DIR = join(HIVE_HOME, "shots");

function shotsDirOf(name) {
  return join(SHOTS_DIR, name);
}

async function forgetShots(name) {
  if (!isSeatName(name)) return;
  await rm(shotsDirOf(name), { recursive: true, force: true }).catch(() => {});
}

async function sweepOldShots() {
  const days = shotsDaysOf();
  if (!days) return { gone: [], freed: 0 };
  const said = await sweepShots([SHOTS_DIR, join(HUB, ".hive/assets")], { days });
  if (said.gone.length) console.log(`swept ${said.gone.length} shots older than ${days} days, ${Math.round(said.freed / (1 << 20))} MB`);
  return said;
}

async function saveFiles(input, label) {
  const carried = (Array.isArray(input) ? input : [input]).filter(Boolean)
    .map((f) => (typeof f === "string" ? { data: f } : f))
    .map((f) => {
      const data = String(f.data || "");
      const kind = DATA_URL.exec(data);
      const raw = kind ? data.replace(DATA_URL, "") : "";
      const ext = extOf(f.name, kind?.[1]);
      const given = String(f.name || "").replace(/\.[A-Za-z0-9]+$/, "");
      return { name: `${given || "file"}.${ext}`, stem: slug(given), size: bytesOf(raw), ext, raw };
    });
  if (carried.some((f) => !f.raw)) return { error: "that is not a file this app knows how to carry" };
  const refused = refuseDrop(carried);
  if (refused) return { error: refused };

  const dir = isSeatName(label) ? shotsDirOf(label) : join(HUB, ".hive/assets");
  await mkdir(dir, { recursive: true });
  const files = [];
  for (const f of carried) {
    const stem = [slug(label), f.stem].filter(Boolean).join("-") || "file";
    const file = join(dir, `${stem}-${Date.now()}-${files.length}.${f.ext}`);
    await writeFile(file, Buffer.from(f.raw, "base64"));
    files.push(file);
  }
  return { files };
}


const IMAGE_TYPES = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", bmp: "image/bmp", avif: "image/avif", svg: "image/svg+xml"
};
const READ_ON_POD = `
f=$1; d=$2
case "$f" in "~/"*) f="$HOME/\${f#"~"/}";; esac
case "$f" in /*) ;; *) [ -n "$d" ] && f="$d/$f";; esac
[ -f "$f" ] || { echo "there is no $f on the pod" >&2; exit 3; }
[ "$(wc -c < "$f")" -le ${FILE_CEILING} ] || { echo "that file is bigger than 24 MB" >&2; exit 4; }
exec cat -- "$f"
`;

function imageTypeOf(path) {
  const ext = (/\.([A-Za-z0-9]+)$/.exec(path) || [])[1] || "";
  return IMAGE_TYPES[ext.toLowerCase()] || "";
}

async function paneDirectory(name, where) {
  if (!/^[\w.-]+$/.test(name || "")) return "";
  if (where === "cloud") {
    const looked = await onCloudSeats("GET", `/${encodeURIComponent(name)}/screen?lines=1`);
    return looked.ok ? String(looked.body.cwd || "") : "";
  }
  if (NATIVE) return nativeRoom().cwdOf(name);
  const args = ["display-message", "-p", "-t", `${LOCAL_SESSION}:=${name}`, "#{pane_current_path}"];
  const out = await sh(...viaBash(TMUX, args), { timeout: 6000 });
  return out.trim().split("\n").pop() || "";
}

function readBytes(cmd, args, timeout = 30000) {
  const argv = args;
  return new Promise((resolve) => {
    execFile(cmd, argv, { timeout, maxBuffer: FILE_CEILING, encoding: "buffer", env: { ...process.env, AWS_PROFILE } },
      (err, stdout, stderr) => resolve({
        ok: !err,
        data: stdout,
        error: err ? String(stderr || err.message || "").trim() : ""
      }));
  });
}

async function readImage({ path, where, session }) {
  const type = imageTypeOf(path);
  if (!type) return { error: "that name does not end in an image extension" };
  const relative = !path.startsWith("/") && !path.startsWith("~/") && !/^[A-Za-z]:/.test(path);
  const dir = relative ? await paneDirectory(session, where) : "";
  if (relative && !dir) return { error: "the path is relative and the session no longer says which directory it is in" };
  if (where === "cloud") {
    const r = await bytesFromServer(READ_ON_POD, [path, dir], { timeout: 30000 });
    if (r.ok) return { type, data: r.data };
    return { error: r.error.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "the server refused to read that file" };
  }
  const file = asTheSystemWritesIt(relative ? join(dir, path) : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
  if (!existsSync(file)) return { error: `there is no ${file} on this machine` };
  const anchor = relative ? dir : await paneDirectory(session, where);
  if (!withinRoots(file, [anchor, HUB, HIVE_HOME, tmpdir(), TEMP_DIR])) return { error: "that image lives outside the seat's directory, the hub and tmp" };
  if (statSync(file).size > FILE_CEILING) return { error: "that file is bigger than 24 MB" };
  return { type, data: await readFile(file) };
}

const ARTIFACT_HOME = join(HIVE_HOME, "artifacts");
const ARTIFACT_KEPT = 12;

const artifactKey = (session, path) =>
  createHash("sha1").update(`${session}\u0000${path}`).digest("hex").slice(0, 12);

function titleOfPage(html) {
  const found = /<title[^>]*>([\s\S]{0,400}?)<\/title>/i.exec(String(html || ""));
  return (found ? found[1] : "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ").trim().slice(0, 120);
}

function nextVersions(kept, coming) {
  const last = kept[kept.length - 1];
  if (last && last.hash === coming.hash) {
    const same = kept.slice(0, -1).concat([{ ...last, label: coming.label || last.label, at: coming.at || last.at }]);
    return { versions: same, wrote: 0 };
  }
  const n = (last?.n || 0) + 1;
  return { versions: kept.concat([{ ...coming, n }]).slice(-ARTIFACT_KEPT), wrote: n };
}

function artifactIndex(key) {
  try { return JSON.parse(readFileSync(join(ARTIFACT_HOME, key, "index.json"), "utf8")); } catch { return null; }
}

function keptArtifacts() {
  let keys = [];
  try { keys = readdirSync(ARTIFACT_HOME); } catch { return []; }
  const pages = [];
  for (const key of keys) {
    const kept = artifactIndex(key);
    const head = (kept?.versions || [])[(kept?.versions || []).length - 1];
    if (!kept || !head) continue;
    pages.push({
      key: kept.key || key,
      session: kept.session || "",
      where: kept.where === "cloud" ? "cloud" : "local",
      path: kept.path || "",
      slug: kept.slug || "",
      title: kept.title || "",
      tab: kept.tab || "",
      url: kept.url || "",
      label: head.label || "",
      n: head.n || 0,
      at: head.at || 0
    });
  }
  return pages.sort((a, b) => (b.at || 0) - (a.at || 0));
}

async function readArtifactPage({ path, where, session }) {
  if (!/\.html?$/i.test(String(path || ""))) return { error: "an artifact is an html page" };
  const relative = !path.startsWith("/") && !path.startsWith("~/") && !/^[A-Za-z]:/.test(path);
  const dir = relative ? await paneDirectory(session, where) : "";
  if (relative && !dir) return { error: "the path is relative and the session no longer says which directory it is in" };
  if (where === "cloud") {
    if (!CLOUD) return { error: NO_ADDRESS };
    const r = await bytesFromServer(READ_ON_POD, [path, dir], { timeout: 30000 });
    if (r.ok) return { html: r.data.toString("utf8") };
    const said = r.error.split("\n").map((l) => l.trim())
      .filter((l) => l && !/^command terminated with exit code/i.test(l) && !/^Defaulted container/i.test(l));
    return { error: said.pop() || "the pod refused to read that page" };
  }
  const file = asTheSystemWritesIt(relative ? join(dir, path) : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
  if (!existsSync(file)) return { error: `there is no ${file} on this machine` };
  if (statSync(file).size > FILE_CEILING) return { error: "that page is bigger than 24 MB" };
  return { html: await readFile(file, "utf8") };
}

async function keepArtifact({ session, where, path, label, url, at, tab }) {
  const page = await readArtifactPage({ path, where, session });
  if (page.error) return { error: page.error };
  const key = artifactKey(session, path);
  const dir = join(ARTIFACT_HOME, key);
  const was = artifactIndex(key) || { key, versions: [] };
  const hash = createHash("sha1").update(page.html).digest("hex").slice(0, 16);
  const { versions, wrote } = nextVersions(was.versions || [], {
    hash, label: String(label || ""), at: at || Date.now(), bytes: Buffer.byteLength(page.html)
  });
  await mkdir(dir, { recursive: true });
  if (wrote) await writeFile(join(dir, `v${wrote}.html`), page.html);
  for (const gone of (was.versions || []).filter((v) => !versions.some((k) => k.n === v.n))) {
    try { rmSync(join(dir, `v${gone.n}.html`)); } catch {}
  }
  const named = titleOfPage(page.html);
  const filename = String(path).split("/").pop();
  const index = {
    key, session, where, path,
    url: url || was.url || "",
    title: named || was.title || filename,
    slug: slugOf(named || filename, path),
    tab: tabOf(path, tab),
    versions
  };
  await writeFile(join(dir, "index.json"), JSON.stringify(index));
  return index;
}

const SHELF_HOME = join(HIVE_HOME, "shelf");
const SHELF_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const SHELF_CLONE_TIMEOUT = 180000;
const SHELF_GIT_TIMEOUT = 60000;
let shelfCloned = "";

const shelfGit = (args, timeout = SHELF_GIT_TIMEOUT) => shr("git", ["-C", SHELF_HOME, ...args], { timeout });

async function shelfRepoUrl() {
  const { config } = await readConfig();
  return config.shelf || "";
}

async function openShelf() {
  const url = await shelfRepoUrl();
  if (!url) return { error: "no shelf repo yet — point the hive at a private repo in settings" };
  if (shelfCloned === url && existsSync(join(SHELF_HOME, ".git"))) return { url, home: SHELF_HOME };

  if (existsSync(join(SHELF_HOME, ".git"))) {
    const seen = (await sh("git", ["-C", SHELF_HOME, "remote", "get-url", "origin"], { timeout: 15000 })).trim();
    if (seen && !sameGithubRepo(seen, url)) {
      rmSync(SHELF_HOME, { recursive: true, force: true });
    }
  }

  if (!existsSync(join(SHELF_HOME, ".git"))) {
    let slug = "";
    try { slug = await ensurePrivateRepo(url); } catch (err) { return { error: err.message }; }
    await mkdir(dirname(SHELF_HOME), { recursive: true });
    const cloned = await shr("gh", ["repo", "clone", slug, SHELF_HOME], { timeout: SHELF_CLONE_TIMEOUT });
    if (!cloned.ok && !existsSync(join(SHELF_HOME, ".git"))) {
      return { error: `could not clone ${slug}: ${(cloned.error || "").slice(0, 160) || "gh refused"}` };
    }
  }
  shelfCloned = url;
  return { url, home: SHELF_HOME };
}

const shelfBranch = async () =>
  (await sh("git", ["-C", SHELF_HOME, "symbolic-ref", "--quiet", "--short", "HEAD"], { timeout: 10000 })).trim() || "main";

const shelfTurn = oneAtATime();

async function shelfPull() {
  const opened = await openShelf();
  if (opened.error) return opened;
  const level = await catchUp({ git: (args) => shelfGit(args, 90000), branch: await shelfBranch() });
  if (!level.ok) return { ...opened, error: level.error };
  return opened;
}

async function pushShelf(message, paths = ["a"]) {
  const sent = await sendToShelf({ git: (args) => shelfGit(args, 120000), message, branch: await shelfBranch(), paths });
  if (sent.error && !sent.committed) return sent;
  const sha = (await sh("git", ["-C", SHELF_HOME, "rev-parse", "--short", "HEAD"], { timeout: 10000 })).trim();
  return { ...sent, sha };
}

const mirrorToShelf = (asked) => shelfTurn(() => mirrorOneToShelf(asked));

const whoComments = () => {
  if (DEV) return DEV;
  try { return userInfo().username; } catch { return ""; }
};

const commentOnShelf = (asked) => shelfTurn(() => commentOneOnShelf(asked));

async function commentOneOnShelf({ slug, tab, v, text, pin, re, seat, agent, quiet, at }) {
  const opened = await shelfPull();
  if (opened.error) return opened;
  const who = agent && seat ? seat : whoComments();
  const added = addComment(SHELF_HOME, slug, { tab, v, who, text, pin, re, agent, at });
  if (added.error) return added;
  const sent = await pushShelf(commentCommitLine(slug, added.comment));
  /* quiet is for the caller that is going to hand the question over itself: without it the seat
     hears the same question twice, once from here and once from the line typed into it. */
  if (!agent && !quiet) tellSeatAboutComment(slug, added.comment, seat).catch(() => {});
  return { comment: added.comment, comments: added.comments, ...sent };
}

const settleShelfComment = (asked) => shelfTurn(async () => {
  const opened = await shelfPull();
  if (opened.error) return opened;
  const settled = settleComment(SHELF_HOME, asked.slug, { ...asked, who: whoComments() });
  if (settled.error) return settled;
  const sent = await pushShelf(settleCommitLine(asked.slug, settled.comment));
  return { comment: settled.comment, comments: settled.comments, ...sent };
});

async function tellSeatAboutComment(slug, comment, asked) {
  const meta = readShelfMeta(SHELF_HOME, slug);
  const seat = String(asked || meta?.seat || "");
  if (!seat) return;
  const spot = comment.pin ? ` at ${comment.pin.elAt || comment.pin.el || comment.pin.name || comment.pin.frame || "the page"}` : "";
  const where = `${comment.tab || "the page"}${comment.v ? ` v${comment.v}` : ""}`;
  const link = `hive://shelf/${slug}${comment.tab ? `?tab=${comment.tab}` : ""}`;
  const back = `answer in the page with reply_on_page: slug "${slug}", thread "${comment.re || comment.id}"`;
  await deliverSay(seat, comment.who || "someone", `asked on "${meta?.title || slug}" (${where}${spot}): ${comment.text} · ${link} · ${back}`);
}

const leafEnv = () => ({ ...process.env, HIVE_LEAF_URL: LEAF_URL });

async function alsoToLeaf({ slug, tab, title, html }) {
  if (!LEAF_URL || !LEAF_PARENT) return null;
  const ready = await leafReady({ env: leafEnv(), write: true });
  if (ready.error) return { error: ready.error };
  const opened = await ready.session.open();
  if (opened.error) return opened;
  const offered = await ready.session.tools();
  if (offered.error) return offered;
  return sendToLeaf({
    session: ready.session,
    tools: offered.tools,
    inputs: offered.inputs,
    title,
    html,
    parentId: LEAF_PARENT,
    docId: leafIdOf(readShelfMeta(SHELF_HOME, slug), tab)
  });
}

async function mirrorOneToShelf({ session, where, path, label, url, at, tab }) {
  const opened = await shelfPull();
  if (opened.error) return opened;

  const page = await readArtifactPage({ path, where, session });
  if (page.error) return { error: page.error };

  const title = titleOfPage(page.html) || String(path).split("/").pop();
  const which = tabOf(path, tab);
  const slug = slugOf(title, path);
  const leaf = await alsoToLeaf({ slug, tab: which, title, html: page.html }).catch((err) => ({ error: err.message }));
  const shelved = shelve({
    home: SHELF_HOME,
    slug,
    tab: which,
    html: page.html,
    title,
    kind: which,
    owner: DEV || "",
    seat: String(session || ""),
    label: String(label || ""),
    url: String(url || ""),
    at: at || Date.now(),
    leafId: leaf && !leaf.error ? leaf.id : ""
  });
  if (shelved.error) return shelved;
  const kept = shelved.meta.tabs?.[shelved.tab]?.versions || [];
  const head = kept[kept.length - 1];
  const sent = await pushShelf(commitLine(shelved.meta, shelved.tab, head?.n || shelved.wrote, shelved.wrote));
  if (shelved.wrote) shelfThumbs.want(slug, shelved.tab, shelved.wrote);
  return { meta: shelved.meta, wrote: shelved.wrote, tab: shelved.tab, ...sent, ...(leaf ? { leaf } : {}) };
}

const shelfThumbs = thumbQueue();

const keepThumbOnShelf = (asked) => keepThumbOnShelfNow(asked).catch((err) => ({ error: String(err?.message || err).slice(0, 200) }));

async function keepThumbOnShelfNow({ id, data }) {
  const job = shelfThumbs.take(String(id || ""));
  if (!job) return { error: "nobody asked for that thumbnail" };
  if (!PNG_DATA_URL.test(String(data || ""))) return { error: "no picture came back for that page" };
  const bytes = Buffer.from(String(data).replace(PNG_DATA_URL, ""), "base64");
  return shelfTurn(async () => {
    const opened = await shelfPull();
    if (opened.error) return opened;
    const kept = keepThumb(SHELF_HOME, job.slug, job.tab, job.v, bytes);
    if (kept.error) return kept;
    const sent = await pushShelf(`estante: ${job.slug} · ${job.tab} v${job.v} · miniatura`);
    return { ok: true, ...sent };
  });
}

const PRINT_DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,/i;

function pageOfSeatOnShelf(seat) {
  const mine = (shelfIndex(SHELF_HOME).pages || []).filter((meta) => meta.seat === seat);
  return mine[0] || null;
}

async function keepPrintOnShelf({ session, slug, caption, data, from, after, at }) {
  const opened = await shelfPull();
  if (opened.error) return opened;

  const meta = slug ? readShelfMeta(SHELF_HOME, slug) : pageOfSeatOnShelf(session);
  if (!meta) return { error: slug ? "that page is not on the shelf" : "this chat has no page on the shelf yet: publish the mission's page first, then keep the print on it" };

  const kind = PRINT_DATA_URL.exec(String(data || ""));
  if (!kind) return { error: "a print comes as a jpeg, png or webp data url" };
  const ext = kind[1].split("/")[1];
  const bytes = Buffer.from(String(data).replace(PRINT_DATA_URL, ""), "base64");
  const kept = keepPrint(SHELF_HOME, meta.slug, { bytes, ext, caption, who: DEV || "", seat: String(session || ""), from, after, at: at || Date.now() });
  if (kept.error) return kept;

  const html = printsPage({ title: meta.title, slug: meta.slug, prints: kept.prints });
  const embedded = printsPage({
    title: meta.title,
    slug: meta.slug,
    prints: kept.prints,
    src: (print) => {
      const ext = print.file.split(".").pop();
      try { return `data:${PRINT_KINDS[ext] || "image/jpeg"};base64,${readFileSync(join(printsDir(SHELF_HOME, meta.slug), print.file)).toString("base64")}`; } catch { return `prints/${print.file}`; }
    }
  });
  const leaf = await alsoToLeaf({ slug: meta.slug, tab: "prints", title: meta.title, html: embedded }).catch((err) => ({ error: err.message }));
  const shelved = shelve({
    home: SHELF_HOME,
    slug: meta.slug,
    tab: "prints",
    html,
    title: meta.title,
    kind: meta.kind,
    owner: DEV || "",
    seat: String(session || ""),
    label: "delivered",
    at: at || Date.now(),
    leafId: leaf && !leaf.error ? leaf.id : ""
  });
  if (shelved.error) return shelved;
  const versions = shelved.meta.tabs?.prints?.versions || [];
  const head = versions[versions.length - 1];
  const sent = await pushShelf(`estante: ${meta.slug} · prints #${kept.print.n} · ${kept.print.caption.slice(0, 80)}`);
  return { slug: meta.slug, print: kept.print, count: kept.prints.length, link: `hive://shelf/${meta.slug}?tab=prints#p${kept.print.n}`, v: head?.n || shelved.wrote, ...sent, ...(leaf ? { leaf } : {}) };
}

const keepPrintToShelf = (asked) => shelfTurn(() => keepPrintOnShelf(asked).catch((err) => ({ error: String(err?.message || err).slice(0, 200) })));

function readShelfFile(slug, file) {
  const named = String(file || "");
  if (!/^prints\/[\w.-]+\.(?:jpe?g|png|webp)$/i.test(named)) return { error: "that is not a file a page keeps" };
  const ext = named.split(".").pop().toLowerCase();
  try {
    return { type: PRINT_KINDS[ext] || "application/octet-stream", data: readFileSync(join(SHELF_HOME, "a", slug, named)) };
  } catch {
    return { error: "that file is not on the shelf" };
  }
}

async function typeText(name, where, text, submit = false) {
  if (where === "cloud") {
    await onCloudSeats("POST", `/${encodeURIComponent(name)}/type`, { text, submit });
    cache.at = 0;
    return;
  }
  if (NATIVE) {
    await nativeRoom().type(name, `${text} `, { enter: submit });
    cache.at = 0;
    return;
  }
  const target = `${LOCAL_SESSION}:=${name}`;
  await sh(TMUX, ["send-keys", "-t", target, "-l", `${text} `], { timeout: 12000 });
  if (submit) {
    await new Promise((then) => setTimeout(then, 150));
    await sh(TMUX, ["send-keys", "-t", target, "Enter"], { timeout: 12000 });
  }
  cache.at = 0;
}

let canopyLive = { at: 0, up: false, seats: {} };
let canopyStatus = null;
let canopyTimer = null;
const CANOPY_POLL_BUSY = 5000;
const CANOPY_POLL_QUIET = 20000;

function canopyBearer() {
  try { return readFileSync(CANOPY_TOKEN_FILE, "utf8").trim(); } catch { return ""; }
}

async function canopyCall(path, { method = "GET", timeout = 3000 } = {}) {
  const bearer = canopyBearer();
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    return await fetch(`${canopyBaseOf(process.env)}${path}`, { method, headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

function canopyOfSeat(name) {
  const seat = canopyLive.seats[name];
  if (!seat) return null;
  const newest = seat.tabs[0];
  return { tabs: seat.tabs.length, live: seat.live, held: seat.held, title: newest?.title || "", url: newest?.url || "" };
}

function newestCanopyTab(name, id) {
  const seat = canopyLive.seats[name];
  if (!seat) return null;
  if (id) return seat.tabs.find((t) => String(t.id) === String(id)) || null;
  return seat.tabs[0] || null;
}

async function endCanopySession(name) {
  try { await canopyCall(`/sessions/${encodeURIComponent(name)}`, { method: "DELETE" }); } catch {}
}

function sayTakeovers(prev, next) {
  const known = (cache.data?.sessions || []).map((s) => ({ name: s.name, where: s.where, state: s.state }));
  for (const m of takeoverMessages(prev, next, known)) typeText(m.seat, m.where, m.text, m.submit).catch(() => {});
}

const CANOPY_MISSES_DOWN = 3;
let canopyMisses = 0;

async function canopyPoll() {
  let next = null;
  try {
    const r = await canopyCall("/status");
    if (r.ok) next = await r.json();
  } catch {}
  if (next) {
    canopyMisses = 0;
    if (canopyStatus) sayTakeovers(canopyStatus, next);
    canopyStatus = next;
    canopyLive = { at: Date.now(), up: true, seats: seatsOfStatus(next) };
  } else if (++canopyMisses >= CANOPY_MISSES_DOWN) {
    canopyStatus = null;
    canopyLive = { at: Date.now(), up: false, seats: {} };
  }
  const busy = Object.values(canopyLive.seats).some((s) => s.tabs.length);
  clearTimeout(canopyTimer);
  canopyTimer = setTimeout(canopyPoll, next && busy ? CANOPY_POLL_BUSY : CANOPY_POLL_QUIET);
}

const NAMING_PROMPT = `You name a work session from the mission it is about to run.
Answer with the name only: no quotes, no punctuation, no explanation.
Format: 2 to 4 words, lowercase, no accents, hyphen separated, in the language of the mission.
The name states the subject — someone glancing at it understands what this is about.
Examples: reader-cold-start, checkout-retry-flaky, login-redirect-loop.
Never generic: no new-task, session, investigation, analysis.
A link in the mission is just text: name what the mission wants done with it, never try to open it.
Mission:
<<<
`;

async function nameSession(prompt, agent = "claude") {
  const outFile = join(TEMP_DIR, `hive-name-${randomUUID()}.txt`);
  const ask = namerCommand({ agent, prompt: NAMING_PROMPT + prompt.slice(0, 2000) + "\n>>>", outFile, claude: theClaude(), engineDir: ENGINE_DIR });
  const out = await sh(...viaBash(ask.exe, ask.args), { timeout: 45000, cwd: TEMP_DIR, own: true, input: "" });
  let answer = out;
  if (ask.answerIn) {
    answer = await readFile(ask.answerIn, "utf8").catch(() => "");
    await unlink(ask.answerIn).catch(() => {});
  }
  const line = ask.pick ? ask.pick(answer) : answer.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
  return nameFromAnswer(line, prompt);
}


async function namesInUse(where) {
  const asked = where === "cloud"
    ? await cloudSeatNames()
    : NATIVE ? { ok: true, out: nativeRoom().list().map((one) => one.name).join("\n"), error: "" }
    : await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", "#W"], { timeout: 3000 });
  const seen = namesRead(asked);
  const used = new Set(seen.names);
  for (const seat of fleet.values()) if (seat.where === where) used.add(seat.name);
  return { used, blind: seen.blind, why: seen.why };
}

let accountCache = { at: 0, list: [] };
let claudeExe = "";

function theClaude() {
  if (claudeExe) return claudeExe;
  let found = "";
  try { found = chosenClaude().path; } catch { found = ""; }
  if (!found) return "claude";
  claudeExe = found.replace(/\\/g, "/");
  return claudeExe;
}

function forgetTheClaude() {
  claudeExe = "";
}

async function claudeAuthStatus(dir) {
  const r = await shr(theClaude(), ["auth", "status"], { timeout: 12000, env: { CLAUDE_CONFIG_DIR: dir || undefined } });
  return r.out || "";
}

const ACCOUNTS_FRESH = 30000;
const ACCOUNTS_BLIND_FRESH = 5000;

async function readAccounts() {
  const fresh = accountCache.list.some((held) => held.blind) ? ACCOUNTS_BLIND_FRESH : ACCOUNTS_FRESH;
  if (accountCache.list.length && Date.now() - accountCache.at < fresh) return accountCache.list;
  const list = (await accountsHeld(HOME, claudeAuthStatus)).filter((held) => NAME_OK.test(held.name));
  if (list.length) accountCache = { at: Date.now(), list };
  return list;
}

const AUTH_WINDOW = "hive-auth";

const OPEN_LOCAL_LOGIN = `tmux kill-session -t ${AUTH_WINDOW} 2>/dev/null
held=""
if [ -n "$1" ]; then held="CLAUDE_CONFIG_DIR=$1 "; fi
tmux new-session -d -s ${AUTH_WINDOW} -c "$HOME" "cd \\"$HOME\\" || exit 1; \${held}claude auth login; sleep 900"
screen=""
for i in $(seq 1 24); do
  sleep 2
  screen="$(tmux capture-pane -t ${AUTH_WINDOW} -p -J 2>/dev/null)
$(tmux capture-pane -t ${AUTH_WINDOW} -p -J -a 2>/dev/null)"
  case "$screen" in *https://*) break;; esac
done
printf '%s\n' "$screen"`;

const LOGIN_LINK = /https:\/\/\S*claude\S+/g;

async function loginCodeInTmux(code) {
  const send = `tmux send-keys -t ${AUTH_WINDOW} -l "$1"
sleep 2
tmux send-keys -t ${AUTH_WINDOW} Enter
sleep 10
tmux capture-pane -t ${AUTH_WINDOW} -p | tail -6`;
  const [shell, base] = inBash(send);
  const r = await shr(shell, [...base, "_", code], { timeout: 60000 });
  return r.out;
}

async function closeLoginWindow() {
  if (NATIVE) {
    nativeRoom().kill(AUTH_WINDOW);
    return;
  }
  await sh(TMUX, ["kill-session", "-t", AUTH_WINDOW], { timeout: 6000 });
}

async function nativeLogin(dir) {
  const held = nativeRoom();
  held.kill(AUTH_WINDOW);
  const opened = await held.open({ name: AUTH_WINDOW, program: "claude", args: ["auth", "login"], env: providerEnv("claude", dir), cwd: HOME, fallback: HOME });
  if (opened.error) return { error: opened.error };
  let screen = "";
  for (let round = 0; round < 24 && !/https:\/\//.test(screen); round++) {
    await seatSettles(2000);
    screen = held.capture(AUTH_WINDOW, 200);
  }
  const found = (screen.match(LOGIN_LINK) || []).pop();
  return { ok: true, url: found ? found.replace(/[),.]+$/, "") : "", screen: screen.split("\n").slice(-6).join("\n") };
}

async function nativeLoginCode(code) {
  const held = nativeRoom();
  if (!(await held.type(AUTH_WINDOW, code, { enter: true }))) return "";
  await seatSettles(10000);
  return held.capture(AUTH_WINDOW, 6);
}

const NAME_OK = /^[a-z0-9][a-z0-9-]{0,30}$/;

/* ---- providers: every agent this hive seats, its logins, and whether a chat may open on it */

const PROVIDERS_FRESH = 30000;
const PROVIDER_VERSION_FRESH = 600000;
let providersCache = { at: 0, list: null, pending: null };
const providerVersions = new Map();
const latestAgentVersion = createLatestVersions({ runBrew: async (args) => (await shr("brew", args, { timeout: 10000 })).out });
const agentsUpdating = new Set();
const AGENT_UPDATE_TIMEOUT = 300000;

function realPathOf(path) {
  try { return realpathSync(path); } catch { return path; }
}

function invalidateProviders() {
  providersCache = { at: 0, list: null, pending: providersCache.pending };
  accountCache = { at: 0, list: [] };
}

async function providerRun(bin, args, env = {}) {
  const r = await shr(bin, args, { timeout: 12000, env });
  return r.out || r.error || "";
}

async function providerBinaryPath(id, settings) {
  if (settings.binary) return existsSync(settings.binary) ? settings.binary : "";
  if (id === "claude") {
    const onMachine = claudeOnPath();
    if (onMachine) return onMachine;
    const found = theClaude();
    if (found !== "claude") return found;
  }
  return which(PROVIDERS[id].binary);
}

async function providerVersionOf(id, path) {
  if (!path) return "";
  const kept = providerVersions.get(path);
  if (kept && Date.now() - kept.at < PROVIDER_VERSION_FRESH) return kept.version;
  const r = await shr(path, ["--version"], { timeout: 12000 });
  const version = parseVersion(r.out || r.error);
  providerVersions.set(path, { at: Date.now(), version });
  return version;
}

async function providerAccountsOf(id) {
  const ledger = await readLedger(HIVE_HOME, id).catch(() => ({}));
  if (id === "claude") {
    const list = await readAccounts();
    return list.map((one) => ({ ...one, dir: accountDir(HIVE_HOME, "claude", one.name), spent: ledger[one.name] || null }));
  }
  return readProviderAccounts({ home: HOME, hiveHome: HIVE_HOME, provider: id, run: providerRun, ledger });
}

async function readProviders(force = false) {
  if (!force && providersCache.list && Date.now() - providersCache.at < PROVIDERS_FRESH) return providersCache.list;
  if (providersCache.pending) return providersCache.pending;
  providersCache.pending = (async () => {
    const { config } = await readConfig();
    const orders = {};
    const list = await Promise.all(PROVIDER_IDS.map(async (id) => {
      const spec = PROVIDERS[id];
      const settings = providerSettings(config, id);
      const path = await providerBinaryPath(id, settings);
      const plan = updatePlanOf({ id, path, real: path ? realPathOf(path) : "", binary: spec.binary });
      const [version, accounts, order, latest] = await Promise.all([
        providerVersionOf(id, path),
        path ? providerAccountsOf(id).catch(() => []) : Promise.resolve([]),
        accountOrder(HIVE_HOME, "", id).catch(() => []),
        path && settings.enabled && !plan.bundled ? latestAgentVersion(id, plan).catch(() => "") : Promise.resolve(""),
      ]);
      const seatsRun = id === "claude" && path && theClaude() !== path ? bundledClaudeVersion(builtinClaudePath()) : "";
      orders[id] = order;
      const readiness = providerReadiness({ enabled: settings.enabled, installed: !!path, accounts, label: settings.name });
      return {
        id,
        label: spec.label,
        name: settings.name,
        color: settings.color,
        enabled: settings.enabled,
        installed: !!path,
        path,
        version,
        latest,
        behind: behindOf(version, latest),
        canUpdate: !!plan.action,
        updateCommand: plan.command,
        bundled: plan.bundled,
        seatsRun,
        updating: agentsUpdating.has(id),
        home: providerHomeOf(HOME, id),
        homeEnv: spec.homeEnv,
        oneLogin: oneLoginOnly(id),
        accountsRoot: accountsRoot(HIVE_HOME, id),
        binary: settings.binary,
        args: settings.args,
        env: settings.env,
        login: spec.login.join(" "),
        accounts: accounts.map((one) => ({ ...one, order: order.indexOf(one.name) })),
        order,
        ready: readiness.ready,
        why: readiness.why,
        checkedAt: Date.now(),
      };
    }));
    providersCache = { at: Date.now(), list, pending: null };
    return list;
  })().catch((wrong) => { providersCache.pending = null; throw wrong; });
  return providersCache.pending;
}

async function updateAgent(id) {
  if (agentsUpdating.has(id)) return { error: `${PROVIDERS[id].label} is already updating` };
  const one = (await readProviders(true)).find((p) => p.id === id);
  if (!one?.path) return { error: `${PROVIDERS[id].label} is not installed on this machine` };
  const plan = updatePlanOf({ id, path: one.path, real: realPathOf(one.path), binary: PROVIDERS[id].binary });
  if (!plan.action) return { error: plan.command ? `the hive could not tell how ${one.label} was installed — run ${plan.command} in a terminal` : `${one.label} comes with the hive and updates with it` };
  agentsUpdating.add(id);
  try {
    const ran = await shr(plan.action.bin, plan.action.args, { timeout: AGENT_UPDATE_TIMEOUT, input: "" });
    providerVersions.delete(one.path);
    if (id === "claude") forgetTheClaude();
    invalidateProviders();
    const after = (await readProviders(true)).find((p) => p.id === id);
    const said = tailOfUpdate(ran.error || ran.out);
    const moved = !!after?.version && after.version !== one.version;
    if (!ran.ok && !moved) return { error: said || `${plan.command} did not finish` };
    return { ok: true, before: one.version, after: after?.version || "", moved, said };
  } finally {
    agentsUpdating.delete(id);
  }
}

async function providerReadyOrSay(agent) {
  const one = (await readProviders().catch(() => [])).find((p) => p.id === agent);
  if (one && !one.ready) throw new Error(one.why);
}

const AUTH_SESSION = (id) => `hive-auth-${id}`;

function readSignInScreen(raw) {
  const text = String(raw || "").split("\n").map((l) => l.trimEnd()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const url = (text.match(/https?:\/\/[^\s'"<>)]+/g) || []).map((one) => one.replace(/[),.]+$/, "")).pop() || "";
  const code = /(?:code|c[oó]digo)[^\n]*?\b([A-Z0-9]{4}-[A-Z0-9]{4,}|[A-Z0-9]{8,9})\b/i.exec(text)?.[1] || "";
  return { text, url, code };
}

async function providerScreen(id) {
  const session = AUTH_SESSION(id);
  if (NATIVE) {
    if (!nativeRoom().knows(session)) return { open: false, text: "", url: "" };
    return { open: true, ...readSignInScreen(nativeRoom().capture(session, 400)) };
  }
  const [main, alt] = await Promise.all([
    shr(TMUX, ["capture-pane", "-t", session, "-p", "-J"], { timeout: 6000 }),
    shr(TMUX, ["capture-pane", "-t", session, "-p", "-J", "-a"], { timeout: 6000 }),
  ]);
  if (!main.ok && !alt.ok) return { open: false, text: "", url: "" };
  return { open: true, ...readSignInScreen(`${main.out}\n${alt.out}`) };
}

const TMUX_KEYS = new Set(["Enter", "Escape", "Up", "Down", "Left", "Right", "Tab", "Space", "BSpace", "C-c"]);

async function runProvider(action, data) {
  const id = String(data.provider || "");
  if (!isProvider(id)) return { error: "no agent goes by that name" };
  const spec = PROVIDERS[id];
  const name = String(data.name || "").trim().toLowerCase();

  if (action === "check") return { ok: true, providers: await readProviders(true) };

  if (action === "update") return updateAgent(id);

  if (action === "toggle" || action === "settings") {
    const current = await readConfigFile(CONFIG_FILE);
    const held = isPlainObject(current.value?.providers) ? current.value.providers : {};
    const before = providerSettings({ providers: held }, id);
    const next = action === "toggle"
      ? { ...before, enabled: data.enabled !== false }
      : {
        ...before,
        name: typeof data.name === "string" ? data.name.trim() : before.name,
        color: typeof data.color === "string" ? data.color.trim() : before.color,
        binary: typeof data.binary === "string" ? data.binary.trim() : before.binary,
        args: Array.isArray(data.args) ? data.args : before.args,
        env: isPlainObject(data.env) ? data.env : before.env,
      };
    if (next.name === spec.label) next.name = "";
    if (next.color === spec.color) next.color = "";
    const written = await writeConfig({ providers: { ...held, [id]: next } });
    if (written.error) return { error: written.error };
    catalogCache.clear();
    return { ok: true };
  }

  if (action === "order") {
    const kept = await writeOrder(HIVE_HOME, Array.isArray(data.order) ? data.order : [], id);
    return { ok: true, order: kept };
  }

  if (action === "sign-in") {
    if (!NAME_OK.test(name)) return { error: "a name in lowercase, letters, numbers and dashes" };
    if (!(await hasTmux())) return { error: "this machine has no tmux, and the sign-in runs inside it" };
    let dir = "";
    if (name !== DEFAULT_ACCOUNT) {
      try { dir = shapeProviderAccount(HOME, id, accountDir(HIVE_HOME, id, name)); } catch (no) {
        return { error: String(no.message || no).slice(0, 160) };
      }
    }
    const env = providerEnv(id, dir);
    const session = AUTH_SESSION(id);
    if (NATIVE) {
      nativeRoom().kill(session);
      const opened = await nativeRoom().open({ name: session, program: spec.login[0], args: spec.login.slice(1), env, cwd: HOME, fallback: HOME });
      if (opened.error) return { error: opened.error };
    } else {
      const words = [...Object.entries(env).map(([k, v]) => `${k}=${quoted(v)}`), ...spec.login.map(quoted)];
      const command = `cd ${quoted(HOME)}; ${words.join(" ")}; printf '\\n[hive] the sign-in command ended\\n'; sleep 900`;
      await shr(TMUX, ["kill-session", "-t", session], { timeout: 6000 });
      const made = await shr(TMUX, ["new-session", "-d", "-s", session, "-x", "120", "-y", "36", "-c", HOME, command], { timeout: 10000 });
      if (!made.ok) return { error: made.error.split("\n").filter(Boolean).pop() || "tmux would not open the sign-in" };
    }
    await new Promise((done) => setTimeout(done, 2500));
    return { ok: true, name, dir, ...(await providerScreen(id)) };
  }

  if (action === "screen") return { ok: true, ...(await providerScreen(id)) };

  if (action === "type") {
    const session = AUTH_SESSION(id);
    const text = String(data.text || "");
    const key = String(data.key || "");
    if (text && /[\x00-\x08\x0b-\x1f]/.test(text)) return { error: "that text has a control character in it" };
    if (key && !TMUX_KEYS.has(key)) return { error: "that key is not one the sign-in takes" };
    if (NATIVE) {
      const pressed = key ? KEY_BYTES[key] : text ? KEY_BYTES.Enter : "";
      await nativeRoom().type(session, `${text}${pressed}`);
    } else {
      if (text) await shr(TMUX, ["send-keys", "-t", session, "-l", text], { timeout: 6000 });
      if (key) await shr(TMUX, ["send-keys", "-t", session, key], { timeout: 6000 });
      else if (text) await shr(TMUX, ["send-keys", "-t", session, "Enter"], { timeout: 6000 });
    }
    await new Promise((done) => setTimeout(done, 1500));
    return { ok: true, ...(await providerScreen(id)) };
  }

  if (action === "close") {
    if (NATIVE) nativeRoom().kill(AUTH_SESSION(id));
    else await shr(TMUX, ["kill-session", "-t", AUTH_SESSION(id)], { timeout: 6000 });
    return { ok: true };
  }

  if (action === "remove") {
    if (!NAME_OK.test(name) || name === DEFAULT_ACCOUNT) return { error: "the login everybody starts with cannot be removed here — sign out of it in the CLI" };
    const dir = accountDir(HIVE_HOME, id, name);
    if (!dir || !existsSync(dir)) return { error: `no ${spec.label} login named ${name}` };
    if (spec.logout.length) await shr(spec.logout[0], spec.logout.slice(1), { timeout: 20000, env: providerEnv(id, dir) }).catch(() => {});
    try { rmSync(dir, { recursive: true, force: true }); } catch (no) { return { error: String(no.message || no).slice(0, 160) }; }
    await noteBack(HIVE_HOME, name, id).catch(() => {});
    return { ok: true };
  }

  return { error: `unknown provider action ${action}` };
}

async function runAccount(action, data) {
  const name = String(data.name || "").trim().toLowerCase();
  if (action === "remove") {
    if (!NAME_OK.test(name)) return { error: "unknown account" };
    const dir = accountDirOf(accountsDir(HOME), name);
    if (!dir || !existsSync(dir)) return { error: `no account named ${name}` };
    await shr(theClaude(), ["auth", "logout"], { timeout: 20000, env: { CLAUDE_CONFIG_DIR: dir } });
    try { rmSync(dir, { recursive: true, force: true }); } catch (no) { return { error: String(no.message || no).slice(0, 160) }; }
    accountCache = { at: 0, list: [] };
    return { ok: true };
  }

  if (action === "sign-in") {
    if (!NAME_OK.test(name)) return { error: "a name in lowercase, letters, numbers and dashes" };
    if (!(await hasTmux())) return { error: "this machine has no tmux, and the login runs inside it" };
    let dir = "";
    if (name !== DEFAULT_ACCOUNT) {
      try { dir = shapeAccount(HOME, accountDirOf(accountsDir(HOME), name)); } catch (no) {
        return { error: String(no.message || no).slice(0, 160) };
      }
    }
    if (NATIVE) return nativeLogin(dir);
    const [shell, base] = inBash(OPEN_LOCAL_LOGIN);
    const r = await shr(shell, [...base, "_", dir], { timeout: 70000, cwd: HOME });
    const found = (r.out.match(/https:\/\/\S*claude\S+/g) || []).pop();
    return { ok: true, url: found ? found.replace(/[),.]+$/, "") : "", screen: r.out.split("\n").slice(-6).join("\n") };
  }

  if (action === "code") {
    const code = String(data.code || "").trim();
    if (!/^[A-Za-z0-9._#\-=]{6,500}$/.test(code)) return { error: "that code has a strange character — copy it from the page again" };
    const said = NATIVE ? await nativeLoginCode(code) : await loginCodeInTmux(code);
    if (!/Login successful|Logged in|Successfully/i.test(said)) {
      return { error: (said.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "the login was not confirmed").slice(0, 160) };
    }
    await closeLoginWindow();
    return { ok: true };
  }

  if (action === "close") {
    await closeLoginWindow();
    return { ok: true };
  }

  return { error: "unknown action" };
}

function namesOnTheBoard(exceptJob = "") {
  const taken = new Set();
  for (const job of spawning.values()) if (job.name && job.id !== exceptJob) taken.add(job.name);
  for (const seat of fleet.values()) taken.add(seat.name);
  for (const seat of cache.data?.sessions || []) taken.add(seat.name);
  return taken;
}

function freeNameNow(name, exceptJob = "") {
  return freeNameAmong(name, namesOnTheBoard(exceptJob));
}

async function freeName(name, where, exceptJob = "") {
  const { used, blind, why } = await namesInUse(where);
  if (blind) throw blindNamingError(where, why);
  for (const taken of namesOnTheBoard(exceptJob)) used.add(taken);
  return freeNameAmong(name, used);
}

const OTHER_AGENTS = new Set(["opencode", "codex", "kimi", "kiro", "cursor"]);
const AGENT_BINARY = { kiro: "kiro-cli", cursor: "cursor-agent" };

const OVER_THE_WIRE = 10000;

async function onTheServer(script, args = [], { timeout, input } = {}) {
  const server = await serverFor();
  if (!server) return { ok: false, out: "", error: cloudDoorTrouble() };
  const said = await server.client.post("/api/run", {
    script,
    args: args.map(String),
    ...(input === undefined ? {} : { stdin: Buffer.from(input).toString("base64") }),
    ...(timeout ? { timeoutMs: timeout } : {})
  }, timeout ? { timeoutMs: timeout + OVER_THE_WIRE } : undefined);
  if (!said.ok) return { ok: false, out: "", error: said.error || "the server would not run that" };
  const body = said.body || {};
  return {
    ok: !!body.ok,
    out: Buffer.from(String(body.out || ""), "base64").toString("utf8"),
    error: String(body.err || body.error || "").trim()
  };
}

async function bytesFromServer(script, args = [], { timeout } = {}) {
  const server = await serverFor();
  if (!server) return { ok: false, data: Buffer.alloc(0), error: cloudDoorTrouble() };
  const said = await server.client.post("/api/run", { script, args: args.map(String), ...(timeout ? { timeoutMs: timeout } : {}) },
    timeout ? { timeoutMs: timeout + OVER_THE_WIRE } : undefined);
  if (!said.ok) return { ok: false, data: Buffer.alloc(0), error: said.error || "the server would not run that" };
  const body = said.body || {};
  return { ok: !!body.ok, data: Buffer.from(String(body.out || ""), "base64"), error: String(body.err || "").trim() };
}

async function onCloudSeats(how, leaf, payload) {
  const server = await serverFor();
  if (!server) return { ok: false, error: cloudDoorTrouble() };
  const path = `/api/seats${leaf}`;
  const said = how === "GET" ? await server.client.get(path)
    : how === "DELETE" ? await server.client.del(path)
    : await server.client.post(path, payload || {});
  if (said.ok) return { ok: true, body: said.body || {} };
  return { ok: false, error: said.error || `the server would not answer for ${path}` };
}

const SEAT_SETTLE_MS = Number(process.env.HIVE_SEAT_SETTLE_MS || 3000);

const seatSettles = (ms) => new Promise((done) => setTimeout(done, ms));

async function seatInANativeWindow(asked) {
  const spec = seatArgv(asked);
  const seats = nativeRoom();
  const opened = await seats.open({ name: asked.name, program: spec.program, args: spec.args, env: { ...(await hubSeatEnv()), ...spec.env }, cwd: spec.cwd, fallback: HUB });
  if (opened.error) throw new Error(opened.error);
  await seatSettles(SEAT_SETTLE_MS);
  if (!seats.has(asked.name)) {
    const said = seats.capture(asked.name, 40).split("\n").filter(Boolean).slice(-3).join(" · ").slice(0, 300);
    throw new Error(`${asked.agent} closed the window as soon as it opened — the agent did not start${said ? `: ${said}` : ""}`);
  }
}

async function seatInATmuxWindow({ name, model, effort, prompt, images = [], account, sessionId, resumeId, cwd = HUB, structured, agent, compactAt }) {
  if (name === "hub") throw new Error(`"${name}" is a window this session already keeps — a seat with that name cannot be peeked, said to or killed. Pick another.`);
  if (agent !== "claude" && !NATIVE) {
    const binary = AGENT_BINARY[agent] || agent;
    const there = await shr(...inBash(`command -v ${quoted(binary)}`), { timeout: 8000 });
    if (!there.ok) throw new Error(`${binary} is not installed on this machine`);
  }
  let held = "";
  if (account) {
    held = accountDir(HIVE_HOME, agent, account);
    try { shapeProviderAccount(HOME, agent, held); } catch {}
  }
  let promptFile = "";
  const shots = structured ? images : [];
  const said = structured ? prompt : inlineImageMarks(prompt, images);
  if (said || shots.length) {
    promptFile = join(HUB, ".hive/prompts", `${name}.md`);
    await mkdir(dirname(promptFile), { recursive: true });
    await writeFile(promptFile, said);
    if (shots.length) await writeFile(missionImagesFile(promptFile), JSON.stringify(shots));
    else await unlink(missionImagesFile(promptFile)).catch(() => {});
  }
  const asked = {
    hub: cwd,
    name,
    agent,
    model,
    effort,
    sessionId,
    resumeId,
    structured,
    compactAt,
    promptFile,
    stateDir: HIVE_HOME,
    accountDir: held,
    remoteControl: process.env.HIVE_REMOTE_CONTROL !== "0",
    driver: structured ? (process.env.HIVE_DRIVER || join(ENGINE_DIR, driverFileFor(agent))) : ""
  };
  if (NATIVE) return seatInANativeWindow(asked);
  const command = seatCommand(asked);
  const fresh = await shr(TMUX, ["new-session", "-d", "-s", LOCAL_SESSION, "-c", HOME, "-n", "hub", "sleep 999999"], { timeout: 10000 });
  if (fresh.ok) await shr(TMUX, ["set-option", "-t", LOCAL_SESSION, "history-limit", "20000"], { timeout: 8000 });
  await shr(TMUX, ["set-option", "-t", LOCAL_SESSION, "default-size", "200x50"], { timeout: 8000 });
  /* the pod refuses a name it already runs; this side never did, and tmux opens the second
     window without a word. The two then answer no target at all — the seat cannot be closed,
     said to or read — so the refusal lives on both sides now. */
  const here = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", "#{window_name}"], { timeout: 8000 });
  if (here.ok && here.out.split("\n").map((line) => line.trim()).includes(name)) {
    throw new Error(`"${name}" is already a seat here — a second window with that name would share its mailbox`);
  }
  const made = await shr(TMUX, ["new-window", "-t", `${LOCAL_SESSION}:`, "-n", name, command], { timeout: 30000 });
  if (!made.ok) throw new Error(made.error.split("\n").filter(Boolean).pop() || "tmux would not open the window");
  await shr(TMUX, ["set-window-option", "-t", `${LOCAL_SESSION}:=${name}`, "window-size", "manual"], { timeout: 8000 });
  await shr(TMUX, ["resize-window", "-t", `${LOCAL_SESSION}:=${name}`, "-x", "200", "-y", "50"], { timeout: 8000 });
  await seatSettles(SEAT_SETTLE_MS);
  const windows = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", "#{window_name}"], { timeout: 8000 });
  if (windows.ok && !windows.out.split("\n").map((line) => line.trim()).includes(name)) {
    throw new Error(`${agent} closed the window as soon as it opened — the agent did not start`);
  }
}

async function newChat({ name, prompt, images = [], where = "local", model = "", repo = "", branch = "", account = "", structured = false, agent = "", effort = "" }) {
  assertSpawnArgs({ name, model, repo, branch, account, agent, effort });
  const eng = OTHER_AGENTS.has(agent) ? agent : "claude";
  if (where !== "cloud") await providerReadyOrSay(eng);
  if (model) chosenModels.set(name, model);
  const sessionId = randomUUID();
  const compactAt = await autocompactNow();
  if (where !== "cloud" && !(await hasTmux())) {
    throw new Error("this machine has no tmux, and a local worker lives inside it — create it on the pod (cloud) or install tmux");
  }
  if (where !== "cloud") {
    await hubEnvIntoTmux();
  }
  let seatCwd = HUB;
  let replaced = "";
  const side = where === "cloud" ? "cloud" : "local";
  newborn.set(seatKey(side, name), { name, where: side, kind: structured ? "structured" : "chat", agent: eng, model: model || "", account: account || "", at: Date.now() });
  try {
    if (where === "cloud") {
      const opened = await onCloudSeats("POST", "", {
        name,
        repo: repo || cloudRepoOfTheHub(HUB, HUB_FOLDER),
        branch,
        model,
        effort,
        prompt: prompt || "",
        images,
        sessionId,
        structured,
        agent: eng,
        compactAt,
        remoteControl: process.env.HIVE_REMOTE_CONTROL !== "0"
      });
      if (!opened.ok) throw new Error(opened.error.split("\n").slice(-2).join(" ").slice(0, 200) || "the server would not open the seat");
      seatCwd = String(opened.body.cwd || "");
      replaced = String(opened.body.replaced || "");
    } else {
      await seatInATmuxWindow({ name, model, effort, prompt, images, account, sessionId, structured, agent: eng, compactAt });
    }
  } catch (e) {
    newborn.delete(seatKey(side, name));
    throw e;
  } finally {
    cache.at = 0;
    podCache.at = 0;
  }
  rememberSeat({
    name,
    where: side,
    id: sessionId,
    kind: structured ? "structured" : "chat",
    agent: eng,
    cwd: seatCwd,
    model: model || "",
    account: account || "",
    at: Date.now()
  });
  if (!structured && eng === "claude") await bindSeatSession(name, where, sessionId, replaced);
}

async function bindSeatSession(name, where, id, replaced = "") {
  try {
    const leaving = where === "cloud" ? replaced : await seatSessionId(name, where);
    if (where !== "cloud") {
      await mkdir(join(HIVE_HOME, "sessions"), { recursive: true });
      await writeFile(join(HIVE_HOME, "sessions", `${name}.json`), JSON.stringify({ session_id: id }, null, 2));
    }
    const key = titleKey(name, where);
    const saved = titles.get(key) || {};
    const kept = saved.title || name;
    if (leaving && leaving !== id) await stampOnTranscript(leaving, kept, where);
    titles.set(key, { ...saved, stampAt: 0 });
  } catch {}
}

const saidLast = (text) => String(text || "").trim().split("\n").map((l) => l.trim()).filter((l) => l && !/^E\d{4} |memcache\.go|Unhandled Error/.test(l)).pop() || "the cluster did not answer";

async function twice(step) {
  const first = await step();
  if (first.ok) return first;
  await new Promise((r) => setTimeout(r, 2500));
  return step();
}

async function ensurePodServer(onStep = () => {}) {
  onStep("checking the box carries the engine");
  const seen = await twice(() => onTheServer('test -f "${HIVE_SERVER_DIR:?}/engine/driver.mjs" && echo ok', [], { timeout: 15000 }));
  if (!seen.ok) throw new Error(`that machine is not answering from here right now (${saidLast(seen.error)}) — check the link and try again`);
  if (seen.out.trim() !== "ok") throw new Error(`that machine is running an image from before the engine shipped inside it — restart it so it comes back on the current one`);
  await ensurePeerTools("cloud");
}

async function ensurePeerTools(where) {
  if (where === "cloud") {
    const found = (await onTheServer(PEER_MODULE_PROBE, [], { timeout: 15000 })).out;
    const peer = String(found || "").trim();
    if (!peer) return;
    const there = peerToolsCommand({ node: "node", peer });
    await onTheServer(there, [], { timeout: 20000 }).catch(() => {});
    return;
  }
  const here = peerToolsCommand({ node: process.execPath, peer: peerEntry({ here: join(SERVER_DIR, "engine") }) });
  await sh(...viaBash("bash", ["-c", here]), { timeout: 20000 }).catch(() => {});
}

const spawning = new Map();
let jobCount = 0;

function firstLine(text) {
  return pastHandles(text).split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || "";
}

function openJob(body) {
  const id = `n${++jobCount}`;
  const where = body.where === "cloud" ? "cloud" : "local";
  const sleeping = where === "cloud" && CLOUD && !!podCache.at && !podCache.up;
  const named = slug(body.name);
  const job = {
    id,
    name: freeNameNow(named || nameFromMission(body.prompt)),
    where,
    mission: firstLine(body.prompt),
    model: String(body.model || ""),
    repo: String(body.repo || ""),
    by: String(body.by || "").trim().toLowerCase(),
    step: sleeping ? "waking the pod" : "starting",
    /* freeNameNow already stepped aside from every name this app knows, but knowing is not
       the same as asking: a seat opened from another machine, or a rail one poll behind,
       still holds a name this side believes free. Until freeName asks the machine that will
       run the seat, the name is what the tile shows and never what it addresses. */
    settled: false,
    titleLater: !named && !String(body.title || "").trim(),
    error: "",
    at: Date.now()
  };
  spawning.set(id, job);
  cache.at = 0;
  return job;
}

async function pushMissionAsset(local) {
  if (!existsSync(local)) return "";
  const remote = `/workspace/hive/assets/${local.split("/").pop()}`;
  const put = await cloudReach.putFile(remote, await readFile(local));
  return put.error ? "" : remote;
}

async function pushMissionAssets(prompt, images = []) {
  const dir = join(HUB, ".hive/assets");
  const rx = new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/([\\w.-]+\\.\\w+)", "g");
  let out = prompt;
  for (const m of prompt.matchAll(rx)) {
    const remote = await pushMissionAsset(m[0]);
    if (remote) out = out.split(m[0]).join(remote);
  }
  const carried = [];
  for (const one of images) {
    const remote = one.startsWith("/workspace/") ? one : await pushMissionAsset(one);
    carried.push(remote || one);
  }
  return { prompt: out, images: carried };
}

async function seedStatus(name, title, where) {
  if (where === "cloud") return;
  const line = String(title || "").replace(/\s+/g, " ").trim().slice(0, 60);
  try {
    const dir = join(HUB, ".hive/status");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${name}.md`);
    if (!line) await unlink(file).catch(() => {});
    else await writeFile(file, `title: ${line}\n`, "utf8");
  } catch {}
}

const SEAT_ON_BOARD_TRIES = 8;
const SEAT_ON_BOARD_WAIT_MS = 1500;

async function seatOnTheBoard(name, where) {
  for (let tries = 0; tries < SEAT_ON_BOARD_TRIES; tries++) {
    cache.at = 0;
    const { sessions } = await collect();
    const found = sessions.find((x) => x.name === name && x.where === where);
    if (found) return found;
    await new Promise((r) => setTimeout(r, SEAT_ON_BOARD_WAIT_MS));
  }
  return null;
}

async function titleTheSeat(name, where, title) {
  const line = cleanTitle(title);
  if (!line || !isSeatName(name)) return false;
  const found = await seatOnTheBoard(name, where);
  if (!found) { console.log(`hive: seat ${name} never showed up on the board, so its title stays`); return false; }
  if (found.title && found.title !== name) { console.log(`hive: seat ${name} already reads "${found.title}" — the background name is not used`); return false; }
  if (found.structured) {
    const cmd = { type: "control", op: "setTitle", title: line };
    const said = where === "cloud"
      ? await podCmd(name, cmd).catch(() => null)
      : bridge ? await bridge.oneshot(join(HIVE_HOME, "sock", `${name}.sock`), cmd).catch(() => null) : null;
    cache.at = 0;
    return !!said?.ok;
  }
  if (where === "cloud") return false;
  const dir = join(HUB, ".hive/status");
  const file = join(dir, `${name}.md`);
  let had = "";
  try { had = await readFile(file, "utf8"); } catch {}
  if (/^title:\s*\S/im.test(had)) return false;
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, `title: ${line}\n${had}`, "utf8");
  } catch { return false; }
  cache.at = 0;
  return true;
}

/* the same single ask the seat always got at spawn, only no longer in the way:
   the seat is up and working while it runs, and its answer lands as the title
   the rail shows until the seat, or a hand, names it better. An answer that
   fell back to the mission's own first words says nothing the slug does not. */
const namingNow = new Set();

const NAME_TRIES = 2;

async function guessedTitle(prompt, agent) {
  for (let tries = 0; tries < NAME_TRIES; tries++) {
    const named = await nameSession(prompt, agent);
    if (named && named !== nameFromMission(prompt)) return named.split("-").join(" ");
  }
  return "";
}

function titleInTheBackground(name, where, prompt, agent) {
  guessedTitle(prompt, agent).then(async (guess) => {
    const title = guess || cleanTitle(firstLine(prompt));
    if (!guess) console.log(`hive: the model gave seat ${name} no name of its own — its first line holds the seat until it names itself`);
    const landed = await titleTheSeat(name, where, title);
    if (landed) console.log(`hive: seat ${name} now reads "${title}"`);
  }).catch((wrong) => console.log(`hive: naming seat ${name} in the background failed: ${String(wrong?.message || wrong)}`))
    .finally(() => { namingNow.delete(seatKey(where, name)); cache.at = 0; });
}

async function runJob(job, body) {
  try {
    let prompt = String(body.prompt || "").trim();
    const opened = await extensions.opening({ body, prompt });
    if (opened.changed) {
      prompt = opened.prompt;
      body = opened.body;
      if (opened.name && !slug(body.name)) job.name = freeNameNow(opened.name, job.id);
      if (String(body.title || "").trim()) job.titleLater = false;
      job.mission = firstLine(prompt);
      cache.at = 0;
    }
    if (job.where === "cloud") {
      const woke = await wakeAndWait((step) => { job.step = step; cache.at = 0; });
      if (!woke.ok) throw new Error(woke.error);
      if (woke.woke) {
        job.step = "starting";
        cache.at = 0;
        await fleetTick();
      }
    }
    if (!job.name) job.name = freeNameNow(nameFromMission(prompt) || `chat-${Date.now().toString().slice(-4)}`, job.id);
    job.name = await freeName(job.name, job.where, job.id);
    job.settled = true;
    cache.at = 0;
    if (job.titleLater && prompt) {
      namingNow.add(seatKey(job.where, job.name));
      titleInTheBackground(job.name, job.where, prompt, body.agent);
    }
    await seedStatus(job.name, body.title, job.where);
    const by = String(body.by || "").trim().toLowerCase();
    forgetOldKin(HIVE_HOME, job.name);
    const errand = String(body.errand || "").trim() || (by ? errandOf(readErrands(HIVE_HOME), by) : "");
    if (errand || by) noteErrand(HIVE_HOME, { seat: job.name, errand, asked: String(body.prompt || ""), at: Date.now(), race: body.race?.of || 0, by });
    cache.at = 0;
    if (job.where === "cloud" && body.structured) {
      /* `reachable` asks the cluster whether the cluster is there, which is not
         the question: what has to be reachable is the server, and ensurePodServer
         below proves that by running something inside it. Keep the cheap cluster
         check as the fast path, and let a box that opens its own door through —
         otherwise a machine with no kubeconfig is turned away from a server it
         is already talking to. */
      const reach = await powerSwitch("reachable");
      if (!reach.ok && !(await doorSaysUp())) throw new Error("the cluster is not answering from this machine right now — the link to AWS is flapping; try again in a moment");
      await ensurePodServer((step) => { job.step = step; cache.at = 0; });
      job.step = "starting";
      cache.at = 0;
    }
    let images = Array.isArray(body.images) ? body.images.filter((one) => typeof one === "string") : [];
    if (job.where === "cloud" && (prompt || images.length)) {
      const pushed = await pushMissionAssets(prompt, images);
      prompt = pushed.prompt;
      images = pushed.images;
    }
    await newChat({ ...body, name: job.name, prompt, images, where: job.where });
    job.step = "up";
    job.at = Date.now();
  } catch (e) {
    namingNow.delete(seatKey(job.where, job.name));
    job.step = "failed";
    job.error = String(e.message || e);
    job.at = Date.now();
    cache.at = 0;
  }
}

const BUNDLED_EXTRACTOR = join(HERE, "usage/extract-metrics.mjs");

function usageExtractor() {
  return [
    process.env.HIVE_USAGE_EXTRACTOR,
    readHiveEnvConfig().HIVE_USAGE_EXTRACTOR,
    BUNDLED_EXTRACTOR,
    REPO && join(REPO, "app/usage/extract-metrics.mjs"),
    join(HUB, REPO_FOLDER, "app/usage/extract-metrics.mjs")
  ].filter(Boolean).find((c) => existsSync(c)) || BUNDLED_EXTRACTOR;
}
let usageCache = { at: 0, data: null, running: false, error: "" };
let limitsCache = { at: 0, rows: null };

const PLAN_BEAT = 5 * 60 * 1000;
const PLAN_FLOOR = 15000;
const plans = createPlanMemory();

async function markSpentAccounts(rows, provider = "claude") {
  const ledger = await readLedger(HIVE_HOME, provider).catch(() => ({}));
  for (const one of dryAccounts(rows)) {
    if (ledger[one.account]?.until === one.until) continue;
    await noteSpent(HIVE_HOME, one.account, { until: one.until, why: "spent", says: one.says, provider }).catch(() => {});
  }
}

async function codexLimitsNow() {
  const codex = await signedProvider("codex");
  if (!codex) return [];
  const signed = codex.signed.map((one) => ({ name: one.name, env: providerEnv("codex", one.dir) }));
  const rows = await codexLimitsPerAccount({ accounts: signed, rpc: catalogRpc });
  await markSpentAccounts(rows, "codex").catch(() => {});
  return rows;
}

async function signedProvider(id) {
  const found = (await readProviders().catch(() => [])).find((one) => one.id === id);
  if (!found?.installed || !found.enabled) return null;
  const signed = found.accounts.filter((one) => one.loggedIn);
  return signed.length ? { ...found, signed } : null;
}

function kimiRootOf(dir) {
  return dir ? providerEnvDir("kimi", dir) : providerHomeOf(HOME, "kimi");
}

function kimiRegionOf(root) {
  try { return readFileSync(join(root, "region"), "utf8").trim(); } catch { return ""; }
}

async function kimiLimitsNow() {
  const kimi = await signedProvider("kimi");
  if (!kimi) return [];
  const accounts = kimi.signed.map((one) => {
    const root = kimiRootOf(one.dir);
    return { name: one.name, root, region: kimiRegionOf(root) };
  });
  const rows = await kimiLimitsPerAccount({ accounts, storeFor: (root) => kimiFileStore(root, { fs: { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, statSync, rmSync } }), waiting: (account) => plans.waiting("kimi", account) });
  await markSpentAccounts(rows, "kimi").catch(() => {});
  return rows;
}

async function kiroLimitsNow() {
  const kiro = await signedProvider("kiro");
  if (!kiro) return [];
  const accounts = kiro.signed.map((one) => ({ name: one.name, env: providerEnv("kiro", one.dir) }));
  const run = (args, env) => new Promise((resolve) => {
    execFile(kiro.path, args, { timeout: 30000, cwd: HIVE_HOME, env: { ...process.env, ...env } }, (err, stdout, stderr) => resolve(`${stdout || ""}\n${stderr || ""}${err && !stdout && !stderr ? err.message : ""}`));
  });
  const rows = await kiroLimitsPerAccount({ accounts, run });
  await markSpentAccounts(rows, "kiro").catch(() => {});
  return rows;
}

function namedProvider(row) {
  const spec = PROVIDERS[row.provider || "claude"];
  return { provider: "claude", ...row, label: spec?.label || row.provider || "", color: spec?.color || "" };
}

async function readClaudeLimits(force = false) {
  const held = force ? PLAN_FLOOR : PLAN_BEAT;
  if (limitsCache.rows && Date.now() - limitsCache.at < held) return limitsCache.rows;
  const [claude, codex, kimi, kiro] = await Promise.all([
    limitsPerAccount({ home: HIVE_HOME, claudeHome: join(HOME, ".claude"), waiting: (account) => plans.waiting("claude", account) }),
    codexLimitsNow().catch(() => []),
    kimiLimitsNow().catch(() => []),
    kiroLimitsNow().catch(() => []),
  ]);
  await markSpentAccounts(claude).catch(() => {});
  const rows = plans.remember([...claude, ...codex, ...kimi, ...kiro].map(namedProvider));
  limitsCache = { at: Date.now(), rows };
  return rows;
}

async function readUsage() {
  const fresh = usageCache.data && Date.now() - usageCache.at < 600000;
  if (fresh) return { ...usageCache.data, computing: false };
  const extractor = usageExtractor();
  if (!existsSync(extractor)) return { computing: false, error: `no extractor at ${extractor} — it lives in app/usage/ in this repo` };

  if (!usageCache.running) {
    usageCache.running = true;
    shr(process.execPath, [extractor], { timeout: 240000, cwd: HUB }).then((r) => {
      const data = r.out ? extractJson(r.out) : null;
      if (data) usageCache = { at: Date.now(), data, running: false, error: "" };
      else usageCache = { ...usageCache, running: false, error: r.error.split("\n").filter(Boolean).pop() || "the extractor returned nothing" };
    });
  }
  return { ...(usageCache.data || {}), computing: true, error: usageCache.error };
}

const HIST_SCAN = `
H="$HOME/.claude/projects"
R="$HOME/.claude/cloud-sessions/repo"
D=$(mktemp -d)
for dir in "$H"/*/; do
  case "$dir" in *"/-tmp/"|*"/-tmp-"*|*"/-private-tmp/"|*"/-private-tmp-"*) continue;; esac
  ls -t "$dir"*.jsonl 2>/dev/null
done | while IFS= read -r f; do
  head -c 262144 "$f" 2>/dev/null > "$D/headbig"
  head -n 40 "$D/headbig" > "$D/head"
  if ! grep -qE '"type":"file-history-snapshot"|"promptSource":"typed"|"entrypoint":"' "$D/headbig"; then
    head -c 8388608 "$f" 2>/dev/null | head -n 200 | cut -c1-8000 > "$D/head"
    grep -qE '"type":"file-history-snapshot"|"promptSource":"typed"|"entrypoint":"' "$D/head" || continue
  fi
  t=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null)
  printf '==F==%s\n==T==%s\n' "$f" "$t"
  if [ -d "$R" ]; then
    m="$R/\${f#"$H"/}"
    mt=$(stat -c %Y "$m" 2>/dev/null || stat -f %m "$m" 2>/dev/null)
    z=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f" 2>/dev/null)
    mz=$(stat -c %s "$m" 2>/dev/null || stat -f %z "$m" 2>/dev/null)
    if [ "$mt" = "$t" ] && [ "$mz" = "$z" ]; then printf '==S==ok\n'; else printf '==S==behind\n'; fi
  fi
  grep -o '"cwd":"[^"]*"' "$D/head" | head -1 | sed 's/^/==C==/'
  tail -c 262144 "$f" 2>/dev/null > "$D/tailbig"
  tail -n 40 "$D/tailbig" > "$D/tail"
  grep -q '"lastPrompt":"' "$D/tail" || tail -c 8388608 "$f" 2>/dev/null | tail -n 200 | cut -c1-8000 > "$D/tail"
  grep -o '"timestamp":"[^"]*"' "$D/tail" | tail -1 | sed 's/^/==W==/'
  cat "$D/tail" "$D/tailbig" | grep -o '"aiTitle":"[^"]*"' | tail -1 | sed 's/^/==A==/'
  cat "$D/head" "$D/headbig" "$D/tail" "$D/tailbig" | grep -o '"customTitle":"[^"]*"' | tail -1 | sed 's/^/==N==/'
  grep -o '"lastPrompt":"[^"]*"' "$D/tail" | tail -1 | cut -c1-600 | sed 's/^/==P==/'
done
SEATS="\${HIVE_SESSIONS:-$HOME/.hive/sessions}"
for j in "$SEATS"/*.json; do
  [ -f "$j" ] || continue
  n=$(basename "$j" .json)
  if grep -qE '"agent": *"(codex|kimi|kiro|cursor|opencode)"' "$j"; then
    e="\${SEATS%/sessions}/events/$n.ndjson"
    printf '==J==%s\n' "$n"
    head -c 8192 "$j"
    printf '\n==JT==%s\n' "$(stat -c %Y "$e" 2>/dev/null || stat -f %m "$e" 2>/dev/null)"
    printf '==JP=='
    grep -m1 '"type":"user"' "$e" 2>/dev/null | cut -c1-2000
    printf '\n==/J==\n'
    continue
  fi
  i=$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' "$j" | head -1)
  [ -n "$i" ] && printf '==M==%s==%s\n' "$n" "$i"
done
rm -rf "$D"
true`;

const ARCHIVE_FILE = join(HUB, ".hive/archive.json");
const ARCHIVE_INDEX_FILE = join(HUB, ".hive/archive-index.json");
const SESSION_MIRROR = join(HOME, ".claude/cloud-sessions/repo");
let histCache = { at: 0, data: null, running: null };
let histIndex = null;
let histWatch = null;

function parseHistory(raw, where, into) {
  const val = (s) => {
    const m = String(s || "").match(/^"[A-Za-z]+":"(.*?)"?$/);
    if (!m) return "";
    try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; }
  };
  const seatOf = new Map();
  for (const m of String(raw || "").matchAll(/==M==([^=\n]+)==([0-9a-f-]{36})/g)) seatOf.set(m[2], m[1]);
  for (const chunk of String(raw || "").split("==F==").slice(1)) {
    const lines = chunk.split("\n").map((l) => l.trim());
    const id = (lines[0] || "").split("/").pop()?.replace(".jsonl", "") || "";
    const grab = (p) => lines.find((l) => l.startsWith(p))?.slice(p.length) || "";
    const at = Date.parse(val(grab("==W=="))) || Number(grab("==T==")) * 1000 || 0;
    if (!/^[0-9a-f-]{8,}$/i.test(id) || !at) continue;
    const seat = seatOf.get(id) || "";
    const custom = val(grab("==N=="));
    const ai = val(grab("==A=="));
    const cwd = val(grab("==C=="));
    const prompt = val(grab("==P=="));
    const sync = grab("==S==");
    if (!custom && !ai && !prompt) continue;
    into.push({ id, where, at, cwd, prompt, title: custom || ai || prompt.slice(0, 90) || cwd.split("/").pop() || id.slice(0, 8), ...(ai ? { ai } : {}), ...(custom ? { custom } : {}), ...(seat ? { seat } : {}), ...(sync ? { sync } : {}) });
  }
}

function decorateHistory(data) {
  if (!data?.sessions) return data;
  const liveSeats = new Map();
  for (const seat of fleet.values()) if (seat.id) liveSeats.set(seat.id, seat);
  const sessions = data.sessions.map((row) => {
    const live = liveSeats.get(row.id);
    const seat = row.seat || (live?.where === row.where ? live.name : "");
    if (!seat) return row;
    const saved = titles.get(titleKey(seat, row.where));
    const title = (saved?.mine && saved.title) || row.custom || row.ai || saved?.title || row.title;
    return { ...row, seat, title };
  });
  return { ...data, sessions };
}

async function scanLocalHistory(sessions) {
  const seats = await readSeatRecords({ sessionsDir: join(HIVE_HOME, "sessions"), eventsDir: join(HIVE_HOME, "events"), where: "local" });
  const found = await scanTranscriptsApart({
    projectsDir: CLAUDE_PROJECTS,
    mirrorDir: existsSync(SESSION_MIRROR) ? SESSION_MIRROR : "",
    known: histIndex || {},
    onProgress: (reached) => { histWatch = reached; }
  });
  histIndex = found.index;
  for (const row of found.rows) {
    const seat = seats.seatOf.get(row.id);
    sessions.push({ ...row, where: "local", ...(seat ? { seat } : {}) });
  }
  for (const row of seats.rows) sessions.push(row);
}

async function runHistoryScan({ reachOut = true } = {}) {
  const local = [];
  const cloud = [];
  const jobs = [scanLocalHistory(local)];
  const asked = reachOut && (await podUp());
  if (asked) {
    jobs.push(onTheServer(`HIVE_SESSIONS="$HIVE_STATE_DIR/sessions"\n${HIST_SCAN}`, [], { timeout: 120000 })
      .then((r) => {
        if (!r.ok) throw new Error(r.error || "the server would not read its archives");
        parseHistory(r.out, "cloud", cloud);
        parseHiveSessions(r.out, "cloud", cloud);
      }));
  }
  const ran = await Promise.allSettled(jobs);
  const kept = histCache.data?.sessions || [];
  const sessions = [
    ...(ran[0].status === "fulfilled" ? local : kept.filter((row) => row.where === "local")),
    ...(asked && ran[1].status === "fulfilled" ? cloud : kept.filter((row) => row.where === "cloud"))
  ];
  histWatch = null;
  return { sessions: oneRowPerSession(sessions) };
}

async function readArchiveFile() {
  try {
    const saved = JSON.parse(await readFile(ARCHIVE_FILE, "utf8"));
    return Array.isArray(saved?.sessions) ? saved : null;
  } catch { return null; }
}

async function readArchiveIndex() {
  try {
    const saved = JSON.parse(await readFile(ARCHIVE_INDEX_FILE, "utf8"));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

async function keepArchive(data) {
  try {
    await mkdir(dirname(ARCHIVE_FILE), { recursive: true });
    await writeFile(ARCHIVE_FILE, JSON.stringify(data));
    if (histIndex) await writeFile(ARCHIVE_INDEX_FILE, JSON.stringify(histIndex));
  } catch {}
}

/* the panel is served the snapshot first and told a scan is running, which is the
   right trade when it opens: the rows are mostly still true and the watch says
   what is being caught up. It is the wrong trade for the sync button, whose whole
   promise is that the list was rebuilt — asking fresh waits for the real scan. */
const POD_HIST_FRESH = 600000;
let podHistAt = 0;

async function scanHistory({ fresh = false } = {}) {
  if (!fresh && histCache.data && Date.now() - histCache.at < 60000) return decorateHistory(histCache.data);
  if (!histCache.data) histCache.data = await readArchiveFile();
  if (!histIndex) histIndex = await readArchiveIndex();
  const showingOld = !fresh && !!histCache.data;
  const reachOut = fresh || !histCache.data || Date.now() - podHistAt >= POD_HIST_FRESH;
  if (!histCache.running) {
    histCache.running = runHistoryScan({ reachOut }).then(async (data) => {
      if (reachOut) podHistAt = Date.now();
      histCache = { at: Date.now(), data, running: null };
      await keepArchive(data);
      return data;
    }).catch(() => {
      histCache.running = null;
      return histCache.data || { sessions: [] };
    });
  }
  if (showingOld) return { ...decorateHistory(histCache.data), stale: "scanning", ...(histWatch ? { watch: histWatch } : {}) };
  return decorateHistory(await histCache.running);
}

async function searchArchive(asked) {
  const want = wordsOf(asked);
  if (!want.length) return [];
  if (!histIndex) histIndex = await readArchiveIndex();
  const found = [];
  for (const entry of Object.values(histIndex)) {
    if (!entry?.row || !entry.says?.length) continue;
    const said = entry.says;
    const plain = said.map((one) => foldText(one));
    if (!want.every((word) => plain.some((one) => one.includes(word)))) continue;
    const at = plain.findIndex((one) => one.includes(want[0]));
    found.push({ id: entry.row.id, hit: said[at < 0 ? 0 : at].slice(0, 200) });
    if (found.length >= 200) break;
  }
  return found;
}

function historyStamp(id, where, fields = {}, whenNew = {}) {
  histCache.at = 0;
  const rows = histCache.data?.sessions;
  if (!id || !rows) return;
  const at = rows.findIndex((one) => one.id === id);
  const known = at < 0 ? null : rows[at];
  const row = { prompt: "", ...whenNew, ...(known || {}), ...fields, id, where, at: Date.now() };
  if (!known || known.where !== where) delete row.sync;
  if (at < 0) rows.push(row); else rows[at] = row;
  rows.sort((a, b) => b.at - a.at);
  keepArchive(histCache.data).catch(() => {});
}

function historyClosedSeat(where, name) {
  const seat = fleet.get(seatKey(where, name));
  if (!seat?.id) {
    histCache.at = 0;
    return;
  }
  historyStamp(seat.id, where, {
    seat: name,
    ...(seat.cwd ? { cwd: String(seat.cwd) } : {}),
    ...(seat.agent && seat.agent !== "claude" ? { agent: String(seat.agent) } : {})
  }, { title: name, cwd: String(seat.cwd || "") });
}

async function openShell({ where, name }) {
  const w = where === "cloud" ? "cloud" : "local";
  const wanted = slug(name) || "terminal";
  if (!isSeatName(wanted)) throw new Error("that name has characters tmux cannot address");
  const seat = await freeName(wanted, w);
  if (w === "cloud") {
    if (!CLOUD) throw new Error(NO_ADDRESS);
    const woke = await wakeAndWait();
    if (!woke.ok) throw new Error(woke.error);
    const script = `export HOME=/workspace/home PATH=/workspace/npm-global/bin:$PATH
HIVE_RC=/workspace/hive/shell
[ -d /workspace/hive ] || HIVE_RC=$HOME/.hive/shell
tmux has-session -t hive 2>/dev/null || tmux new-session -d -s hive -n hub "sleep 999999"
tmux new-window -d -t hive -n ${quoted(seat)} "cd /workspace && if [ -f $HIVE_RC/rc.bash ]; then exec bash --rcfile $HIVE_RC/rc.bash -i; else exec bash -l; fi"`;
    const r = await onTheServer(script, [], { timeout: 30000 });
    if (!r.ok) throw new Error(r.error.slice(0, 200) || "tmux on the pod refused");
  } else {
    if (!(await hasTmux())) throw new Error("this machine has no tmux — open it on the pod instead");
    if (NATIVE) {
      const opened = await nativeRoom().open({ name: seat, kind: "shell", cwd: HUB, fallback: HUB, env: await hubSeatEnv() });
      if (opened.error) throw new Error(opened.error);
    } else {
      await hubEnvIntoTmux();
      writeHiveShellRc(HIVE_HOME);
      const script = `tmux has-session -t ${LOCAL_SESSION} 2>/dev/null || tmux new-session -d -s ${LOCAL_SESSION} -c "$HOME" -n hub "sleep 999999"
tmux new-window -d -t ${LOCAL_SESSION} -n ${quoted(seat)} "cd ${HUB ? quoted(HUB) : '\\\"$HOME\\\"'} && ${hiveShellExec(process.env.SHELL || "bash", HIVE_HOME)}"
tmux set-window-option -t ${quoted(`${LOCAL_SESSION}:=${seat}`)} remain-on-exit on`;
      const r = await shr(...viaBash("bash", ["-c", script]), { timeout: 15000 });
      if (!r.ok) throw new Error(r.error.slice(0, 200) || "tmux refused");
    }
  }
  titles.set(`${w}:${seat}`, { title: "Terminal", mission: "", settled: true, tries: 0 });
  saveTitles();
  cache.at = 0;
  podCache.at = 0;
  rememberSeat({
    name: seat,
    where: w,
    kind: "shell",
    cwd: w === "cloud" ? "/workspace" : HUB,
    at: Date.now()
  });
  return { ok: true, name: seat, where: w };
}

const trails = new Map();
const CLAUDE_PROJECTS = join(HOME, ".claude/projects");
const POD_PROJECTS = "/workspace/home/.claude/projects";
const projectSlug = (path) => String(path).replace(/[/.]/g, "-");

function localTwin(podCwd) {
  const p = String(podCwd || "");
  const under = p.match(/^\/workspace\/repos(?:\/(.*))?$/);
  if (under) {
    const rest = under[1] || "";
    for (const candidate of [rest, rest.replace(new RegExp(`^${HUB_FOLDER}(\\/|$)`), "")]) {
      const guess = candidate ? join(HUB, candidate) : HUB;
      if (existsSync(guess)) return { cwd: guess, exact: true };
    }
  }
  return { cwd: HUB, exact: false };
}

function otherAgentAsked(agent) {
  const one = String(agent || "").trim().toLowerCase();
  if (!one || one === "claude") return "";
  if (!OTHER_AGENTS.has(one)) throw new Error(`${one} is not an agent this hive runs`);
  return one;
}

async function bringLocal({ id, cwd, title, structured = false, agent = "" }) {
  const other = otherAgentAsked(agent);
  if (other) throw new Error(`a ${other} conversation lives in ${other}'s own store on the server, and nothing here can copy that — revive it on the server instead`);
  if (!/^[0-9a-f-]{8,64}$/i.test(String(id || ""))) throw new Error("bad session id");
  if (!CLOUD) throw new Error(NO_ADDRESS);
  if (!(await hasTmux())) throw new Error("this machine has no tmux — there is nowhere local to put it");
  const woke = await wakeAndWait();
  if (!woke.ok) throw new Error(woke.error);

  const found = await onTheServer('ls "$HOME/.claude/projects"/*/"$1".jsonl 2>/dev/null | head -1', [id], { timeout: 25000 });
  const src = found.out.trim();
  if (!src) throw new Error("the pod no longer has that transcript");

  const twin = localTwin(cwd);
  const dir = join(CLAUDE_PROJECTS, projectSlug(twin.cwd));
  await mkdir(dir, { recursive: true });
  const dest = join(dir, `${id}.jsonl`);

  const copy = await cloudReach.getFile(src);
  if (copy.error) {
    try { await unlink(dest); } catch {}
    throw new Error(copy.error.slice(0, 200) || "could not read the transcript off the server");
  }
  await writeFile(dest, copy.body);
  let bytes = 0;
  try { bytes = statSync(dest).size; } catch {}
  if (bytes < 2) {
    try { await unlink(dest); } catch {}
    throw new Error("the transcript came down empty");
  }

  historyStamp(id, "local", { cwd: twin.cwd }, { title: String(title || "") });

  const revived = await reviveSession({ id, where: "local", cwd: twin.cwd, title, structured });
  return { ...revived, cwd: twin.cwd, exact: twin.exact, bytes };
}

async function reviveSession({ id, where, cwd, title, structured = false, agent = "", model = "" }) {
  const other = otherAgentAsked(agent);
  if (!(other ? OWN_SESSION_ID : /^[0-9a-f-]{8,64}$/i).test(String(id || ""))) throw new Error("bad session id");
  const wanted = other ? String(model || "") : "";
  if (wanted) assertSpawnArgs({ model: wanted });
  const dir = String(cwd || "");
  if (dir && !/^[\w./~-]+$/.test(dir) && !(NATIVE && WINDOWS_FOLDER.test(dir))) throw new Error("bad cwd");
  const w = where === "cloud" ? "cloud" : "local";
  const name = await freeName(slug(title).slice(0, 40) || `revive-${String(id).slice(0, 8)}`, w);
  if (cleanTitle(title)) renameSeat(name, w, title);
  const fallback = w === "cloud" ? POD_HUB : HUB;
  const goDir = `cd ${dir || fallback} 2>/dev/null || cd ${fallback}`;
  const compactAt = await autocompactNow();
  const compactFlag = compactAt ? ` --autocompact ${compactAt}` : "";
  const inner = structured
    ? ""
    : `${goDir}; CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 FORCE_HYPERLINK=1 claude --resume ${id} --dangerously-skip-permissions${compactFlag}`;
  if (w === "cloud") {
    if (CLOUD) {
      const woke = await wakeAndWait();
      if (!woke.ok) throw new Error(woke.error);
    }
    const opened = await onCloudSeats("POST", "", { name, cwd: dir.startsWith(`${CLOUD_ROOT}/`) ? dir : "", resumeId: id, structured, compactAt, agent: other || "claude", model: wanted });
    if (!opened.ok) throw new Error(opened.error.slice(0, 200));
  } else {
    if (!(await hasTmux())) throw new Error("this machine has no tmux — revive it on the pod instead");
    await hubEnvIntoTmux();
    const winCmd = other
      ? seatCommand({
        hub: dir || fallback,
        fallback,
        name,
        agent: other,
        model: wanted,
        structured,
        resumeId: id,
        compactAt,
        driver: structured ? join(ENGINE_DIR, driverFileFor(other)) : "",
        stateDir: HIVE_HOME,
        remoteControl: false,
        side: "local"
      }).replace(/(["\\$`])/g, "\\$1")
      : structured
        ? `${goDir}; HIVE_STATE_DIR=${HIVE_HOME} node ${join(ENGINE_DIR, "driver.mjs")} --name ${name} --cwd \\"\\$PWD\\"${compactFlag}`
        : inner;
    await mkdir(join(HIVE_HOME, "sessions"), { recursive: true });
    await writeFile(join(HIVE_HOME, "sessions", `${name}.json`), JSON.stringify({ session_id: id, ...(other ? { agent: other, cwd: dir || fallback, ...(wanted ? { model: wanted, model_id: wanted } : {}) } : {}) }, null, 2));
    if (structured) {
      try { await unlink(join(HIVE_HOME, "events", `${name}.ndjson`)); } catch {}
    }
    if (NATIVE) {
      const there = dir && existsSync(dir) ? dir : fallback;
      const compact = compactAt ? ["--autocompact", compactAt] : [];
      const spec = other
        ? seatArgv({ hub: there, fallback, name, agent: other, model: wanted, structured, resumeId: id, compactAt, driver: structured ? join(ENGINE_DIR, driverFileFor(other)) : "", stateDir: HIVE_HOME, remoteControl: false, side: "local" })
        : structured
          ? { program: "node", args: [join(ENGINE_DIR, "driver.mjs"), "--name", name, "--cwd", there, ...compact], env: { HIVE_STATE_DIR: HIVE_HOME } }
          : { program: "claude", args: ["--resume", id, "--dangerously-skip-permissions", ...compact], env: { CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN: "1", FORCE_HYPERLINK: "1" } };
      const opened = await nativeRoom().open({ name, program: spec.program, args: spec.args, env: { ...(await hubSeatEnv()), ...spec.env }, cwd: there, fallback });
      if (opened.error) throw new Error(opened.error);
    } else {
      const script = `tmux has-session -t ${LOCAL_SESSION} 2>/dev/null || tmux new-session -d -s ${LOCAL_SESSION} -c "$HOME" -n hub "sleep 999999"
tmux new-window -t ${LOCAL_SESSION} -n ${name} "${winCmd}"`;
      const r = await shr(...viaBash("bash", ["-c", script]), { timeout: 15000 });
      if (!r.ok) throw new Error(r.error.slice(0, 200) || "tmux refused");
    }
  }
  cache.at = 0;
  podCache.at = 0;
  for (const [key, seat] of fleet) if (seat.id === id) fleet.delete(key);
  rememberSeat({
    name,
    where: w,
    id,
    kind: structured ? "structured" : "chat",
    agent: other || "claude",
    cwd: dir || fallback,
    model: wanted,
    account: "",
    at: Date.now()
  });
  return { ok: true, name, where: w };
}

const PREVIEW_TAIL_BYTES = 524288;
const TRAIL_TAIL_BYTES = 2 * 1024 * 1024;
const trailsBeforeDirs = new Map();

function dirsOfSeat(seat, structuredInfo, agent) {
  const said = structuredInfo?.dirs || [];
  if (said.length || agent !== "claude" || !seat?.id) return said;
  if (trailsBeforeDirs.has(seat.id)) return trailsBeforeDirs.get(seat.id);
  const transcript = localTranscriptOf(seat.id);
  if (!transcript) return [];
  let dirs = [];
  try { dirs = trailCwds(tailOfFile(transcript, TRAIL_TAIL_BYTES)); } catch {}
  if (trailsBeforeDirs.size >= TRAILS_KEPT) trailsBeforeDirs.delete(trailsBeforeDirs.keys().next().value);
  trailsBeforeDirs.set(seat.id, dirs);
  return dirs;
}

function localTranscriptOf(id) {
  try {
    for (const dir of readdirSync(CLAUDE_PROJECTS)) {
      const candidate = join(CLAUDE_PROJECTS, dir, `${id}.jsonl`);
      if (existsSync(candidate)) return candidate;
    }
  } catch {}
  return "";
}

function tailOfFile(path, bytes) {
  const size = statSync(path).size;
  const want = Math.min(bytes, size);
  if (!want) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(want);
    readBytesSync(fd, buf, 0, want, size - want);
    return buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function transcriptMessages(raw, cap = 40) {
  const out = [];
  for (const line of String(raw || "").split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if ((entry.type !== "user" && entry.type !== "assistant") || entry.isMeta) continue;
    const content = entry.message?.content;
    let text = typeof content === "string"
      ? content
      : Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";
    text = String(text || "").trim();
    if (!text || (entry.type === "user" && text.startsWith("<"))) continue;
    const before = out[out.length - 1];
    if (before && before.role === entry.type && before.text === text.slice(0, 4000)) continue;
    out.push({ role: entry.type, text: text.slice(0, 4000), at: entry.timestamp || "" });
  }
  return out.slice(-cap);
}

const HIVE_SEAT_OF_SESSION = `for j in "$HIVE_STATE_DIR"/sessions/*.json; do
  [ -f "$j" ] || continue
  grep -qF "\\"$1\\"" "$j" || continue
  n=$(basename "$j" .json)
  e="$HIVE_STATE_DIR/events/$n.ndjson"
  [ -f "$e" ] && tail -c ${PREVIEW_TAIL_BYTES} "$e"
  break
done`;

async function previewOwnSession(id, where) {
  if (where === "cloud") {
    if (!CLOUD || !(await podUp())) throw new Error("the server is down, and that conversation only lives there");
    const r = await onTheServer(HIVE_SEAT_OF_SESSION, [id], { timeout: 30000 });
    if (!r.out) throw new Error("the server no longer has that conversation");
    return { ok: true, messages: hiveEventMessages(r.out) };
  }
  let names = [];
  try { names = readdirSync(join(HIVE_HOME, "sessions")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)); } catch {}
  for (const name of names) {
    let meta;
    try { meta = JSON.parse(readFileSync(join(HIVE_HOME, "sessions", `${name}.json`), "utf8")); } catch { continue; }
    if (String(meta?.session_id || "") !== id) continue;
    const events = join(HIVE_HOME, "events", `${name}.ndjson`);
    if (!existsSync(events)) throw new Error("this machine no longer has that conversation");
    return { ok: true, messages: hiveEventMessages(tailOfFile(events, PREVIEW_TAIL_BYTES)) };
  }
  throw new Error("this machine no longer has that conversation");
}

async function previewSession({ id, where, agent = "" }) {
  const other = otherAgentAsked(agent);
  if (other) {
    if (!OWN_SESSION_ID.test(String(id || ""))) throw new Error("bad session id");
    return previewOwnSession(String(id), where);
  }
  if (!/^[0-9a-f-]{8,64}$/i.test(String(id || ""))) throw new Error("bad session id");
  const mine = localTranscriptOf(id);
  if (mine) return { ok: true, messages: transcriptMessages(tailOfFile(mine, PREVIEW_TAIL_BYTES)) };
  if (where !== "cloud") throw new Error("this machine no longer has that transcript");
  if (!CLOUD || !(await podUp())) throw new Error("the server is down and this transcript has not synced down yet");
  const r = await onTheServer(`f=$(ls "$HOME/.claude/projects"/*/"$1".jsonl 2>/dev/null | head -1); [ -n "$f" ] && tail -c ${PREVIEW_TAIL_BYTES} "$f"`, [id], { timeout: 30000 });
  if (!r.out) throw new Error("the pod no longer has that transcript");
  return { ok: true, messages: transcriptMessages(r.out) };
}

const SYNC_CONFIG = join(HOME, ".claude/cloud-sessions.json");
const SYNC_STATE = join(HOME, ".claude/cloud-sessions");
const syncEngine = () => join(HUB, "scripts/cloud-sessions/cloud-sessions.mjs");

const POD_SYNC_PROBE = 'node -e \'const fs=require("fs");const read=(f)=>{try{return fs.readFileSync(f,"utf8")}catch(e){return ""}};const home=process.env.HOME;' +
  'let c={};try{c=JSON.parse(read(home+"/.claude/cloud-sessions.json"))}catch(e){}' +
  'console.log(JSON.stringify({repo:(c.git&&c.git.repo)||"",lastSync:Number(read(home+"/.claude/cloud-sessions/last-sync").trim())||0}))\'';

function localSyncState() {
  const state = { repo: "", lastSync: 0 };
  try { state.repo = String(JSON.parse(readFileSync(SYNC_CONFIG, "utf8")).git?.repo || ""); } catch {}
  try { state.lastSync = Number(readFileSync(join(SYNC_STATE, "last-sync"), "utf8").trim()) || 0; } catch {}
  return state;
}

let syncSuggestion = "";

async function syncStatus() {
  const local = localSyncState();
  let cloud = null;
  if (await podUp()) {
    const r = await onTheServer(POD_SYNC_PROBE, [], { timeout: 20000 });
    const opens = r.out.indexOf("{");
    try { cloud = JSON.parse(r.out.slice(opens)); } catch { cloud = { repo: "", lastSync: 0 }; }
  }
  let suggestion = "";
  if (!local.repo) {
    const login = (await sh("gh", ["api", "user", "--jq", ".login"], { timeout: 8000 })).trim();
    if (/^[\w-]+$/.test(login)) suggestion = `https://github.com/${login}/claude-sessions.git`;
  }
  syncSuggestion = suggestion;
  return { local, cloud, engine: existsSync(syncEngine()), suggestion };
}

async function ensurePrivateRepo(repoUrl) {
  const m = String(repoUrl || "").trim().match(GITHUB_REPO_URL);
  if (!m) throw new Error("that is not a GitHub repo url");
  const slug = `${m[1]}/${m[2]}`;
  const seen = await shr("gh", ["repo", "view", slug, "--json", "visibility", "--jq", ".visibility"], { timeout: 15000 });
  if (seen.ok) {
    if (seen.out.trim().toUpperCase() !== "PRIVATE") {
      throw new Error(`${slug} is not private — a transcript carries everything typed and every file read, so it only goes to a private repo`);
    }
    return slug;
  }
  const made = await shr("gh", ["repo", "create", slug, "--private"], { timeout: 20000 });
  if (!made.ok) throw new Error(`could not create ${slug}: ${made.error.slice(0, 160) || "gh refused"}`);
  return slug;
}

async function configureSessionSync({ repo }) {
  const engine = syncEngine();
  if (!existsSync(engine)) throw new Error(`${HUB_FOLDER} has no scripts/cloud-sessions/cloud-sessions.mjs — pull the hub first`);
  const slug = await ensurePrivateRepo(repo);
  const url = `https://github.com/${slug}.git`;
  const current = localSyncState();
  if (current.repo && current.repo !== url) rmSync(join(SYNC_STATE, "repo"), { recursive: true, force: true });
  const mac = await shr(...viaBash("node", [engine, "setup", url]), { timeout: 600000 });
  if (!mac.ok) throw new Error(`setup on this machine failed: ${(mac.error || mac.out).slice(-200)}`);
  let cloud = `server asleep — the doctor will flag it, or ${askYourHost("pod-cloud-sessions.sh", "set the sync up there")}`;
  const cloudScript = deploymentScript("pod-cloud-sessions.sh");
  if (CLOUD && cloudScript && (await podUp())) {
    const script = join(REPO, cloudScript);
    const r = await shr(...viaBash("bash", [script, DEV, url]), { timeout: 600000, env: { HIVE_HUB: HUB } });
    cloud = r.ok ? "configured" : `pod setup failed: ${(r.error || r.out).slice(-200)}`;
  }
  return { ok: true, repo: url, cloud };
}

async function runSessionSync() {
  const engine = syncEngine();
  if (!existsSync(engine)) throw new Error(`${HUB_FOLDER} has no scripts/cloud-sessions/cloud-sessions.mjs — pull the hub first`);
  if (!localSyncState().repo) throw new Error("the sync is not set up yet — point it at a private repo first");
  /* the archive's clock is expired even when the sync fails: whoever pressed the
     button is asking to see the list again, and that ask is good regardless of
     whether the transcripts made it to the repo. Leaving it inside the happy path
     meant a failed sync also left the panel showing yesterday. */
  try {
    const mac = await shr(...viaBash("node", [engine, "sync"]), { timeout: 300000 });
    if (!mac.ok) throw new Error(`sync on this machine failed: ${(mac.error || mac.out).slice(-200)}`);
    let cloud = "server asleep";
    if (CLOUD && (await podUp())) {
      const r = await onTheServer('node "$HIVE_STATE_DIR/cloud-sessions.mjs" sync', [], { timeout: 300000 });
      cloud = r.ok ? "synced" : `pod sync failed: ${(r.error || r.out).slice(-200)}`;
    }
    return { ok: true, cloud };
  } finally {
    histCache.at = 0;
  }
}

const FLEET_FILE = process.env.HIVE_FLEET_FILE || join(HUB, ".hive/fleet.json");
const fleet = new Map();
const newborn = new Map();

function seatRecord(where, name) {
  return fleet.get(seatKey(where, name)) || newborn.get(seatKey(where, name));
}

async function loadFleet() {
  let saved;
  try {
    saved = JSON.parse(await readFile(FLEET_FILE, "utf8"));
  } catch {
    return;
  }
  const onDisk = new Map();
  for (const seat of saved?.seats || []) {
    if (!seat?.name || (seat.where !== "local" && seat.where !== "cloud")) continue;
    onDisk.set(seatKey(seat.where, seat.name), seat);
    if (seat.model) chosenModels.set(seat.name, seat.model);
  }
  fleet.clear();
  for (const [key, seat] of onDisk) fleet.set(key, seat);
}

const ARCHIVED_SEATS_FILE = process.env.HIVE_ARCHIVED_SEATS_FILE || join(HUB, ".hive/archived-seats.json");
const archivedSeats = new Map();

async function loadArchivedSeats() {
  let saved;
  try {
    saved = JSON.parse(await readFile(ARCHIVED_SEATS_FILE, "utf8"));
  } catch {
    return;
  }
  archivedSeats.clear();
  for (const seat of saved?.seats || []) {
    if (!seat?.name || (seat.where !== "local" && seat.where !== "cloud")) continue;
    archivedSeats.set(seatKey(seat.where, seat.name), seat);
  }
}

let archiveWrite = Promise.resolve();

function saveArchivedSeats() {
  if (!OWNS_FLEET) return;
  archiveWrite = archiveWrite.then(async () => {
    try {
      await mkdir(dirname(ARCHIVED_SEATS_FILE), { recursive: true });
      await writeFile(ARCHIVED_SEATS_FILE, JSON.stringify({ seats: archiveOrder([...archivedSeats.values()]) }, null, 2));
    } catch {}
  });
}

const closingSeats = new Set();

/* the DELETE used to be fire-and-forget: a pod that refused, timed out or was down
   still counted as closed, the tile came back on the next wall, and the fleet tick
   could even restore the seat mid-close. The answer travels back now, and the seat
   being closed is fenced off from the tick until the fleet forgets it. */
async function killSeatWindow(name, where) {
  const side = where === "cloud" ? "cloud" : "local";
  closingSeats.add(seatKey(side, name));
  if (where === "cloud") {
    const said = await onCloudSeats("DELETE", `/${encodeURIComponent(name)}`);
    const why = !said.ok ? (said.error || `the server would not close ${name}`)
      : said.body?.ok === false ? String(said.body.error || `the server could not close ${name}`) : "";
    if (why) {
      closingSeats.delete(seatKey(side, name));
      return { ok: false, error: why };
    }
    podCache.at = 0;
  } else {
    endTerminalsOf(name, "");
    if (NATIVE) nativeRoom().kill(name);
    else await killEveryWindowNamed(name);
    await reapSeatLeftovers(name);
    wtCache = { ...wtCache, at: 0 };
  }
  endCanopySession(name);
  return { ok: true };
}

/* `kill-window -t session:=name` takes the first window with that name and leaves the
   rest, so a seat the fleet once brought back twice looked impossible to close: the ×
   killed one copy and the tile stayed. Every window carrying the name goes. */
async function killEveryWindowNamed(name) {
  const listed = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", "#{window_id} #W"], { timeout: 4000 });
  const ids = listed.ok
    ? listed.out.split("\n").map((line) => line.trim()).filter((line) => line.endsWith(` ${name}`)).map((line) => line.split(" ")[0])
    : [];
  if (!ids.length) {
    await sh(TMUX, ["kill-window", "-t", `${LOCAL_SESSION}:=${name}`], { timeout: 4000 });
    return;
  }
  for (const id of ids) await sh(TMUX, ["kill-window", "-t", id], { timeout: 4000 });
}

async function reapSeatLeftovers(name) {
  if (NATIVE) return { asked: [], forced: [] };
  const rows = leftoversOf(name, await readTable(), { self: process.pid, hive: HIVE_HOME });
  if (!rows.length) return { asked: [], forced: [] };
  const said = await reap(rows.map((row) => row.pid));
  if (said.asked.length) console.log(`seat ${name}: stopped ${said.asked.length} process(es) it had left running${said.forced.length ? `, ${said.forced.length} by force` : ""}`);
  return said;
}

const heldBy = (tree) => (tree.loose ? "loose" : tree.ahead ? "ahead" : tree.locked ? "locked" : "");

async function seatLeftovers(name) {
  const processes = NATIVE ? [] : leftoversOf(name, await readTable(), { self: process.pid, hive: HIVE_HOME })
    .filter((row) => !row.machinery)
    .map(({ pid, etime, cpu, command }) => ({ pid, etime, cpu, command }));
  const seat = fleet.get(seatKey("local", name));
  const mine = new Set((trails.get(seat?.id)?.trees || []).map((tree) => tree.path).filter(Boolean));
  const worktrees = !mine.size ? [] : worktreeRows(await readWorktrees(true), { measured: wtCache.measured })
    .filter((row) => mine.has(row.path) && !row.main && !row.gone)
    .map((row) => ({ path: row.path, repo: row.repo, branch: row.branch, held: heldBy(row), loose: row.loose || 0, ahead: row.ahead || 0 }));
  return { processes, worktrees };
}

async function closeEndedSeat(name) {
  const key = seatKey("local", name);
  if (closingSeats.has(key)) return;
  closingSeats.add(key);
  try {
    endTerminalsOf(name, "the shell ended, so this seat closed");
    if (NATIVE) nativeRoom().kill(name);
    else await sh("tmux", ["kill-window", "-t", `${LOCAL_SESSION}:=${name}`], { timeout: 4000 });
    endCanopySession(name);
    historyClosedSeat("local", name);
    console.log(`seat ${name} ended on its own — closed`);
  } finally {
    forgetSeat("local", name);
    cache.at = 0;
  }
}

async function archiveSeat(rawName, rawWhere, why = "") {
  const name = String(rawName || "");
  const where = rawWhere === "cloud" ? "cloud" : "local";
  if (!isSeatName(name)) throw new Error("missing name");
  const seat = fleet.get(seatKey(where, name));
  if (!seat) throw new Error("this app never opened that seat, so it has nothing to bring back");
  if (!seatIsRestorable(seat)) throw new Error("this seat cannot be brought back — close it instead");
  await killSeatWindow(name, where);
  archivedSeats.set(seatKey(where, name), archiveEntry(seat, Date.now(), why));
  saveArchivedSeats();
  historyClosedSeat(where, name);
  forgetSeat(where, name);
  cache.at = 0;
  return { ok: true, name, where };
}

async function carrySessionFile(from, to, where) {
  if (where === "cloud") {
    const script = `mkdir -p /workspace/hive/sessions\n` +
      `[ -f /workspace/hive/sessions/${from}.json ] && cp /workspace/hive/sessions/${from}.json /workspace/hive/sessions/${to}.json\ntrue`;
    await onTheServer(script, [], { timeout: 20000 }).catch(() => {});
    return;
  }
  try {
    const held = await readFile(join(HIVE_HOME, "sessions", `${from}.json`), "utf8");
    await mkdir(join(HIVE_HOME, "sessions"), { recursive: true });
    await writeFile(join(HIVE_HOME, "sessions", `${to}.json`), held);
  } catch {}
}

async function reviveArchivedSeat(rawName, rawWhere) {
  const asked = String(rawName || "");
  const where = rawWhere === "cloud" ? "cloud" : "local";
  if (!isSeatName(asked)) throw new Error("missing name");
  const parked = archivedSeats.get(seatKey(where, asked));
  if (!parked) throw new Error("nothing archived by that name");
  const seat = seatFromArchive(parked);
  if (!seatIsRestorable(seat)) throw new Error("this archived seat can no longer be brought back");

  const name = await freeName(asked, where);
  const back = { ...seat, name, at: Date.now() };
  if (name !== asked) await carrySessionFile(asked, name, where);

  if (where === "cloud") {
    if (CLOUD) {
      const woke = await wakeAndWait();
      if (!woke.ok) throw new Error(woke.error);
    }
    const brought = await onCloudSeats("POST", "/restore", { seats: [back], compactAt: await autocompactNow() });
    if (!brought.ok) throw new Error(brought.error.slice(0, 200));
    const why = (brought.body.skipped || []).find((one) => one.name === name)?.why;
    if (why) throw new Error(why);
  } else {
    if (!(await hasTmux())) throw new Error("this machine has no tmux — bring it back on the pod instead");
    if (NATIVE) {
      const [brought] = await restoreNatively([back], await autocompactNow());
      if (brought.error) throw new Error(brought.error);
    } else {
      await hubEnvIntoTmux();
      writeHiveShellRc(HIVE_HOME);
      const script = localRestoreScript([back], {
        engineDir: ENGINE_DIR,
        hub: HUB,
        hiveHome: HIVE_HOME,
        shell: process.env.SHELL || "bash",
        remoteControl: process.env.HIVE_REMOTE_CONTROL !== "0",
        autocompact: await autocompactNow()
      });
      const r = await shr(...inBash(script), { timeout: 30000 });
      if (!r.ok) throw new Error(r.error.slice(0, 200) || "tmux refused");
    }
  }

  archivedSeats.delete(seatKey(where, asked));
  saveArchivedSeats();
  rememberSeat(back);
  if (name !== asked) {
    const kept = myTitle(asked, where) || titles.get(titleKey(asked, where))?.title || "";
    if (kept) renameSeat(name, where, kept);
  }
  cache.at = 0;
  podCache.at = 0;
  return { ok: true, name, where, renamed: name !== asked ? asked : "" };
}

async function fleetAsWritten() {
  await fleetWrite;
  await loadFleet();
}

let fleetWrite = Promise.resolve();

function saveFleet() {
  if (!OWNS_FLEET) return;
  fleetWrite = fleetWrite.then(async () => {
    try {
      await mkdir(dirname(FLEET_FILE), { recursive: true });
      await writeFile(FLEET_FILE, JSON.stringify({ seats: [...fleet.values()] }, null, 2));
    } catch {}
  });
  mirrorFleetToTheBox();
}

let fleetMirrorTimer = null;

function mirrorFleetToTheBox() {
  if (SANDBOX) return;
  clearTimeout(fleetMirrorTimer);
  fleetMirrorTimer = setTimeout(() => {
    onCloudSeats("POST", "/checkpoint", { seats: fleetSeats("cloud") }).catch(() => {});
  }, 5000);
  fleetMirrorTimer.unref?.();
}


const TEAM_FRESH = 45000;
let teamCache = { at: 0, data: null, running: false };
let panelIsOnThePod = false;

const emptyTeam = () => ({ me: DEV || "", sharing: false, phone: false, poke: canPoke(DEV, POKERS), devs: [], at: 0 });



/* the team reads panel.json off every pod it can reach, so writing it is what "the team sees my
   fleet" means. The phone never reads it: its chats travel sealed, through the sync door. */
function thisMachine(config) {
  return machineName(config.machine) || machineName(String(hostname() || "").replace(/\.local$/i, ""));
}

/* what each seat has on screen right now, so the team can see who is on a page and on which
   piece of it. It is never written down: it lives here until the seat moves or the app closes. */
const pagesBySeat = new Map();

const PAGE_HOLD = 90000;

function pagesNow(at = Date.now()) {
  const here = [];
  for (const [seat, where] of pagesBySeat) {
    if (at - (where.at || 0) > PAGE_HOLD) { pagesBySeat.delete(seat); continue; }
    here.push({ slug: where.slug, tab: where.tab, el: where.el });
  }
  return pagesOf(here);
}

function seatIsOnAPage({ seat, slug, tab, el, at = Date.now() }) {
  if (!seat) return false;
  const was = pagesBySeat.get(seat);
  if (!slug) {
    if (!was) return false;
    pagesBySeat.delete(seat);
    return true;
  }
  const moved = !was || was.slug !== slug || was.tab !== tab || was.el !== el;
  pagesBySeat.set(seat, { slug, tab, el, at });
  return moved;
}

const BOARD_FRESH = 20000;

let boardCache = { at: 0, rows: [], running: null };

/* the board is one call for the whole machine: every page open on every seat asks who else is
   here, and without this they would each hit the pod on their own beat. */
async function pagesOfTheTeam(at) {
  if (at - boardCache.at < BOARD_FRESH) return boardCache.rows;
  if (boardCache.running) return boardCache.running;
  boardCache.running = (async () => {
    let rows = [];
    try {
      const server = await serverFor();
      const board = server ? await server.client.board() : null;
      rows = (board?.body?.board || [])
        .map((row) => readPanel(JSON.stringify(row?.panel ?? null), at, PAGE_HOLD))
        .filter(Boolean)
        .filter((panel) => panel.dev !== DEV)
        .map((panel) => ({ dev: panel.dev, at: panel.at, pages: panel.pages }));
      boardCache = { at: Date.now(), rows, running: null };
    } catch {
      boardCache = { at: Date.now(), rows: boardCache.rows, running: null };
      rows = boardCache.rows;
    }
    return rows;
  })();
  return boardCache.running;
}

async function whoIsOnThePage(slug) {
  const at = Date.now();
  const mine = DEV ? [{ dev: DEV, at, pages: pagesNow(at) }] : [];
  const rows = await pagesOfTheTeam(at);
  return watchersOf([...rows, ...mine], DEV, slug, at);
}

async function publishPanel() {
  if (SANDBOX || !DEV) return;
  const { config } = await readConfig();
  if (!config.share) return;
  const server = await serverFor();
  if (!server) return;
  const { sessions } = await collect();
  sweepKeyboards();
  const at = Date.now();
  const held = new Map(keyboards);
  const said = await server.client.panel(panelOf(sessions, DEV, at, held, config.avatar, config.wear, thisMachine(config), config.knocks, pagesNow(at)));
  panelIsOnThePod = said.ok;
}

async function readHive(dev) {
  if (!DEV) return emptyTeam();
  const was = (teamCache.data?.devs || []).find((d) => d.dev === dev);
  return readTeam(!!was?.up);
}

async function peerKeyOf(dev) {
  if (!DEV || !DEV_NAME.test(dev)) return "";
  const server = await serverFor();
  if (!server) return "";
  const onTheBoard = peerOfTheBoard((await readTeam()).devs, dev);
  if (onTheBoard) return onTheBoard;
  const said = await server.client.get("/api/peers");
  if (!said.ok) return "";
  const found = (said.body?.peers || []).find((one) => one.name === dev);
  return found ? found.fingerprint : "";
}

async function sayToPeer(to, kind, payload) {
  const server = await serverFor();
  if (!server) return { ok: false, error: "the server on this machine did not come up" };
  const said = await server.client.say(to, payload, kind);
  return said.ok ? { ok: true } : { ok: false, error: said.error };
}

async function onPeerSeat(to, seat, leaf, payload) {
  const server = await serverFor();
  if (!server) return { ok: false, error: "the server on this machine did not come up" };
  const path = `/api/peers/${encodeURIComponent(to)}/sessions/${encodeURIComponent(seat)}${leaf}`;
  return payload === null ? server.client.get(path) : server.client.post(path, payload);
}

async function readTeam(force = false) {
  if (!DEV) return emptyTeam();
  if (!force && teamCache.data && Date.now() - teamCache.at < TEAM_FRESH) return teamCache.data;
  if (teamCache.running) return teamCache.data || emptyTeam();
  teamCache.running = true;
  try {
    const server = await serverFor();
    if (!server) { teamCache.running = false; return teamCache.data || emptyTeam(); }
    const board = await server.client.board();
    if (!board.ok) { teamCache.running = false; return teamCache.data || emptyTeam(); }
    const { config } = await readConfig();
    const data = {
      me: DEV,
      sharing: !!config.share,
      phone: !!config.phone,
      machines: !!config.machines,
      here: servers.identity.fingerprint,
      machine: config.machine || "",
      machineHere: thisMachine(config),
      poke: canPoke(DEV, POKERS),
      devs: teamFromBoard(board.body?.board || [], DEV),
      at: Date.now()
    };
    teamCache = { at: Date.now(), data, running: false };
    return data;
  } catch {
    teamCache.running = false;
    return teamCache.data || emptyTeam();
  }
}

const KNOCK_KEPT = 8;
/* a knock waits at the foot of the asker's patience, not forever: past this it is stale and drops off */
const KNOCK_LIFE = 1800000;
const keyboards = new Map();
const owing = new Map();
const owedPath = () => join(HIVE_HOME, OWED_FILE);

function keepOwed() {
  try { writeFileSync(owedPath(), owedText(owing.entries())); } catch {}
}

function recallOwed() {
  let body = "";
  try { body = readFileSync(owedPath(), "utf8"); } catch { return; }
  for (const [seat, owed] of owedFrom(body)) if (!owing.has(seat)) owing.set(seat, owed);
}
let knocking = [];
const POKE_KEPT = 8;
let poking = [];
let inboxAt = 0;
let inboxRunning = false;
let teamMoved = false;

const anyKeyboardLent = () => [...keyboards.values()].some((k) => grantLive(k));
const knocksWaiting = (now = Date.now()) => knocking.filter((k) => now - Number(k.at || 0) < KNOCK_LIFE);
const pokesWaiting = (now = Date.now()) => poking.filter((p) => now - Number(p.at || 0) < POKE_FRESH);

function sweepKeyboards() {
  const now = Date.now();
  for (const [seat, lent] of keyboards) if (!grantLive(lent, now)) { keyboards.delete(seat); dropLive(seat); }
}

async function keyboardOnTheServer(seat, dev, lending) {
  const server = await serverFor();
  if (!server) return { ok: false, error: "no server answering here" };
  const to = await peerKeyOf(dev);
  if (!to) return { ok: false, error: `${dev} is not paired with this server` };
  return server.client.post(lending ? "/api/grants" : "/api/grants/take", lending ? { seat, to, forMs: GRANT_MS } : { seat, to });
}

function lendKeyboard(seat, to) {
  keyboards.set(seat, { with: to, until: Date.now() + GRANT_MS, turns: keyboards.get(seat)?.turns || [] });
  return keyboardOnTheServer(seat, to, true).catch((wrong) => ({ ok: false, error: String(wrong?.message || wrong) }));
}

function takeKeyboardBack(seat) {
  const held = keyboards.get(seat);
  keyboards.delete(seat);
  dropLive(seat);
  if (!held?.with) return Promise.resolve({ ok: true });
  return keyboardOnTheServer(seat, held.with, false).catch((wrong) => ({ ok: false, error: String(wrong?.message || wrong) }));
}

/* a seat deep in a run of tools can have nothing but tool traffic in its last pages,
   so when the first window comes back silent we read a wider one before giving up */
const TURN_WINDOWS = [65536, 524288];

async function eventsOfSeat(seat, bytes) {
  /* the name goes into a bash -c further down: this function checks it itself instead of trusting
     that every caller it will ever have remembered to */
  if (!isSeatName(seat)) return "";
  const here = join(HIVE_HOME, "events", seat + ".ndjson");
  if (existsSync(here)) return eventsTail(here, bytes);
  return (await onTheServer('tail -c "$1" "$HIVE_STATE_DIR/events/$2.ndjson" 2>/dev/null || true', [String(bytes), seat], { timeout: 15000 })).out;
}

async function turnsOfSeat(seat) {
  for (const bytes of TURN_WINDOWS) {
    const turns = turnsOfTail(await eventsOfSeat(seat, bytes));
    if (turns.length) return turns;
  }
  return [];
}

async function refreshLentTurns() {
  for (const [seat, lent] of keyboards) {
    /* the phone reads the whole conversation from its own file; the last turns on the card exist
       for the visitor who only has the card */
    if (!grantLive(lent)) continue;
    try { lent.turns = await turnsOfSeat(seat); } catch {}
  }
}

/* the deck of cards is read by every hive on the team on a timer, so it stays a deck of cards: the
   transcript of a borrowed seat travels apart, in a file of its own, and only while the keyboard is
   out. It is appended to, never rewritten, so the visitor asks for the bytes past the ones they have
   instead of re-reading a conversation that only grows. Everything that is not the talking — what a
   tool answered, what the model thought, what an image held — is peeled off here, before the file
   exists, so it never leaves this machine at all. */

const livePublished = new Map();
const wholeWanted = new Set();
const LIVE_STEP = 65536;
const LIVE_WHOLE = 8 << 20;

/* where the page we just read begins — a seat's log grows with everything, including the tool output
   we never publish, so a page that no longer reaches back to where we stopped is a page with a hole
   in front of it and has to be read wider */
function firstSeqOf(tail) {
  for (const line of String(tail || "").split("\n")) {
    try {
      const n = Number(JSON.parse(line).seq);
      if (Number.isFinite(n)) return n;
    } catch {}
  }
  /* not zero: a page with no whole line in it says nothing about where it begins, and zero would
     read as "begins at the start", which is the opposite of what it means */
  return null;
}

/* one tool result can be hundreds of kilobytes on a single line, so a window can open in the middle
   of one and reach back no further. rather than splice the conversation as if nothing were missing,
   the hole is announced — the far side already knows how to paint a driver warning. */
function holeEvent(seq, ts) {
  return { seq, ts, type: "driver", subtype: "warning", message: "some of this conversation did not fit the window and was not mirrored" };
}

async function publishLive() {
  if (!CLOUD || SANDBOX || !DEV) return;
  for (const [seat, lent] of keyboards) {
    if (!grantLive(lent)) continue;
    const file = liveFileOf(seat);
    if (!file) continue;
    const last = livePublished.get(seat);
    try {
      const gapped = (page) => {
        if (!last) return false;
        const first = firstSeqOf(page);
        return first === null || first > last.seq + 1;
      };
      const whole = wholeWanted.has(seat);
      let tail = await eventsOfSeat(seat, whole ? LIVE_WHOLE : last ? LIVE_STEP : LIVE_WINDOW);
      if (!whole && gapped(tail)) tail = await eventsOfSeat(seat, LIVE_WINDOW);
      const fresh = liveOfTail(tail, whole || !last ? 0 : last.seq);
      if (!fresh.length) { wholeWanted.delete(seat); continue; }
      if (!whole && gapped(tail)) fresh.unshift(holeEvent(fresh[0].seq, fresh[0].ts));
      const body = fresh.map((event) => JSON.stringify(event)).join("\n") + "\n";
      const grown = Buffer.byteLength(body);
      /* the first send of a loan always starts the file, never continues it: a seat lent again later
         would otherwise append under the last borrower's conversation and hand it to the new one.
         Past the ceiling it starts over too, and whoever is reading sees the size go backwards. */
      const over = whole || !last || (last.bytes || 0) + grown > LIVE_MAX;
      const script = `mkdir -p ${LIVE_DIR}\n` + (over
        ? `cat > ${file}.tmp && mv ${file}.tmp ${file}`
        : `cat >> ${file}`);
      const wrote = await onTheServer(script, [],
        { timeout: whole ? 120000 : 20000, input: body });
      if (!wrote.ok) continue;
      wholeWanted.delete(seat);
      const seq = fresh.reduce((n, event) => Math.max(n, Number(event.seq) || 0), last?.seq || 0);
      livePublished.set(seat, { seq, bytes: over ? grown : (last?.bytes || 0) + grown });
    } catch {}
  }
}

/* the keyboard came back: a conversation left sitting on the volume is a conversation still being
   read. Best effort — a pod that is gone took the file with it. */
function dropLive(seat) {
  livePublished.delete(seat);
  const file = liveFileOf(seat);
  if (!file || !CLOUD || SANDBOX) return;
  onTheServer('rm -f "$1"', [file], { timeout: 10000 }).catch(() => {});
}

/* the visitor's side: one exec that answers with the size first and the bytes we do not have after
   it, so a conversation that did not move costs a line. A size smaller than what we asked from is
   the owner having started the file over: we say so and hand back the whole thing from the top. */

async function podCmd(seat, cmd) {
  const server = await serverFor();
  if (!server) return { ok: false, error: cloudDoorTrouble() };
  const said = await server.client.post(`/api/sessions/${encodeURIComponent(seat)}/command`, cmd);
  if (!said.ok) return { ok: false, error: said.error || "the seat did not take it" };
  return said.body?.ok ? { ok: true } : { ok: false, error: said.body?.error || "the seat did not take it" };
}

const podSay = (seat, line) => podCmd(seat, { type: "say", text: line });

async function deliverAnswer(seat, id, answers) {
  const { sessions } = await collect();
  const found = sessions.find((x) => x.name === seat);
  if (!found) return { ok: false, error: "that seat is not alive here anymore" };
  if (!found.structured) return { ok: false, error: "this seat has no question card to answer — it answers in the terminal" };
  const cmd = { type: "answer", id, answers };
  if (found.where === "cloud") return podCmd(seat, cmd);
  if (!bridge) return { ok: false, error: "no bridge here to answer with" };
  const reply = await bridge.oneshot(join(HIVE_HOME, "sock", seat + ".sock"), cmd);
  return reply && reply.ok ? { ok: true } : { ok: false, error: (reply && reply.error) || "the seat did not take the answer" };
}

async function deliverSay(seat, from, text, spoken = "") {
  const { sessions } = await collect();
  const found = sessions.find((x) => x.name === seat);
  if (!found) return { ok: false, error: "that seat is not alive here anymore" };
  const line = spoken || sayLine(from, text);
  if (found.structured) {
    if (found.where === "cloud") return podSay(seat, line);
    if (!bridge) return { ok: false, error: "no bridge here to type with" };
    const reply = await bridge.oneshot(join(HIVE_HOME, "sock", seat + ".sock"), { type: "say", text: line });
    return reply && reply.ok ? { ok: true } : { ok: false, error: (reply && reply.error) || "the seat did not take it" };
  }
  await typeText(seat, found.where, line, true);
  return { ok: true };
}

async function takeNote(kind, note) {
  const { config } = await readConfig();
  if (!config.share) return;

  if (kind === "poke") {
    if (!config.knocks) return;
    const poke = readPoke(JSON.stringify(note));
    if (poke) poking = [...poking.filter((p) => p.id !== poke.id), poke].slice(-POKE_KEPT);
    return;
  }

  if (kind === "ask") {
    const asked = readAsk(JSON.stringify(note));
    if (asked && !config.knocks) return sendAskBack(asked);
    if (asked) knocking = [...knocking.filter((k) => k.from !== asked.from || k.id !== asked.id), { ...asked, kind: "ask", seat: "" }].slice(-KNOCK_KEPT);
    return;
  }

  if (kind === "knock") {
    const knock = readKnock(JSON.stringify(note));
    if (!knock) return;
    if (knock.kind === "bye") {
      const held = keyboards.get(knock.seat);
      if (held && held.with === knock.from) await takeKeyboardBack(knock.seat);
      return;
    }
    if (knock.kind === "yes") { teamMoved = true; return; }
    if (!config.knocks) return;
    if (grantLive(keyboards.get(knock.seat))) return;
    knocking = [...knocking.filter((k) => k.from !== knock.from || k.seat !== knock.seat), knock].slice(-KNOCK_KEPT);
    return;
  }

  if (kind === "answer") {
    const back = readAnswer(JSON.stringify(note));
    if (back) await deliverSay(back.seat, back.from, back.text, `${back.from} answers: ${back.text}`);
    return;
  }

  if (kind === "say") {
    const said = readSay(JSON.stringify(note));
    if (!said) return;
    const lent = keyboards.get(said.seat);
    if (!grantLive(lent) || lent.with !== said.from) return;
    const sent = await deliverSay(said.seat, said.from, said.text);
    if (sent.ok) lent.until = Date.now() + GRANT_MS;
  }
}

const NOT_TAKING_ASKS = "is not taking questions from the team right now";

async function sendAskBack(asked) {
  await noteToPeer(asked.from, "answer", answerOf(DEV, asked.agent, `${DEV} ${NOT_TAKING_ASKS}`, Date.now(), asked.id)).catch(() => {});
}

function peerTakesKnocks(dev) {
  const row = liveliestOfDev(teamCache.data?.devs || [], dev);
  return !row || row.knocks !== false;
}

const NOTE_KINDS = new Set(["poke", "ask", "knock", "answer", "say"]);
let notesFollowed = null;

const MINE_FRESH = 60000;
const MINE_STALE = 600000;
let mine = { at: 0, kinds: new Map() };
let knownServerKey = "";

const serverKey = () => knownServerKey;

async function refreshMyDevices() {
  if (Date.now() - mine.at < MINE_FRESH) return mine.kinds;
  const server = await serverFor();
  const said = server ? await server.client.get("/api/devices") : { ok: false };
  if (!said.ok) {
    if (Date.now() - mine.at > MINE_STALE) mine = { at: 0, kinds: new Map() };
    return mine.kinds;
  }
  const kinds = new Map((said.body?.devices || [])
    .filter((one) => !one.revoked && one.kind === "mac")
    .map((one) => [one.fingerprint, one.kind]));
  mine = { at: Date.now(), kinds };
  return kinds;
}

let switches = { phone: false, machines: false };

async function refreshSwitches() {
  const { config } = await readConfig();
  switches = { phone: !!config.phone, machines: !!config.machines };
  return switches;
}

function deviceMayReachSeats(who) {
  return mine.kinds.get(who) === "mac" && switches.machines;
}

let relay = null;

function theRelay() {
  if (relay) return relay;
  relay = createRelay({
    desk,
    sendTo: (who, kind, body) => { sayToPeer(who, kind, body).catch(() => {}); },
    mine: (who) => (mine.kinds.has(who) ? deviceMayReachSeats(who) : who === serverKey()),
    openSeat: async (mission) => {
      const asked = { ...mission, structured: true };
      const job = openJob(asked);
      await runJob(job, asked);
      return job.step === "failed" ? { error: job.error } : { id: job.id, name: job.name };
    },
    handBirth: (id, said) => {
      serverFor()
        .then((one) => one && one.client.post("/api/born", { id, ...said }))
        .catch(() => {});
    },
    allow: (who, seat) => {
      if (who === serverKey()) return true;
      if (mine.kinds.has(who)) return deviceMayReachSeats(who);
      const lent = keyboards.get(seat);
      return !!lent && grantLive(lent) && lent.with === who;
    }
  });
  return relay;
}

async function followTeamNotes() {
  if (notesFollowed || SANDBOX || !DEV) return;
  const server = await serverFor();
  if (!server) return;
  refreshMyDevices().catch(() => {});
  knownServerKey = server.audience || "";
  notesFollowed = server.stream.follow("team-notes", (envelope) => {
    if (!envelope) return;
    if (SEAT_KINDS.has(envelope.kind)) {
      Promise.all([refreshMyDevices(), refreshSwitches()])
        .then(() => theRelay().take(envelope.from, envelope.kind, envelope.body))
        .catch(() => {});
      return;
    }
    if (!NOTE_KINDS.has(envelope.kind)) return;
    takeNote(envelope.kind, envelope.body).then(() => refreshLentTurns()).then(() => publishLive()).catch(() => {});
  });
}

async function noteToPeer(dev, kind, note) {
  const server = await serverFor();
  if (!server) return { ok: false, error: "no server answering here" };
  const to = peerOfTheBoard((await readTeam()).devs, dev);
  const said = await server.client.post("/api/peer-note", { dev: String(dev || ""), ...(to ? { to } : {}), kind, note });
  return said.ok ? { ok: true } : { ok: false, error: said.error || "the note did not leave" };
}

async function sendAsk(going) {
  const row = ((teamCache.data || {}).devs || []).find((d) => d.dev === going.to);
  const refuse = (why) => tellMyAgent(going.agent, going.to, why);
  if (!row) return refuse(`I do not know a hive called ${going.to}`);
  if (!row.up) return refuse(`${going.to}'s pod is asleep — nothing would land`);
  if (row.knocks === false) return refuse(`${going.to} ${NOT_TAKING_ASKS}`);
  const sent = await noteToPeer(going.to, "ask", askOf(DEV, going.agent, going.text, Date.now(), going.id));
  if (!sent.ok) return refuse(`the question did not reach ${going.to}: ${sent.error}`);
}

async function tellMyAgent(seat, who, why) {
  await deliverSay(seat, who, why, `[hive] your question to ${who} went nowhere — ${why}`).catch(() => {});
}

async function drainOutHere() {
  const here = join(HIVE_HOME, "outbox");
  if (!DEV || !existsSync(here)) return;
  for (const file of readdirSync(here).filter((f) => f.endsWith(".json"))) {
    const full = join(here, file);
    let body = "";
    try { body = readFileSync(full, "utf8"); } catch { continue; }
    try { rmSync(full, { force: true }); } catch {}
    const going = readOutbox(body);
    if (going) await sendAsk(going).catch(() => {});
  }
}

async function collectAnswers() {
  for (const [seat, owed] of owing) {
    if (!owedLive(owed)) {
      owing.delete(seat);
      keepOwed();
      await noteToPeer(owed.to, "answer",
        answerOf(DEV, owed.agent, "no answer came in time — ask again, or reach out yourself", Date.now(), owed.id)).catch(() => {});
      continue;
    }
    let turns = [];
    try { turns = await turnsOfSeat(seat); } catch { continue; }
    if (turns.length <= owed.mark) continue;
    const last = turns[turns.length - 1];
    if (!last || last.who !== "seat") continue;
    owing.delete(seat);
    keepOwed();
    await noteToPeer(owed.to, "answer", answerOf(DEV, owed.agent, last.text, Date.now(), owed.id)).catch(() => {});
  }
}


async function tellTheAsker(dev, seat) {
  if (!DEV) return;
  await noteToPeer(dev, "knock", knockOf(DEV, seat, Date.now(), "yes"));
}

function rememberSeat(seat) {
  fleet.set(seatKey(seat.where, seat.name), { openedAt: Date.now(), ...seat });
  newborn.delete(seatKey(seat.where, seat.name));
  saveFleet();
}

function forgetSeat(where, name) {
  if (fleet.delete(seatKey(where, name))) saveFleet();
  closingSeats.delete(seatKey(where, name));
}

function fleetSeats(where) {
  return [...fleet.values()].filter((seat) => seat.where === where);
}

function structuredSeat(where, name) {
  return seatRecord(where, name)?.kind === "structured";
}

const shellSeat = (where, name) => fleet.get(seatKey(where, name))?.kind === "shell";

/* a seat the pod could not bring back used to be deleted here, with no archive
   entry and no line anywhere: the grid simply had one card fewer, and whoever
   lost it assumed they had closed it. It goes to the archive now, carrying the
   reason, so a seat that cannot come back can still be found. */
function applyPrune(prune) {
  if (!prune.length) return;
  const at = Date.now();
  for (const { seat, why } of prune) {
    fleet.delete(seatKey(seat.where, seat.name));
    archivedSeats.set(seatKey(seat.where, seat.name), archiveEntry(seat, at, why));
    console.log(`fleet: ${seat.where} seat ${seat.name} went to the archive — ${why}`);
  }
  saveFleet();
  saveArchivedSeats();
  cache.at = 0;
}

function lastTouchedAt(file) {
  try { return statSync(file).mtimeMs; }
  catch { return 0; }
}

function seatLastActiveAt(seat) {
  const touched = [
    lastTouchedAt(join(HIVE_HOME, "events", `${seat.name}.ndjson`)),
    lastTouchedAt(join(HUB, ".hive/status", `${seat.name}.md`)),
    seat.id ? lastTouchedAt(join(CLAUDE_PROJECTS, projectSlug(seat.cwd || HUB), `${seat.id}.jsonl`)) : 0,
    Number(seat.openedAt) || 0
  ];
  return Math.max(...touched);
}

async function closeQuietSeats() {
  const { config } = await readConfig();
  const days = config.closeQuietAfterDays;
  if (!days) return;
  const held = new Set([...[...closingSeats].map((key) => key.replace(/^local:/, "")), ...[...spawning.values()].map((job) => job.name)]);
  const quiet = seatsGoneQuiet({
    seats: fleetSeats("local").filter(seatIsRestorable),
    sessions: (await collect()).sessions,
    lastActiveAt: seatLastActiveAt,
    days,
    now: Date.now(),
    held
  });
  for (const seat of quiet) {
    try {
      await archiveSeat(seat.name, "local", quietReason(days));
      console.log(`fleet: local seat ${seat.name} went to the archive — ${quietReason(days)}`);
    } catch (wrong) {
      console.log(`fleet: could not close the quiet seat ${seat.name} — ${wrong.message || wrong}`);
    }
  }
}

async function syncedClaudeSessions() {
  const claudeHome = process.env.CLAUDE_CLOUD_SESSIONS_HOME || join(HOME, ".claude");
  let synced;
  try { synced = JSON.parse(await readFile(join(claudeHome, "cloud-sessions.json"), "utf8")); } catch { return new Set(); }
  const ref = `refs/remotes/${synced?.git?.remoteName || "origin"}/${synced?.git?.branch || "main"}`;
  const listed = await shr("git", ["-C", join(claudeHome, "cloud-sessions", "repo"), "ls-tree", "-r", "--name-only", ref], { timeout: 30000, maxBuffer: 64 << 20 });
  return listed.ok ? syncedSessionIds(listed.out) : new Set();
}

async function pruneQuietDiaries() {
  const { config } = await readConfig();
  const days = config.pruneDiariesAfterDays;
  if (!days) return;
  const eventsDir = join(HIVE_HOME, "events");
  const sessionsDir = join(HIVE_HOME, "sessions");
  const open = new Set([
    ...fleetSeats("local").map((seat) => seat.name),
    ...(await collect()).sessions.filter((one) => one.where !== "cloud").map((one) => one.name),
    ...[...spawning.values()].map((job) => job.name),
    ...[...closingSeats].map((key) => key.replace(/^local:/, ""))
  ]);
  const diaries = await readDiaries(eventsDir);
  const metas = new Map();
  for (const { name } of diaries) if (!open.has(name)) metas.set(name, await readSeatMeta(sessionsDir, name));
  const doomed = diariesToPrune({ diaries, open, metaOf: (name) => metas.get(name), synced: await syncedClaudeSessions(), days, now: Date.now() });
  let freed = 0;
  for (const { name, touchedAt } of doomed) {
    try {
      const size = statSync(join(eventsDir, `${name}.ndjson`)).size;
      await pruneDiary({ eventsDir, sessionsDir, name, meta: metas.get(name), touchedAt });
      freed += size;
    } catch (wrong) {
      console.log(`diaries: could not prune ${name} — ${wrong.message || wrong}`);
    }
  }
  if (doomed.length) console.log(`diaries: pruned ${doomed.length} closed chat(s) quiet for ${days}+ days, ${Math.round(freed / 1048576)} MB freed`);
}

function markRevived(restore) {
  const at = Date.now();
  for (const seat of restore) fleet.set(seatKey(seat.where, seat.name), { ...seat, revivedAt: at });
  if (restore.length) saveFleet();
}

function clearRevived(where, liveNames) {
  let touched = false;
  for (const name of liveNames) {
    const seat = fleet.get(seatKey(where, name));
    if (!seat?.revivedAt) continue;
    delete seat.revivedAt;
    touched = true;
  }
  if (touched) saveFleet();
}

async function restoreNatively(seats, autocompact) {
  const held = nativeRoom();
  const shared = await hubSeatEnv();
  const plan = localRestorePlan(seats, {
    engineDir: ENGINE_DIR,
    hub: HUB,
    hiveHome: HIVE_HOME,
    remoteControl: process.env.HIVE_REMOTE_CONTROL !== "0",
    autocompact
  });
  const out = [];
  for (const one of plan) {
    const opened = await held.open({ name: one.name, kind: one.kind, program: one.program, args: one.args, env: { ...shared, ...one.env }, cwd: one.cwd, fallback: one.fallback });
    out.push(opened.error ? { name: one.name, error: opened.error } : { name: one.name, ok: true });
  }
  return out;
}

/* on Windows the seats die with this server, so a boot is not a seat dying twice: whatever
   the fleet remembers comes back. Between boots the usual rule holds — a seat that dies
   within ten minutes of coming back waits, and one nothing can resume goes to the archive. */
async function reconcileNativeFleet(seats, { boot = false } = {}) {
  const liveNames = nativeRoom().list().map((one) => one.name);
  const live = new Set(liveNames);
  const planned = fleetPlan(seats, !boot, liveNames);
  const missing = planned.restore.filter((seat) => !live.has(seat.name));
  applyPrune(planned.prune.filter((one) => one.why === GAVE_UP_NOTHING_TO_RESUME));
  clearRevived("local", liveNames);
  const { restore, held } = withoutTheLiving(missing, await seatsStillAnswering(missing));
  tellHeldOnce(held, liveNames);
  if (!restore.length) return;
  const brought = await restoreNatively(restore, await autocompactNow());
  const back = restore.filter((seat) => brought.find((one) => one.name === seat.name)?.ok);
  for (const one of brought) if (one.error) console.log(`fleet: leaving ${one.name} behind — ${one.error}`);
  if (!back.length) return;
  markRevived(back);
  console.log(`fleet: brought ${back.length} local seat(s) back after a restart`);
  cache.at = 0;
}

const heldTold = new Set();

async function seatsStillAnswering(wanted) {
  const checks = await Promise.all(wanted.map(async (seat) => [seat.name, await seats.alive(seat.name).catch(() => false)]));
  return new Set(checks.filter(([, answers]) => answers).map(([name]) => name));
}

function tellHeldOnce(held, liveNames) {
  for (const name of liveNames) heldTold.delete(name);
  for (const seat of held) {
    if (heldTold.has(seat.name)) continue;
    heldTold.add(seat.name);
    console.log(`fleet: ${seat.name} has no window named after it, but ${HELD_STILL_ANSWERS}`);
  }
}

let firstLocalReconcile = true;

/* around a sleep or a wake the tmux client can answer "no server running" for a session
   that is alive and keeps every window; one such reading, taken as the whole fleet dead,
   opened a second chat for every seat. The session is only dead when it says so twice. */
async function localSessionSeenTwice() {
  const ask = () => shr(...viaBash(TMUX, ["has-session", "-t", LOCAL_SESSION]), { timeout: 8000 });
  const first = await ask();
  if (first.ok || !NO_TMUX_SESSION.test(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return ask();
}

async function reconcileLocalFleet() {
  const boot = firstLocalReconcile;
  firstLocalReconcile = false;
  if (!OWNS_FLEET) return;
  const seats = fleetSeats("local");
  if (!seats.length || !(await hasTmux())) return;
  if (NATIVE) return reconcileNativeFleet(seats, { boot });
  const has = await localSessionSeenTwice();
  if (!has.ok && !NO_TMUX_SESSION.test(has.error)) return;
  let liveNames = [];
  if (has.ok) {
    const r = await shr(TMUX, ["list-windows", "-t", LOCAL_SESSION, "-F", "#W"], { timeout: 8000 });
    if (!r.ok) return;
    liveNames = r.out.split("\n").map((l) => l.trim()).filter(Boolean);
  }
  const { restore: missing, prune } = fleetPlan(seats, has.ok, liveNames);
  applyPrune(prune);
  clearRevived("local", liveNames);
  const { restore, held } = withoutTheLiving(missing, await seatsStillAnswering(missing));
  tellHeldOnce(held, liveNames);
  if (!restore.length) return;
  await hubEnvIntoTmux();
  writeHiveShellRc(HIVE_HOME);
  const script = localRestoreScript(restore, {
    engineDir: ENGINE_DIR,
    hub: HUB,
    hiveHome: HIVE_HOME,
    shell: process.env.SHELL || "bash",
    remoteControl: process.env.HIVE_REMOTE_CONTROL !== "0",
    autocompact: await autocompactNow()
  });
  const r = await shr(...inBash(script), { timeout: 30000 });
  if (r.ok) {
    markRevived(restore);
    console.log(`fleet: brought ${restore.length} local seat(s) back after a restart`);
    cache.at = 0;
  }
}

function tellSeatsNobodyLooksYet() {
  if (!OWNS_FLEET) return;
  for (const seat of fleetSeats("local")) {
    if (desk.watching.includes(seat.name)) continue;
    Promise.resolve().then(() => seats.command(seat.name, { type: "presence", watched: false })).catch(() => {});
  }
}

async function reconcileCloudFleet() {
  if (!OWNS_FLEET) return;
  const seats = fleetSeats("cloud");
  if (!seats.length) return;
  const listed = await onCloudSeats("GET", "");
  if (!listed.ok) return;
  for (const name of listed.body.ended || []) {
    if (!fleet.has(seatKey("cloud", name))) continue;
    historyClosedSeat("cloud", name);
    forgetSeat("cloud", name);
    console.log(`fleet: cloud seat ${name} ended on its own — closed`);
  }
  const still = seats.filter((seat) => fleet.has(seatKey("cloud", seat.name)));
  const liveNames = (listed.body.seats || []).map((one) => String(one.name || "")).filter(Boolean);
  const { restore, prune } = fleetPlan(still, true, liveNames);
  applyPrune(prune);
  clearRevived("cloud", liveNames);
  if (!restore.length) return;
  const compactAt = await autocompactNow();
  /* the plan was drawn from a snapshot; a seat closed while the tick was in flight
     would be brought straight back. Only what the fleet still remembers is restored. */
  const wanted = restore.filter((seat) => fleet.has(seatKey("cloud", seat.name)) && !closingSeats.has(seatKey("cloud", seat.name)));
  if (!wanted.length) return;
  const back = await onCloudSeats("POST", "/restore", { seats: wanted, compactAt });
  if (!back.ok) return;
  const brought = (back.body.restored || []).length;
  markRevived(wanted.filter((seat) => (back.body.restored || []).includes(seat.name)));
  if (brought) console.log(`fleet: brought ${brought} cloud seat(s) back after the box came up`);
  for (const one of back.body.skipped || []) console.log(`fleet: ${one.name} stayed behind — ${one.why}`);
  cache.at = 0;
  podCache.at = 0;
}

let fleetTicking = false;

async function fleetTick() {
  if (fleetTicking) return;
  fleetTicking = true;
  try {
    await fleetAsWritten();
    await reconcileLocalFleet();
    await reconcileCloudFleet();
  } catch {} finally {
    fleetTicking = false;
  }
}

const REPO = pickRepo(
  [process.env.HIVE_REPO, readHiveEnvConfig().HIVE_REPO, join(HERE, ".."), join(HUB, REPO_FOLDER)],
  (dir) => existsSync(join(dir, ".git"))
);
const PACKAGED = runsFromBundle(HERE, REPO);
const APP_DIR = REPO ? join(REPO, "app") : HERE;
const BUILD_STAMP = (() => {
  try { return JSON.parse(readFileSync(join(HERE, "build.json"), "utf8")); } catch { return {}; }
})();
const BUILT_FROM = String(BUILD_STAMP.sha || "");
const BUILT_ON = String(BUILD_STAMP.at || "");
const stampedTag = () => (BUILT_FROM && BUILT_ON ? `hive-${BUILT_ON.slice(0, 10).replace(/-/g, ".")}-${BUILT_FROM.slice(0, 8)}` : "");
const stampedRelease = () => (PACKAGED
  ? { tag: stampedTag(), number: Number(BUILD_STAMP.release || 0) || 0, sha: BUILT_FROM, at: BUILT_ON, branch: String(BUILD_STAMP.branch || "") }
  : { tag: "", number: 0, sha: "", at: "", branch: "" });

const SHIPPED = process.env.HIVE_APP_SHIPPED || HERE;
const RELEASE_TEAM = signingTeam({ here: HERE, shipped: SHIPPED, read: readFileSync });
const RELEASE_ASSET = process.platform === "darwin" && process.arch === "arm64" ? "Hive-arm64.zip"
  : process.platform === "linux" && process.arch === "x64"
    ? (rpmInstallOf(process.env.HIVE_APP_BUNDLE) ? "Hive-x86_64.rpm" : "Hive-x86_64.AppImage")
  : process.platform === "win32" && process.arch === "x64" ? "Hive-x64.exe"
  : "";
const SHELL_PRINT = String(BUILD_STAMP.shell || "");
const SHIPPED_SDK = sdkAgreement(join(SHIPPED, ".."), readFileSync);
const PACK_ASSET = PACKAGED && SHIPPED_SDK.agrees ? packOf(SHELL_PRINT) : "";
if (PACKAGED && !SHIPPED_SDK.agrees) {
  console.log(`hive: the bundle carries claude-agent-sdk ${SHIPPED_SDK.shipped || "none"} while its lockfile asks for ${SHIPPED_SDK.locked || "nothing"} — updates take the full build until a bundle agrees with itself`);
}
const CURRENT_JS = join(HIVE_HOME, "js", "current.json");
const STAGING = join(HIVE_HOME, "updates");
const UPDATE_FRESH = 300000;

const SEEN_RELEASE = join(HIVE_HOME, "seen-release.json");

let updateCache = { at: 0, data: null, running: false, remoteSha: "" };
let updatePhase = { step: "", done: 0, total: 0 };
let landedCache = null;
let saidNoReleaseRepo = false;

const emptyUpdate = () => ({ behind: 0, commits: [], notes: [], quiet: 0, branch: "", packaged: PACKAGED, repo: REPO, via: "", tag: "", asset: "", mine: stampedRelease() });

function readSeenRelease() {
  try { return String(JSON.parse(readFileSync(SEEN_RELEASE, "utf8")).sha || ""); } catch { return ""; }
}

async function markReleaseSeen(sha) {
  if (!sha) return;
  try {
    await mkdir(HIVE_HOME, { recursive: true });
    await writeFile(SEEN_RELEASE, `${JSON.stringify({ sha, at: new Date().toISOString() }, null, 2)}\n`);
  } catch {}
  landedCache = { ready: false };
}

async function releasesFromGithub() {
  const query = releasesQuery(RELEASE_REPO);
  if (!query) {
    if (!saidNoReleaseRepo) {
      saidNoReleaseRepo = true;
      console.log("hive: no release repository to ask — updates fall back to the checkout until HIVE_RELEASE_REPO or the bundle's own name says where the releases live");
    }
    return null;
  }
  const r = await shr(...viaBash("gh", ["api", query]), { timeout: 20000 });
  if (!r.ok) return null;
  try { const parsed = JSON.parse(r.out); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

async function landedFromCheckout() {
  const head = REPO ? (await sh("git", ["-C", REPO, "rev-parse", "HEAD"], { timeout: 5000 })).trim() : "";
  if (!head) return (landedCache = { ready: false });
  const seen = readSeenRelease();
  if (!seen || sameCommit(seen, head)) {
    if (!seen) await markReleaseSeen(head);
    return (landedCache = { ready: false });
  }
  const subjects = (await sh("git", ["-C", REPO, "log", "--no-merges", "--format=%s", `${seen}..${head}`], { timeout: 8000 }))
    .split("\n").filter(Boolean);
  const { notes, quiet } = notesFromSubjects(subjects.map((subject) => ({ subject, pr: "" })));
  if (!notes.length) {
    await markReleaseSeen(head);
    return (landedCache = { ready: false });
  }
  return (landedCache = { ready: true, sha: head, tag: "", from: "", at: "", releases: 0, notes: notes.slice(0, 40), quiet });
}

async function whatLanded() {
  if (landedCache) return landedCache;
  if (!BUILT_FROM) return landedFromCheckout();
  const seen = readSeenRelease();
  if (!seen) {
    await markReleaseSeen(BUILT_FROM);
    return (landedCache = { ready: false });
  }
  if (sameCommit(seen, BUILT_FROM)) return (landedCache = { ready: false });
  const releases = await releasesFromGithub();
  const landed = releases ? notesBetween(releases, seen, BUILT_FROM) : null;
  if (!landed || !landed.notes.length) {
    await markReleaseSeen(BUILT_FROM);
    return (landedCache = { ready: false });
  }
  return (landedCache = { ready: true, sha: BUILT_FROM, ...landed });
}

async function runningCommit() {
  if (!PACKAGED || !BUILT_FROM) return "HEAD";
  const known = await shr("git", ["-C", REPO, "cat-file", "-e", `${BUILT_FROM}^{commit}`], { timeout: 5000 });
  return known.ok ? BUILT_FROM : "HEAD";
}

async function publishedUpdate() {
  if (!PACKAGED || !RELEASE_ASSET) return null;
  const releases = await releasesFromGithub();
  const stamped = stampedRelease();
  const found = releases ? updatePicked(releases, BUILT_FROM, { pack: PACK_ASSET, bundle: RELEASE_ASSET, number: stamped.number }) : null;
  const published = releases ? releaseOf(releases, BUILT_FROM) : null;
  const mine = { ...stamped, ...(published || {}), number: published?.number || stamped.number };
  return found ? { ...found, branch: "main", packaged: true, repo: REPO, mine } : null;
}

async function gitUpdate() {
  if (!REPO) return null;
  const tip = (await sh("git", ["-C", REPO, "ls-remote", "origin", "refs/heads/main"], { timeout: 12000 })).split(/\s/)[0] || "";
  const known = (await sh("git", ["-C", REPO, "rev-parse", "origin/main"], { timeout: 5000 })).trim();
  if (tip && tip !== known) await sh("git", ["-C", REPO, "fetch", "origin", "main", "--quiet"], { timeout: 25000 });
  const mine = await runningCommit();
  const behind = Number((await sh("git", ["-C", REPO, "rev-list", "--count", `${mine}..origin/main`], { timeout: 8000 })).trim() || 0);
  const subjects = behind
    ? (await sh("git", ["-C", REPO, "log", "--no-merges", "--format=%s", `${mine}..origin/main`], { timeout: 8000 })).split("\n").filter(Boolean)
    : [];
  const { notes, quiet } = notesFromSubjects(subjects.map((subject) => ({ subject, pr: "" })));
  const branch = (await sh("git", ["-C", REPO, "rev-parse", "--abbrev-ref", "HEAD"], { timeout: 5000 })).trim();
  const stamped = stampedRelease();
  const head = mine === "HEAD" ? (await sh("git", ["-C", REPO, "rev-parse", "HEAD"], { timeout: 5000 })).trim() : mine;
  return {
    data: {
      behind: notes.length || behind,
      notes: notes.slice(0, 40),
      commits: notes.map((note) => note.text).slice(0, 12),
      quiet,
      branch,
      packaged: PACKAGED,
      repo: REPO,
      via: "git",
      tag: "",
      asset: "",
      mine: { ...stamped, sha: stamped.sha || head, branch }
    },
    tip
  };
}

async function checkUpdate(force) {
  const fresh = updateCache.data && Date.now() - updateCache.at < UPDATE_FRESH;
  if ((fresh && !force) || updateCache.running) return updateCache.data || emptyUpdate();
  updateCache.running = true;
  try {
    const published = await publishedUpdate();
    if (published) {
      updateCache = { at: Date.now(), data: published, running: false, remoteSha: "" };
      return published;
    }
    const fromGit = await gitUpdate();
    if (fromGit) updateCache = { at: Date.now(), data: fromGit.data, running: false, remoteSha: fromGit.tip };
  } catch {} finally {
    updateCache.running = false;
  }
  return updateCache.data || emptyUpdate();
}

function sweepStaging(keep) {
  try {
    for (const entry of readdirSync(STAGING)) {
      if (entry !== keep) rmSync(join(STAGING, entry), { recursive: true, force: true });
    }
  } catch {}
}

const sizeOf = (path) => { try { return statSync(path).size; } catch { return 0; } };

function watchDownload(zip, total) {
  updatePhase = { step: "downloading", done: 0, total };
  const tick = setInterval(() => { updatePhase = { step: "downloading", done: sizeOf(zip), total }; }, 400);
  return () => clearInterval(tick);
}

function leadBytes(file) {
  try {
    const fd = openSync(file, "r");
    const head = Buffer.alloc(4);
    readBytesSync(fd, head, 0, 4, 0);
    closeSync(fd);
    return head;
  } catch { return Buffer.alloc(0); }
}

function stageAppImage(file) {
  updatePhase = { step: "checking the download", done: 0, total: 0 };
  const head = leadBytes(file);
  if (head.length !== 4 || head[0] !== 0x7f || head.slice(1, 4).toString() !== "ELF") {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: "the download is not a Linux executable, so it stays where it is" };
  }
  try { chmodSync(file, 0o755); } catch {}
  updateCache = { at: 0, data: null, running: false, remoteSha: "" };
  updatePhase = { step: "restarting", done: 0, total: 0 };
  if (!process.env.HIVE_APP_BUNDLE) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { ok: true, note: `the new version is at ${file} — quit the app and put it in place of yours` };
  }
  setTimeout(() => console.log(`hive: update staged ${file}`), 400);
  return { ok: true };
}

function stageRpm(file) {
  updatePhase = { step: "checking the download", done: 0, total: 0 };
  const head = leadBytes(file);
  if (head.length !== 4 || head[0] !== 0xed || head[1] !== 0xab || head[2] !== 0xee || head[3] !== 0xdb) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: "the download is not an rpm package, so it stays where it is" };
  }
  updateCache = { at: 0, data: null, running: false, remoteSha: "" };
  updatePhase = { step: "restarting", done: 0, total: 0 };
  if (!process.env.HIVE_APP_BUNDLE) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { ok: true, note: `the new version is at ${file} — install it with sudo rpm -U --replacepkgs --oldpackage` };
  }
  setTimeout(() => console.log(`hive: update staged ${file}`), 400);
  return { ok: true };
}

function stageInstaller(file) {
  updatePhase = { step: "checking the download", done: 0, total: 0 };
  const head = leadBytes(file);
  if (head.length < 2 || head[0] !== 0x4d || head[1] !== 0x5a) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: "the download is not a Windows installer, so it stays where it is" };
  }
  updateCache = { at: 0, data: null, running: false, remoteSha: "" };
  updatePhase = { step: "restarting", done: 0, total: 0 };
  if (!process.env.HIVE_APP_BUNDLE) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { ok: true, note: `the new version is at ${file} — quit the app and run it` };
  }
  setTimeout(() => console.log(`hive: update staged ${file}`), 400);
  return { ok: true };
}

async function applyPack(state) {
  const into = jsRootOf(HIVE_HOME, state.tag);
  const stage = join(STAGING, state.tag);
  const pack = join(stage, state.asset);
  const sig = join(stage, signatureOf(state.asset));
  sweepStaging(state.tag);
  const stopWatching = watchDownload(pack, Number(state.assetSize || 0));
  const got = await shr(...inBash(downloadScript({ url: state.assetUrl, zip: pack })), { timeout: 600000 });
  stopWatching();
  if (!got.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the download failed: ${got.error.slice(0, 200)}` };
  }
  updatePhase = { step: "checking the signature", done: 0, total: 0 };
  const gotSignature = await shr(...inBash(downloadScript({ url: state.signatureUrl, zip: sig })), { timeout: 60000 });
  if (!gotSignature.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the signature of ${state.asset} did not come down, so it stays where it is` };
  }
  let signed = false;
  try { signed = verifyPack({ bytes: readFileSync(pack), signature: readFileSync(sig) }); } catch {}
  if (!signed) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `${state.asset} is not signed by the key this Hive was built with, so it stays where it is` };
  }
  updatePhase = { step: "unpacking", done: 0, total: 0 };
  const opened = await shr(...inBash(unpackPackScript({ pack, into, shipped: SHIPPED })), { timeout: 120000 });
  if (!opened.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `unpacking the download failed: ${opened.error.slice(0, 200)}` };
  }
  try {
    mkdirSync(dirname(CURRENT_JS), { recursive: true });
    writeFileSync(CURRENT_JS, `${JSON.stringify({ tag: state.tag, print: SHELL_PRINT, at: new Date().toISOString() }, null, 2)}\n`);
  } catch (wrong) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the new version unpacked but could not be pointed at: ${String(wrong.message || wrong).slice(0, 160)}` };
  }
  await shr(...inBash(sweepJsScript({ home: HIVE_HOME, keep: [basename(into), "current.json"] })), { timeout: 30000 });
  updateCache = { at: 0, data: null, running: false, remoteSha: "" };
  updatePhase = { step: "restarting", done: 0, total: 0 };
  setTimeout(() => console.log("hive: js update applied"), 400);
  return { ok: true };
}

async function applyPublished(state) {
  if (state.via === "pack" && state.asset && state.assetUrl && state.signatureUrl) return applyPack(state);
  if (!state.asset || !state.assetUrl) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the release ${state.tag} carries no ${RELEASE_ASSET} — that build has to be published before you can take it` };
  }
  sweepStaging(state.tag);
  const into = join(STAGING, state.tag);
  const zip = join(into, state.asset);
  const stopWatching = watchDownload(zip, Number(state.assetSize || 0));
  const got = await shr(...inBash(downloadScript({ url: state.assetUrl, zip })), { timeout: 1200000 });
  stopWatching();
  if (!got.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the download failed: ${got.error.slice(0, 200)}` };
  }
  if (state.asset.endsWith(".AppImage")) return stageAppImage(zip);
  if (state.asset.endsWith(".rpm")) return stageRpm(zip);
  if (state.asset.endsWith(".exe")) return stageInstaller(zip);
  updatePhase = { step: "unpacking", done: 0, total: 0 };
  const unpacked = join(into, "bundle");
  const opened = await shr(...inBash(unpackScript({ zip, into: unpacked })), { timeout: 300000 });
  if (!opened.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `unpacking the download failed: ${opened.error.slice(0, 200)}` };
  }
  const fresh = unpackedBundle(unpacked, existsSync(unpacked) ? readdirSync(unpacked) : [], existsSync);
  if (!fresh) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: "the download had no Hive.app inside it" };
  }
  if (!RELEASE_TEAM) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `this build was made outside the release line and carries no signing team, so there is nothing to check the download against — the release is unpacked at ${fresh}: quit the hive and put that Hive.app in place of yours` };
  }
  updatePhase = { step: "checking the signature", done: 0, total: 0 };
  const signed = await shr(...inBash(verifyScript({ bundle: fresh, team: RELEASE_TEAM })), { timeout: 120000 });
  if (!signed.ok) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { error: `the download is not a Hive signed by the team's certificate, so it stays where it is: ${signed.error.slice(0, 160)}` };
  }
  updateCache = { at: 0, data: null, running: false, remoteSha: "" };
  updatePhase = { step: "restarting", done: 0, total: 0 };
  if (!process.env.HIVE_APP_BUNDLE) {
    updatePhase = { step: "", done: 0, total: 0 };
    return { ok: true, note: `the new version is in ${unpacked} — quit the app and put it in place of yours` };
  }
  setTimeout(() => console.log(`hive: update staged ${fresh}`), 400);
  return { ok: true };
}


const SYNCABLE_REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

function gitSaid(error) {
  const lines = String(error || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /^(fatal|error):|denied|not found|authentication|could not/i.test(l)) || lines.pop() || "?";
}

function looseOf(porcelain, dir) {
  const fields = String(porcelain || "").split("\0");
  const copy = [];
  const gone = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (entry.length < 4) continue;
    const mark = entry[0];
    const path = entry.slice(3);
    if (mark === "R" || mark === "C") {
      const origin = fields[++i];
      if (origin && !existsSync(join(dir, origin))) gone.push(origin);
    }
    (existsSync(join(dir, path)) ? copy : gone).push(path);
  }
  const travels = (p) => p !== ".worktrees/" && p !== ".worktrees" && !p.startsWith(".worktrees/");
  return { copy: copy.filter(travels), gone: gone.filter(travels) };
}

const WT_LIST_FRESH = 60000;
const WT_MEASURE_FRESH = 600000;
const WT_IDLE_HOURS = 1;
const WT_SKIP = new Set([".git", "node_modules", ".next", "dist", "build", "target", "venv", ".venv", "vendor", "coverage", ".turbo", ".cache"]);

const WORKTREE_WALK = [
  'seen=""',
  'for dir in "$1"/*/; do',
  '  [ -e "$dir.git" ] || continue',
  '  common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || continue',
  '  case " $seen " in *" $common "*) continue ;; esac',
  '  seen="$seen $common"',
  '  printf "==repo\\t%s\\n" "$common"',
  '  git -C "$dir" worktree list --porcelain 2>/dev/null',
  '  echo ""',
  'done',
  'true'
].join("\n");

const WORKTREE_STATS = [
  'for p in "$@"; do',
  '  loose=$(git -C "$p" status --porcelain 2>/dev/null | wc -l | tr -d " ")',
  '  ahead=0',
  '  git -C "$p" rev-parse --quiet --verify "@{u}" >/dev/null 2>&1 && ahead=$(git -C "$p" log --oneline "@{u}..HEAD" 2>/dev/null | wc -l | tr -d " ")',
  '  printf "%s\\t%s\\t%s\\n" "$p" "$loose" "$ahead"',
  'done',
  'true'
].join("\n");

function readWorktreeWalk(raw) {
  const trees = [];
  let main = "";
  let repo = "";
  let at = null;
  const shut = () => { if (at) { trees.push(at); at = null; } };
  for (const line of String(raw || "").split("\n")) {
    if (line.startsWith("==repo\t")) {
      shut();
      main = line.slice(7).trim().replace(/\/?\.git\/?$/, "");
      repo = main.split("/").filter(Boolean).pop() || main;
      continue;
    }
    if (!line.trim()) { shut(); continue; }
    const [word, ...rest] = line.split(" ");
    const said = rest.join(" ").trim();
    if (word === "worktree") { shut(); at = { repo, main, path: said, branch: "", head: "", locked: false, gone: false }; continue; }
    if (!at) continue;
    if (word === "HEAD") at.head = said.slice(0, 8);
    else if (word === "branch") at.branch = said.replace(/^refs\/heads\//, "");
    else if (word === "locked") at.locked = true;
  }
  shut();
  return trees.filter((tree) => tree.path && tree.path !== tree.main);
}

function readWorktreeStats(raw) {
  const stats = new Map();
  for (const line of String(raw || "").split("\n")) {
    const fields = line.split("\t");
    if (fields.length < 3) continue;
    const ahead = fields.pop();
    const loose = fields.pop();
    const path = fields.join("\t");
    if (path) stats.set(path, { loose: Number(loose) || 0, ahead: Number(ahead) || 0 });
  }
  return stats;
}

function worktreeTouched(path) {
  let newest = 0;
  const look = (file) => { try { newest = Math.max(newest, statSync(file).mtimeMs); } catch {} };
  look(path);
  try {
    const said = readFileSync(join(path, ".git"), "utf8");
    const dir = said.replace(/^gitdir:\s*/, "").trim();
    if (dir) { look(join(dir, "HEAD")); look(join(dir, "logs/HEAD")); }
  } catch {}
  return Math.round(newest);
}

function newestUnder(path, budget) {
  let newest = 0;
  let entries = [];
  try { entries = readdirSync(path, { withFileTypes: true }); } catch { return 0; }
  for (const entry of entries) {
    if (budget.left <= 0) break;
    budget.left--;
    if (WT_SKIP.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) { newest = Math.max(newest, newestUnder(child, budget)); continue; }
    try { newest = Math.max(newest, statSync(child).mtimeMs); } catch {}
  }
  return Math.round(newest);
}

/* the four gates a worktree has to pass before anything deletes it — a seat sitting in it,
   a file nobody committed, a commit nobody pushed, a lock somebody put there on purpose */
function worktreeKeep(tree) {
  if (tree.seat) return "seat";
  if (tree.loose) return "loose";
  if (tree.ahead) return "ahead";
  if (tree.locked) return "locked";
  return "";
}

function worktreeRows(trees, { hours = WT_IDLE_HOURS, measured = new Map(), now = Date.now() } = {}) {
  const wait = Math.max(1, Number(hours) || WT_IDLE_HOURS) * 3600000;
  return trees.map((tree) => {
    const size = measured.get(tree.path);
    const touched = Math.max(Number(tree.touched) || 0, Number(size?.deep) || 0);
    const age = touched ? now - touched : 0;
    const keep = worktreeKeep(tree);
    const idle = !!tree.gone || (!tree.seat && !!touched && age >= wait);
    return { ...tree, bytes: tree.gone ? 0 : (size?.bytes ?? null), touched, age, keep, idle, sweep: idle && !keep };
  });
}

function worktreeSummary(rows) {
  const weigh = (list) => list.reduce((n, row) => n + (row.bytes || 0), 0);
  const sweep = rows.filter((row) => row.sweep);
  return {
    count: rows.length,
    idle: rows.filter((row) => row.idle).length,
    sweep: sweep.length,
    bytes: weigh(rows),
    idleBytes: weigh(sweep),
    sized: rows.every((row) => row.gone || row.bytes !== null)
  };
}

let wtCache = { at: 0, trees: [], running: null, measured: new Map(), measuredAt: 0, measuring: null };

async function seatFolders() {
  const live = await localWindows().catch(() => []);
  const rows = [];
  for (const { name } of live) {
    const seat = fleet.get(seatKey("local", name));
    for (const tree of trails.get(seat?.id)?.trees || []) if (tree.path) rows.push({ name, cwd: tree.path });
    try {
      const cwd = JSON.parse(readFileSync(join(HIVE_HOME, "sessions", `${name}.json`), "utf8")).cwd || "";
      if (cwd) rows.push({ name, cwd });
    } catch {}
  }
  return rows;
}

async function measureWorktrees(paths) {
  const measured = new Map();
  if (!paths.length) return measured;
  const raw = await sh(...inBash(`du -sk ${paths.map(quoted).join(" ")} 2>/dev/null`), { timeout: 300000 });
  const sizes = new Map();
  for (const line of String(raw || "").split("\n")) {
    const found = line.match(/^\s*(\d+)\s+(.+)$/);
    if (found) sizes.set(found[2].trim(), Number(found[1]) * 1024);
  }
  for (const path of paths) {
    measured.set(path, { bytes: sizes.has(path) ? sizes.get(path) : null, deep: newestUnder(path, { left: 60000 }), at: Date.now() });
  }
  return measured;
}

async function scanWorktrees() {
  const raw = await sh(...inBash(`set -- ${quoted(HUB)}\n${WORKTREE_WALK}`), { timeout: 90000 });
  const trees = readWorktreeWalk(raw);
  for (const tree of trees) tree.gone = !existsSync(tree.path);
  const here = trees.filter((tree) => !tree.gone);
  const stats = here.length
    ? readWorktreeStats(await sh(...inBash(`set -- ${here.map((tree) => quoted(tree.path)).join(" ")}\n${WORKTREE_STATS}`), { timeout: 120000 }))
    : new Map();
  const seats = await seatFolders();
  for (const tree of trees) {
    const stat = stats.get(tree.path) || { loose: 0, ahead: 0 };
    tree.loose = stat.loose;
    tree.ahead = stat.ahead;
    tree.touched = tree.gone ? 0 : worktreeTouched(tree.path);
    tree.seat = seats.find((seat) => seat.cwd === tree.path || seat.cwd.startsWith(`${tree.path}/`))?.name || "";
  }
  return trees;
}

async function readWorktrees(force) {
  if (!force && wtCache.at && Date.now() - wtCache.at < WT_LIST_FRESH) return wtCache.trees;
  if (!wtCache.running) {
    wtCache.running = scanWorktrees()
      .then((trees) => { wtCache = { ...wtCache, at: Date.now(), trees, running: null }; return trees; })
      .catch(() => { wtCache = { ...wtCache, running: null }; return wtCache.trees; });
  }
  return wtCache.at ? wtCache.trees : wtCache.running;
}

function keepMeasuring(force) {
  if (wtCache.measuring) return true;
  const paths = wtCache.trees.filter((tree) => !tree.gone).map((tree) => tree.path);
  const fresh = wtCache.measuredAt && Date.now() - wtCache.measuredAt < WT_MEASURE_FRESH;
  const missing = paths.filter((path) => !wtCache.measured.has(path));
  const again = force || !fresh;
  if (!again && !missing.length) return false;
  const wanted = again ? paths : missing;
  if (!wanted.length) return false;
  wtCache = { ...wtCache, measuring: measureWorktrees(wanted)
    .then((got) => {
      const measured = again ? new Map() : new Map(wtCache.measured);
      for (const [path, size] of got) measured.set(path, size);
      wtCache = { ...wtCache, measured, measuredAt: Date.now(), measuring: null };
    })
    .catch(() => { wtCache = { ...wtCache, measuring: null }; }) };
  return true;
}

async function worktreeReport({ force = false, hours = WT_IDLE_HOURS } = {}) {
  const trees = await readWorktrees(force);
  const measuring = keepMeasuring(force);
  const rows = worktreeRows(trees, { hours, measured: wtCache.measured });
  return { hub: HUB, hours, measuring, at: new Date().toISOString(), ...worktreeSummary(rows), trees: rows };
}

function worktreeBrief() {
  if (!wtCache.at) { readWorktrees(false).catch(() => {}); return null; }
  if (Date.now() - wtCache.at > WT_LIST_FRESH) readWorktrees(true).catch(() => {});
  keepMeasuring(false);
  return worktreeSummary(worktreeRows(wtCache.trees, { measured: wtCache.measured }));
}

async function dropWorktree(row) {
  const said = row.gone
    ? await shr("git", ["-C", row.main, "worktree", "prune"], { timeout: 60000 })
    : await shr("git", ["-C", row.main, "worktree", "remove", "--force", ...(row.locked ? ["--force"] : []), row.path], { timeout: 180000 });
  wtCache = { ...wtCache, at: 0 };
  if (!said.ok && (row.gone || existsSync(row.path))) return { error: gitSaid(said.error) };
  const measured = new Map(wtCache.measured);
  measured.delete(row.path);
  wtCache = { ...wtCache, measured };
  return { ok: true, path: row.path, bytes: row.bytes || 0 };
}

async function removeWorktree(path, force) {
  const rows = worktreeRows(await readWorktrees(true), { measured: wtCache.measured });
  const row = rows.find((one) => one.path === path);
  if (!row) return { error: "that folder is not a worktree this machine knows" };
  if (row.seat) return { error: `the seat ${row.seat} is working in it` };
  if (!force && row.keep) return { error: "it still holds work nobody kept" };
  return dropWorktree(row);
}

async function sweepWorktrees(hours) {
  const rows = worktreeRows(await readWorktrees(true), { hours, measured: wtCache.measured });
  const removed = [];
  const kept = [];
  for (const row of rows) {
    if (!row.idle) continue;
    if (!row.sweep) { kept.push({ path: row.path, repo: row.repo, branch: row.branch, keep: row.keep }); continue; }
    const said = await dropWorktree(row);
    if (said.ok) removed.push({ path: row.path, repo: row.repo, branch: row.branch, bytes: row.bytes || 0 });
    else kept.push({ path: row.path, repo: row.repo, branch: row.branch, error: said.error });
  }
  return { removed, kept, freed: removed.reduce((n, one) => n + one.bytes, 0) };
}









async function insideTheServer() {
  const server = await serverFor();
  if (!server) return null;
  const said = await server.client.get("/api/inside");
  return said.ok ? said.body : null;
}

let openPairing = null;

async function portariaDoor() {
  const server = await serverFor();
  return server ? { where: "cloud", server } : { where: "", server: null };
}

async function portariaState() {
  const door = await portariaDoor();
  const server = door.server;
  if (!server) return { error: "no server answered — neither the one that stays online nor the one on this machine" };

  const [devices, peers, invites, phones] = await Promise.all([
    server.client.get("/api/devices"),
    server.client.get("/api/peers"),
    server.client.get("/api/invites"),
    phoneBridge.devices()
  ]);

  const live = (devices.body?.devices || []).filter((d) => !d.revoked);
  const here = servers.identity.fingerprint;
  const rows = live.filter((d) => d.kind !== "peer").map((one) => ({ ...one, here: one.fingerprint === here, fromFile: !one.pairedAt && !one.lastSeen }));
  for (const one of phones.devices || []) {
    rows.push({ fingerprint: one.fingerprint, name: one.name, kind: "phone", pairedAt: one.pairedAt, lastSeen: one.lastSeen, online: !!one.online, revoked: false, here: false, fromFile: false });
  }

  const known = peers.body?.peers || [];
  const people = [
    ...known.map((one) => ({ fingerprint: one.fingerprint, name: one.name, knownAt: one.knownAt, fromFile: false })),
    ...live.filter((d) => d.kind === "peer" && !known.some((one) => one.fingerprint === d.fingerprint))
      .map((d) => ({ fingerprint: d.fingerprint, name: d.name, knownAt: d.pairedAt, fromFile: true }))
  ];

  if (openPairing && openPairing.expiresAt <= Date.now()) openPairing = null;

  return {
    door: door.where,
    me: peers.body?.me || null,
    devices: rows,
    peers: people,
    invites: invites.body?.invites || [],
    used: invites.body?.used || [],
    pairing: openPairing,
    phone: { ...phoneBridge.state(), error: phones.error || "" }
  };
}

async function portariaDo(op, data) {
  const { server } = await portariaDoor();
  if (!server) return { error: "no server answered — neither the one that stays online nor the one on this machine" };

  if (op === "pair") {
    const said = await phoneBridge.openCode();
    if (said.error) return { error: said.error };
    openPairing = { code: said.code, expiresAt: Number(said.expiresAt) || 0 };
    writeConfig({ phone: true }).catch(() => {});
    phoneBridge.tick().catch(() => {});
    return openPairing;
  }

  if (op === "unpair") {
    openPairing = null;
    return { closed: true };
  }

  if (op === "revoke") {
    const phones = await phoneBridge.devices();
    if ((phones.devices || []).some((one) => one.fingerprint === String(data.fingerprint || ""))) {
      const gone = await phoneBridge.revoke(String(data.fingerprint || ""));
      return gone.error ? { error: gone.error } : { revoked: true };
    }
    const said = await server.client.post("/api/devices/revoke", { fingerprint: String(data.fingerprint || "") });
    return said.ok ? { revoked: true } : { error: said.error || "that device would not go" };
  }

  if (op === "invite") {
    const said = await server.client.post("/api/invites", {});
    return said.ok ? { link: said.body.link, expiresAt: said.body.expiresAt } : { error: said.error || "no invite came out" };
  }

  if (op === "cancel") {
    const said = await server.client.post("/api/invites/cancel", { link: String(data.link || "") });
    return said.ok ? { cancelled: true } : { error: said.error || "that invite would not go" };
  }

  if (op === "forget") {
    const said = await server.client.post("/api/peers/forget", { fingerprint: String(data.fingerprint || "") });
    return said.ok ? { forgotten: true } : { error: said.error || "that peer would not go" };
  }

  if (op === "join") {
    const link = String(data.link || "").trim();
    if (!link) return { error: "no link to go in with" };
    const said = await server.client.post("/api/join", { link });
    return said.ok ? { joined: true, peer: said.body?.peer || null } : { error: said.error || "that link would not open" };
  }

  return { error: "no such thing to do" };
}


function invalidatePod() {
  podCache.at = 0;
  podUpCache = { at: 0, up: false, asking: null };
  cache.at = 0;
}

async function inPod(script, timeout = 30000) {
  return onTheServer(script, [], { timeout });
}

const RESTART_RC = `tmux kill-session -t rc 2>/dev/null
tmux new-session -d -s rc "export HOME=/workspace/home PATH=/workspace/npm-global/bin:\\$PATH; cd ${POD_HUB} 2>/dev/null || cd /workspace/hive; claude remote-control"
sleep 10
tmux send-keys -t rc y Enter 2>/dev/null
sleep 2
tmux capture-pane -t rc -p | tail -4`;

const CREDENTIAL_SAVED_PROBE = `home="$HOME"; [ -d /workspace/home ] && home=/workspace/home
[ -n "$(find "$home/.claude/.credentials.json" -mmin -2 2>/dev/null)" ] && grep -q accessToken "$home/.claude/.credentials.json" && echo ${CREDENTIAL_SAVED}`;

const OPEN_LOGIN = `tmux kill-session -t auth 2>/dev/null
tmux new-session -d -s auth "export HOME=/workspace/home PATH=/workspace/npm-global/bin:\\$PATH && claude auth login; sleep 900"
for i in $(seq 1 20); do
  sleep 2
  screen=$(tmux capture-pane -t auth -p -J 2>/dev/null)
  case "$screen" in *https://*) break;; esac
done
printf '%s\\n' "$screen"`;

const PRE_ACCEPT = `node -e 'const fs=require("fs");const p=process.env.HOME+"/.claude.json";let j={};try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}j.hasCompletedOnboarding=true;j.bypassPermissionsModeAccepted=true;j.projects=j.projects||{};for(const d of ["${POD_HUB}","/workspace/repos/${REPO_FOLDER}","/workspace/hive"])j.projects[d]=Object.assign({},j.projects[d]||{},{hasTrustDialogAccepted:true});fs.writeFileSync(p,JSON.stringify(j,null,2))'
node -e 'const fs=require("fs");const p=process.env.HOME+"/.claude/settings.json";let j={};try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}j.crossSessionInbound="accept";j.skipDangerousModePermissionPrompt=true;fs.writeFileSync(p,JSON.stringify(j,null,2))'`;

async function podAction(action, data) {
  if (action === "wake") {
    const r = await powerSwitch("up");
    invalidatePod();
    if (!r.ok) return { error: clusterSaid(r.error, "bring back up") };
    return { ok: true, message: "coming back up — takes 20 to 40 seconds" };
  }

  if (action === "restart") {
    const r = await powerSwitch("restart");
    invalidatePod();
    if (!r.ok) return { error: clusterSaid(r.error, "restart") };
    return { ok: true, message: "restarting — the server is back in about a minute" };
  }

  if (action === "control") {
    const r = await inPod(RESTART_RC, 60000);
    invalidatePod();
    return { ok: true, message: /Connected|Capacity/i.test(r.out) ? "remote control connected" : "remote control restarted" };
  }

  if (action === "env") {
    if (!existsSync(ENV_FILE)) return { error: `no .env at ${ENV_FILE}` };
    const r = await powerSwitch("env", ENV_FILE);
    invalidatePod();
    if (!r.ok) return { error: r.error.split("\n").filter(Boolean).pop() || "could not write the secret" };
    return { ok: true, message: "secret updated and the server is restarting" };
  }

  if (action === "login-start") {
    const r = await inPod(OPEN_LOGIN, 60000);
    const url = (r.out.match(/https:\/\/claude\.ai\/\S+/g) || []).pop() || (r.out.match(/https:\/\/\S*claude\S+/g) || []).pop();
    if (!url) return { error: "could not find the login url on the server screen — look at the terminal below" };
    return { ok: true, url: url.replace(/[),.]+$/, "") };
  }

  if (action === "login-cancel") {
    await inPod("tmux kill-session -t auth 2>/dev/null; true", 20000);
    return { ok: true };
  }

  if (action === "login-code") {
    const code = String(data.code || "").trim();
    if (!/^[A-Za-z0-9._#\-=]{6,500}$/.test(code)) return { error: "that code has a strange character — copy it from the page again" };
    const send = `tmux send-keys -t auth -l "$1"
sleep 2
tmux send-keys -t auth Enter
sleep 10
tmux capture-pane -t auth -p | tail -6
${CREDENTIAL_SAVED_PROBE}`;
    const r = await onTheServer(send, [code], { timeout: 60000 });
    if (!loginConfirmed(r.out)) {
      return { error: (r.out.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "the server did not confirm the login").slice(0, 160) };
    }
    await inPod(`${PRE_ACCEPT}\ntmux kill-session -t auth 2>/dev/null; true`, 40000);
    await inPod(RESTART_RC, 60000);
    invalidatePod();
    return { ok: true, message: "logged in; onboarding pre-accepted and remote control up" };
  }

  if (action === "sync-push") {
    const repo = String(data.repo || "");
    if (!SYNCABLE_REPO.test(repo) || repo.includes("..")) return { error: "that repo name cannot be right" };
    const dir = join(HUB, repo);
    if (!existsSync(join(dir, ".git"))) return { error: `${repo} is not a repo at the root of the hub` };
    if (!(await podUp())) return { error: "the server is asleep — wake it first" };
    const dest = `/workspace/repos/${repo}`;
    const twin = await onTheServer('test -e "$1/.git"', [dest], { timeout: 15000 });
    let cloned = false;
    if (!twin.ok) {
      const raw = (await sh("git", ["-C", dir, "remote", "get-url", "origin"], { timeout: 10000 })).trim();
      if (!raw) return { error: `${repo} has no origin remote — the pod would have nothing to clone from` };
      const origin = raw.replace(/^ssh:\/\/git@([^/]+)\//, "https://$1/").replace(/^git@([^:]+):/, "https://$1/");
      const branch = (await sh("git", ["-C", dir, "symbolic-ref", "--quiet", "--short", "HEAD"], { timeout: 10000 })).trim();
      let script = `git clone ${quoted(origin)} ${dest}`;
      if (branch) script += ` && (git -C ${dest} checkout ${quoted(branch)} >/dev/null 2>&1 || true)`;
      const clone = await inPod(script, 600000);
      if (!clone.ok) return { error: `the clone on the pod failed: ${gitSaid(clone.error)}` };
      cloned = true;
    }
    const status = await shr("git", ["-C", dir, "status", "--porcelain", "-z"], { timeout: 30000 });
    if (!status.ok) return { error: `git could not read ${repo}: ${status.error.split("\n").filter(Boolean)[0] || "?"}` };
    const { copy, gone } = looseOf(status.out, dir);
    if (!copy.length && !gone.length) {
      workspaceDomain.invalidateSync();
      return { ok: true, copied: 0, deleted: 0, message: cloned
        ? `${repo} is on the pod now — a fresh clone, with nothing loose to add`
        : `${repo} has nothing loose — every file is already committed` };
    }
    if (copy.length) {
      const list = join(tmpdir(), `hive-sync-${randomUUID()}`);
      await writeFile(list, copy.join("\0") + "\0");
      const packed = await shr(...inBash(`tar cf - -C ${JSON.stringify(dir)} --null -T ${JSON.stringify(asTheSystemWritesIt(list))} | base64`), { timeout: 300000, maxBuffer: 1 << 28 });
      await unlink(list).catch(() => {});
      if (!packed.ok) return { error: `the copy failed: ${gitSaid(packed.error)}` };
      const r = await onTheServer('base64 -d | tar xf - -C "$1"', [dest], { timeout: 300000, input: packed.out.replace(/\s/g, "") });
      if (!r.ok) return { error: `the copy failed: ${gitSaid(r.error)}` };
    }
    if (gone.length) {
      const list = join(tmpdir(), `hive-sync-${randomUUID()}`);
      await writeFile(list, gone.join("\0") + "\0");
      await unlink(list).catch(() => {});
      const r = await onTheServer('cd "$1" && printf %s "$2" | base64 -d | xargs -0 rm -f --',
        [dest, Buffer.from(gone.join("\0") + "\0", "utf8").toString("base64")], { timeout: 60000 });
      if (!r.ok) return { error: `the files landed, but deleting on the server what you deleted here failed: ${gitSaid(r.error)}` };
    }
    workspaceDomain.invalidateSync();
    const said = [`${copy.length} file${copy.length === 1 ? "" : "s"} copied to the pod`];
    if (gone.length) said.push(`${gone.length} removed there because they are gone here`);
    return { ok: true, copied: copy.length, deleted: gone.length, message: `${repo}: ${cloned ? "cloned on the pod, " : ""}${said.join(", ")}` };
  }

  return { error: "unknown action" };
}

const cloudReach = createReach({ serverFor: () => serverFor() });

const deploymentScript = (name) => (DEPLOYMENT_DIR && REPO ? join(REPO, DEPLOYMENT_DIR, "scripts", name) : "");
const askYourHost = (name, what) => {
  const script = deploymentScript(name);
  return script ? `run ${script}` : `ask whoever runs this server to ${what}`;
};

const ONBOARDED = join(HIVE_HOME, "onboarded");
const TOUR_FEEDBACK = join(HIVE_HOME, "tour-feedback.jsonl");

async function noteTourFeedback(b) {
  const stop = Number(b?.stop);
  if (!Number.isInteger(stop) || stop < 1 || stop > 40) return { error: "unknown stop" };
  const line = {
    at: new Date().toISOString(),
    stop,
    el: String(b?.el || "").slice(0, 60),
    title: String(b?.title || "").slice(0, 120),
    helpful: b?.helpful === true
  };
  try {
    await mkdir(HIVE_HOME, { recursive: true });
    await appendFile(TOUR_FEEDBACK, `${JSON.stringify(line)}\n`);
    return { ok: true };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}
/* infra/scripts/setup.sh is the mark that tells a checkout from an installed app,
   so the bundle carries the script under a name of its own instead: a copy under
   infra/ would make the doctor read the bundle as the checkout and go looking for
   the deployment scripts inside it. */
export const SETUP_IN_A_CHECKOUT = "../infra/scripts/setup.sh";
export const SETUP_IN_A_BUNDLE = "../setup/setup.sh";
const SETUP_SH = [SETUP_IN_A_CHECKOUT, SETUP_IN_A_BUNDLE].map((one) => join(HERE, one)).find(existsSync) || join(HERE, SETUP_IN_A_CHECKOUT);

const DEPS = [
  { name: "tmux", why: "every session lives in a tmux window", install: installCommand("tmux"), posixOnly: true },
  { name: "kubectl", why: "reaches a server hosted on kubernetes", install: installCommand("kubectl"), forCluster: true },
  { name: "aws", why: `the credential for a server on that cluster, profile ${AWS_PROFILE}`, install: installCommand("awscli"), forCluster: true },
  { name: "gh", why: "the PR panel, reviews and merges", install: installCommand("gh") },
  { name: "claude", why: "the sessions themselves — or codex, kimi, kiro, cursor or opencode, whichever the seats run on", install: "npm install -g @anthropic-ai/claude-code", forSeats: true }
];

const SEAT_AGENT_BINARIES = { codex: "codex", kimi: "kimi", kiro: "kiro-cli", cursor: "cursor-agent", opencode: "opencode" };

async function otherAgentsOnThisMachine() {
  const found = {};
  await Promise.all(Object.entries(SEAT_AGENT_BINARIES).map(async ([agent, binary]) => {
    const there = NATIVE
      ? await nativeRoom().program(binary).then((one) => ({ ok: !!one, out: one?.file || "" }))
      : await shr(...inBash(`command -v ${quoted(binary)}`), { timeout: 8000 });
    if (there.ok && there.out.trim()) found[agent] = there.out.trim().split("\n").pop();
  }));
  return found;
}

const DEV_NAME = /^[a-z][a-z0-9-]{1,29}$/;

function devSlug(text) {
  return String(text || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

async function which(cmd) {
  if (process.platform === "win32") {
    /* "bash" on a stock Windows PATH is the WSL launcher stub in System32, not Git
       Bash — command -v through it answers nothing unless a distro is set up. The
       app already carries a real Windows executable finder for seats; reuse it. */
    return pickWhere(await whereExe(process.env)(cmd));
  }
  const r = await shr("bash", ["-c", `command -v ${cmd}`], { timeout: 6000 });
  const line = r.out.trim().split("\n").pop() || "";
  return line.startsWith("/") ? line : "";
}

async function guessDev() {
  if (DEV) return DEV;
  const gh = await sh("gh", ["api", "user", "--jq", ".login"], { timeout: 6000 });
  const login = devSlug(gh.trim());
  if (login) return login;
  return devSlug(process.env.USER || "");
}

function guessHub() {
  if (HUB && existsSync(HUB)) return HUB;
  const above = join(HERE, "../..");
  if (HUB_MARKERS.some((file) => existsSync(join(above, file)))) return above;
  return HUB;
}

const HUB_MARKERS = ["hub.yaml", "CLAUDE.md", "AGENTS.md"];

function hubLooks(path) {
  const { path: folder, why } = hubPathFrom(path, homedir());
  if (why) return { ok: false, why };
  if (!folder || !existsSync(folder)) return { ok: false, why: "that folder does not exist" };
  return { ok: true, instructions: HUB_MARKERS.some((file) => existsSync(join(folder, file))), env: existsSync(join(folder, ".env")) };
}

async function localClaude() {
  const r = await shr(theClaude(), ["auth", "status"], { timeout: 12000 });
  const j = extractJson(r.out) || {};
  return { loggedIn: !!j.loggedIn, email: j.email || "" };
}

async function signatureLook(url, audience) {
  if (!url || !audience) return { ok: false, why: "the server named no key this machine can sign for" };
  const said = await createBrokerClient({ url, identity: servers.identity, audience }).me();
  if (said.ok) return { ok: true };
  if (said.status === 401 || said.status === 403) return { ok: false, why: "this machine's key is not one that server trusts yet" };
  return { ok: false, why: (said.error.split("\n").filter(Boolean).pop() || "the server did not answer").slice(0, 160) };
}

async function firstFlightAlive() {
  const local = await localWindows();
  return local.some((w) => w.name === FIRST_FLIGHT);
}

let machineCache = { at: 0, data: null };

async function machineLook() {
  if (machineCache.data && Date.now() - machineCache.at < (machineCache.data.ok ? 60000 : 8000)) return machineCache.data;
  const config = readHiveEnvConfig();
  const wantsServer = serverIsWanted(process.env, config);
  const wantsCluster = clusterIsWanted(process.env, config);
  const clusterNamed = !!(NS && CLUSTER && AWS_PROFILE);
  const askCluster = wantsCluster && clusterNamed;
  const unnamed = { ok: false, out: "", error: "this machine knows which pod is yours but not which cluster it is on — run setup.sh again to pick up your deployment's defaults" };
  const [deps, aws, cluster, gh, claude] = await Promise.all([
    Promise.all(DEPS.map(async (d) => ({ ...d, path: await which(d.name) }))),
    askCluster ? shr("aws", ["sts", "get-caller-identity", "--profile", AWS_PROFILE, "--output", "json"], { timeout: 15000 }) : (wantsCluster ? unnamed : { ok: true, out: "", error: "" }),
    askCluster ? powerSwitch("reachable") : (wantsCluster ? unnamed : { ok: true, out: "", error: "" }),
    shr("gh", ["api", "user", "--jq", ".login"], { timeout: 12000 }),
    localClaude()
  ]);
  const lastLine = (text) => (text.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "").slice(0, 160);
  const agents = await otherAgentsOnThisMachine();
  const anotherAgentHere = Object.keys(agents).length > 0;
  const machine = {
    wantsServer,
    wantsCluster,
    agents,
    deps: deps.map((d) => ({ name: d.name, ok: !!d.path, path: d.path, why: d.why, install: d.install, forCluster: !!d.forCluster, needed: d.posixOnly && process.platform === "win32" ? false : d.forCluster ? wantsCluster : d.forSeats ? !anotherAgentHere : true })),
    aws: { ok: aws.ok, needed: wantsCluster, profile: AWS_PROFILE, detail: aws.ok ? (extractJson(aws.out)?.Arn || "").split("/").slice(-1)[0] : lastLine(aws.error) },
    cluster: { ok: cluster.ok, needed: wantsCluster, named: clusterNamed, name: CLUSTER, namespace: NS, detail: cluster.ok ? `${CLUSTER} answers` : lastLine(cluster.error) },
    gh: { ok: gh.ok, detail: gh.ok ? lastLine(gh.out) : "gh auth login" },
    claude
  };
  machine.ok = machine.deps.every((d) => d.ok || !d.needed) && machine.gh.ok && (machine.claude.loggedIn || anotherAgentHere)
    && (!wantsCluster || (machine.aws.ok && machine.cluster.ok));
  machineCache = { at: Date.now(), data: machine };
  return machine;
}

function serverAddressOf(dev) {
  const asked = process.env.HIVE_SERVER_URL || readHiveEnvConfig().HIVE_SERVER_URL || "";
  return asked;
}

let onboardingCache = { at: 0, key: "", data: null };

async function onboardingState(query) {
  const dev = devSlug(query.dev || "") || DEV || (await guessDev());
  const typedHub = query.hub || guessHub();
  const hubPath = hubPathFrom(typedHub, homedir()).path || typedHub;
  const key = `${dev}|${typedHub}`;
  if (onboardingCache.data && onboardingCache.key === key && Date.now() - onboardingCache.at < 2500) return onboardingCache.data;

  const keyFile = join(HIVE_HOME, `key-${dev}`);
  const pub = existsSync(`${keyFile}.pub`) ? readFileSync(`${keyFile}.pub`, "utf8").trim() : "";

  const machine = await machineLook();

  const setup = {
    config: existsSync(HIVE_ENV_CONFIG) && DEV === dev,
    key: existsSync(keyFile) && !!pub,
    pub,
    line: pub ? `${dev} ${pub}` : ""
  };
  setup.ok = setup.config && setup.key;

  const wanted = machine.wantsServer;
  let server = { wanted, url: serverAddressOf(dev), answers: false, key: "", error: "" };
  let signature = { ok: false, why: wanted ? "waiting for the server" : "every seat runs on this machine" };
  let claudeOnServer = { loggedIn: false, remoteControl: false, plan: "" };
  if (wanted && server.url) {
    const asked = await askTheDoor(server.url);
    server = { ...server, answers: asked.ok, key: asked.fingerprint || "", error: asked.ok ? "" : asked.error };
    if (server.answers && setup.ok) {
      const [sig, state] = await Promise.all([signatureLook(server.url, server.key), insideTheServer()]);
      signature = sig;
      claudeOnServer = { loggedIn: !!state?.claude?.loggedIn, remoteControl: !!state?.remoteControl, plan: state?.claude?.plan || "" };
    }
  }

  const flight = await firstFlightAlive();
  const data = {
    dev, hub: hubPath, hubLooks: hubLooks(typedHub),
    wantsServer: wanted,
    machine, setup, server, signature, claudeOnServer, ownerKey: servers.identity?.publicSsh || "", serverGuide: SERVER_GUIDE,
    firstFlight: flight,
    finished: existsSync(ONBOARDED),
    sandbox: SANDBOX,
    at: new Date().toISOString()
  };
  onboardingCache = { at: Date.now(), key, data };
  return data;
}

function invalidateOnboarding() { onboardingCache.at = 0; machineCache.at = 0; }

async function runSetup(name, typedHub) {
  const dev = devSlug(name);
  if (!DEV_NAME.test(dev)) return { error: "the name needs 2 to 30 characters: lowercase letters, digits and hyphens" };
  const look = hubLooks(typedHub);
  if (!look.ok) return { error: look.why };
  const hubPath = hubPathFrom(typedHub, homedir()).path;
  /* plain "bash" resolves to the WSL launcher stub in System32 on a stock Windows
     PATH, not Git Bash — BASH is already resolved to the real one (or "" if
     genuinely missing), same as every other script this server runs */
  const r = await shr(BASH || "bash", [SETUP_SH, dev, hubPath], { timeout: 90000, env: { HIVE_HOME } });
  if (!r.ok) return { error: (r.error.split("\n").filter(Boolean).pop() || "setup.sh failed").slice(0, 200) };
  loadConfig();
  invalidateOnboarding();
  invalidatePod();
  doctor?.invalidateDoctor();
  const pub = readFileSync(join(HIVE_HOME, `key-${dev}.pub`), "utf8").trim();
  return { ok: true, dev, line: `${dev} ${pub}`, message: "key generated and hive installed" };
}


async function startFirstFlight(model, { language, newChat } = {}) {
  if (await firstFlightAlive()) return { ok: true, name: FIRST_FLIGHT, already: true };
  const bodyLike = { name: FIRST_FLIGHT, prompt: firstFlightMission(DEV || "you", { language, newChat }), where: "local", model: model || "", structured: true, agent: "claude" };
  const job = openJob(bodyLike);
  runJob(job, bodyLike);
  invalidateOnboarding();
  return { ok: true, id: job.id, name: job.name };
}

async function onboardingAction(action, data) {
  if (SANDBOX && ["authorize", "wake", "login-start", "login-code", "control"].includes(action)) {
    return { error: `sandbox: "${action}" would touch the real cluster — skipped` };
  }
  if (action === "setup") return runSetup(data.name, data.hub);
  if (action === "first-flight") return startFirstFlight(data.model, { language: data.language, newChat: data.newChat });
  if (action === "finish") {
    await mkdir(HIVE_HOME, { recursive: true });
    await writeFile(ONBOARDED, `${new Date().toISOString()}\n`);
    invalidateOnboarding();
    return { ok: true };
  }
  if (action === "reset") {
    try { await unlink(ONBOARDED); } catch {}
    invalidateOnboarding();
    return { ok: true };
  }
  if (["wake", "login-start", "login-code", "login-cancel", "control"].includes(action)) {
    const r = await podAction(action, data);
    invalidateOnboarding();
    doctor?.invalidateDoctor();
    return r;
  }
  return { error: "unknown action" };
}

const BODY_CEILING = 64 << 20;

async function body(req) {
  let s = "";
  for await (const p of req) {
    s += p;
    if (s.length > BODY_CEILING) { req.destroy(); return { oversized: true }; }
  }
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

const MONACO_TYPES = { js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", svg: "image/svg+xml", map: "application/json" };

const STATIC = {
  "/assets/experience.css": ["assets/experience.css", "text/css"],
  "/assets/raycast/foundation.css": ["assets/raycast/foundation.css", "text/css"],
  "/assets/raycast/top.css": ["assets/raycast/top.css", "text/css"],
  "/assets/raycast/rail.css": ["assets/raycast/rail.css", "text/css"],
  "/assets/raycast/tile.css": ["assets/raycast/tile.css", "text/css"],
  "/assets/raycast/tools.css": ["assets/raycast/tools.css", "text/css"],
  "/assets/raycast/overlays.css": ["assets/raycast/overlays.css", "text/css"],
  "/assets/raycast/panels.css": ["assets/raycast/panels.css", "text/css"],
  "/assets/raycast/browser.css": ["assets/raycast/browser.css", "text/css"],
  "/assets/raycast/micro.css": ["assets/raycast/micro.css", "text/css"],
  "/assets/raycast/structures.css": ["assets/raycast/structures.css", "text/css"],
  "/assets/structures/launcher.css": ["assets/structures/launcher.css", "text/css"],
  "/assets/structures/inbox.css": ["assets/structures/inbox.css", "text/css"],
  "/assets/structures/atmosphere.css": ["assets/structures/atmosphere.css", "text/css"],
  "/assets/structures/cockpit.css": ["assets/structures/cockpit.css", "text/css"],
  "/assets/structures/stage.css": ["assets/structures/stage.css", "text/css"],
  "/assets/structures/map.css": ["assets/structures/map.css", "text/css"],
  "/assets/structures/ember.css": ["assets/structures/ember.css", "text/css"],
  "/assets/structures/island.css": ["assets/structures/island.css", "text/css"],
  "/assets/pixel-icons.mjs": ["assets/pixel-icons.mjs", "text/javascript"],
  "/assets/slack-text.mjs": ["assets/slack-text.mjs", "text/javascript"],
  "/assets/markdown.mjs": ["assets/markdown.mjs", "text/javascript"],
  "/assets/drops.mjs": ["assets/drops.mjs", "text/javascript"],
  "/assets/slash-command.mjs": ["assets/slash-command.mjs", "text/javascript"],
  "/assets/said-lists.mjs": ["assets/said-lists.mjs", "text/javascript"],
  "/assets/pets/pets.mjs": ["assets/pets/pets.mjs", "text/javascript"],
  "/assets/pets/visitor.mjs": ["assets/pets/visitor.mjs", "text/javascript"],
  "/assets/i18n.mjs": ["assets/i18n.mjs", "text/javascript"],
  "/assets/page-map.mjs": ["assets/page-map.mjs", "text/javascript"],
  "/assets/avatar/avatar.mjs": ["assets/avatar/avatar.mjs", "text/javascript"],
  "/assets/avatar/avatar-play.mjs": ["assets/avatar/avatar-play.mjs", "text/javascript"],
  "/assets/pets/tamagotchi.mjs": ["assets/pets/tamagotchi.mjs", "text/javascript"],
  "/assets/pets/rally.mjs": ["assets/pets/rally.mjs", "text/javascript"],
  "/assets/pets/max-form.mjs": ["assets/pets/max-form.mjs", "text/javascript"],
  "/assets/mood.mjs": ["assets/mood.mjs", "text/javascript"],
  "/assets/themes.mjs": ["assets/themes.mjs", "text/javascript"],
  "/assets/ghostty/ghostty.mjs": ["assets/ghostty/ghostty.mjs", "text/javascript"],
  "/assets/ghostty/term.mjs": ["assets/ghostty/term.mjs", "text/javascript"],
  "/assets/ghostty/ghostty-vt.wasm": ["assets/ghostty/ghostty-vt.wasm", "application/wasm"],
  "/assets/ghostty/ghostty-write-pty.wasm": ["assets/ghostty/ghostty-write-pty.wasm", "application/wasm"],
  "/assets/ghostty/SymbolsNerdFontMono-Regular.woff2": ["assets/ghostty/SymbolsNerdFontMono-Regular.woff2", "font/woff2"],
  "/vendor/xterm.mjs": ["node_modules/@xterm/xterm/lib/xterm.mjs", "text/javascript"],
  "/vendor/addon-fit.mjs": ["node_modules/@xterm/addon-fit/lib/addon-fit.mjs", "text/javascript"],
  "/vendor/addon-web-links.mjs": ["node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs", "text/javascript"],
  "/vendor/xterm.css": ["node_modules/@xterm/xterm/css/xterm.css", "text/css"],
  "/assets/status-strip.mjs": ["assets/status-strip.mjs", "text/javascript"],
  "/assets/pollers.mjs": ["assets/pollers.mjs", "text/javascript"],
  "/assets/api.mjs": ["assets/api.mjs", "text/javascript"],
  "/assets/stt-sound.mjs": ["assets/stt-sound.mjs", "text/javascript"],
  "/assets/stt-worklet.mjs": ["assets/stt-worklet.mjs", "text/javascript"],
  "/assets/meeting-chunks.mjs": ["assets/meeting-chunks.mjs", "text/javascript"],
  "/assets/perf.mjs": ["assets/perf.mjs", "text/javascript"],
  "/assets/review-notes.mjs": ["assets/review-notes.mjs", "text/javascript"],
  "/assets/pr-page.mjs": ["assets/pr-page.mjs", "text/javascript"],
  "/assets/archive-search.mjs": ["assets/archive-search.mjs", "text/javascript"],
  "/assets/changes-view.mjs": ["assets/changes-view.mjs", "text/javascript"],
  "/assets/dist/hive.mjs": ["assets/dist/hive.mjs", "text/javascript"],
  "/assets/dist/hive.mjs.map": ["assets/dist/hive.mjs.map", "application/json"],
  "/assets/nudge.mp3": ["assets/nudge.mp3", "audio/mpeg"],
  "/assets/doctor-core.mjs": ["./doctor/doctor-core.mjs", "text/javascript"],
  "/assets/fonts/hack-regular.woff2": ["assets/fonts/hack-regular.woff2", "font/woff2"],
  "/assets/fonts/hack-bold.woff2": ["assets/fonts/hack-bold.woff2", "font/woff2"],
  "/assets/fonts/hack-italic.woff2": ["assets/fonts/hack-italic.woff2", "font/woff2"],
  "/assets/fonts/hack-bolditalic.woff2": ["assets/fonts/hack-bolditalic.woff2", "font/woff2"],
  "/assets/fonts/tektur.woff2": ["assets/fonts/tektur.woff2", "font/woff2"],
  "/assets/fonts/dmsans-normal-latin.woff2": ["assets/fonts/dmsans-normal-latin.woff2", "font/woff2"],
  "/assets/fonts/dmsans-normal-latin-ext.woff2": ["assets/fonts/dmsans-normal-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/dmsans-italic-latin.woff2": ["assets/fonts/dmsans-italic-latin.woff2", "font/woff2"],
  "/assets/fonts/dmsans-italic-latin-ext.woff2": ["assets/fonts/dmsans-italic-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/geist-normal-latin.woff2": ["assets/fonts/geist-normal-latin.woff2", "font/woff2"],
  "/assets/fonts/geist-normal-latin-ext.woff2": ["assets/fonts/geist-normal-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/inter-normal-latin.woff2": ["assets/fonts/inter-normal-latin.woff2", "font/woff2"],
  "/assets/fonts/inter-normal-latin-ext.woff2": ["assets/fonts/inter-normal-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/geistmono-normal-latin.woff2": ["assets/fonts/geistmono-normal-latin.woff2", "font/woff2"],
  "/assets/fonts/geistmono-normal-latin-ext.woff2": ["assets/fonts/geistmono-normal-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/ibmplexsans-normal-latin.woff2": ["assets/fonts/ibmplexsans-normal-latin.woff2", "font/woff2"],
  "/assets/fonts/ibmplexsans-normal-latin-ext.woff2": ["assets/fonts/ibmplexsans-normal-latin-ext.woff2", "font/woff2"],
  "/assets/fonts/ibmplexsans-italic-latin.woff2": ["assets/fonts/ibmplexsans-italic-latin.woff2", "font/woff2"],
  "/assets/fonts/ibmplexsans-italic-latin-ext.woff2": ["assets/fonts/ibmplexsans-italic-latin-ext.woff2", "font/woff2"]
};

/* ── the machine that owns the fleet, served from its own pod ──────────────────────────────
   The phone door runs inside the pod, and everything it needs about the machine at home is
   already on the disk next to it: the deck of cards that machine publishes, and the peeled
   conversation of whatever seat it lent. Nothing here reaches for the machine — it reads what
   arrived, and leaves a note for what it wants. */

const doctor = await import("./lib/doctor-client.mjs").catch(() => null);
doctor?.runFixesOnTheServer((script) => onTheServer(script, [], { timeout: doctor.FIX_TIMEOUT }));
const routes = [];
const on = (method, path, fn) => routes.push({ method, path, fn });
const answer = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const json = (o, code = 200) => {
    res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(o));
  };

  if (url.pathname.startsWith("/vendor/monaco/")) {
    const rel = url.pathname.slice("/vendor/monaco/".length);
    if (!rel || rel.includes("..") || rel.includes("\\")) { res.writeHead(404); return res.end(); }
    const file = join(HERE, "node_modules/monaco-editor/min/vs", rel);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MONACO_TYPES[rel.split(".").pop()] || "application/octet-stream", "cache-control": "max-age=86400" });
    return createReadStream(file).pipe(res);
  }

  if (STATIC[url.pathname]) {
    const [path, type] = STATIC[url.pathname];
    res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    return createReadStream(join(HERE, path)).pipe(res);
  }

  if (url.pathname.startsWith("/api/ext/") && await extensions.serve(req, res, url, json)) return;

  const hit = routes.find((r) => r.path === url.pathname && (r.method === null || r.method === req.method));
  if (hit) return hit.fn(req, res, url, json);

  try {
    const html = await readFile(join(HERE, "app.html"), "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html);
  } catch {
    res.writeHead(500);
    res.end("app.html not found");
  }
};

registerBrowserRoutes(on, { isSeatName, bodyOf: body, fleet, saveFiles, onTheServer, cloudReach, typeText });
registerDeviceRoutes(on, { isSeatName, bodyOf: body });
const prDomain = registerPrRoutes(on, { bodyOf: body, sh, shr, extractJson, languageOf, paintLines, liveSessions: () => cache.data?.sessions || [], transcriptOf: seatTranscript });
const workspaceDomain = registerWorkspaceRoutes(on, { sh, shr, inBash, podUp, onTheServer, hub: HUB, workspaceOf, readManifest, bodyOf: body, gitSaid });
registerHiveRoutes(on, { collect });
registerDraftRoutes(on, { bodyOf: body, HIVE_HOME, isSeatName, publish: async (name, text, at) => { await phoneBridge.sendDraft(name, text, at); } });
registerMcpRoutes(on, { bodyOf: body, isSeatName, mcpLogins, onTheServer, startMcpLogin });
registerFilesRoutes(on, { bodyOf: body, isSeatName, seatFiles, rankFiles, fileIndex, indexCache, rankIndex, searchCode, writeRepoFile, readRepoFile, languageOf, paintLines });
registerChangesRoutes(on, { bodyOf: body, isSeatName, seatChanges, seatDiff, discardChange, openChange });
registerConfigRoutes(on, { bodyOf: body, readConfig, writeConfig, shotsUsage: () => measureShots(SHOTS_DIR) });
const sttEngine = createSttEngine({ home: HIVE_HOME, log: (line) => console.log(line) });
const sttInstaller = createSttInstaller({ home: HIVE_HOME, engine: sttEngine, log: (line) => console.log(line) });
registerSttRoutes(on, {
  bodyOf: body,
  readConfig,
  engine: sttEngine,
  installer: sttInstaller,
  home: HIVE_HOME,
  onThePod: () => HIVE_HOME.startsWith("/workspace/"),
  log: (line) => console.log(line)
});
registerWorktreeRoutes(on, { bodyOf: body, worktreeReport, removeWorktree, sweepWorktrees, idleHours: WT_IDLE_HOURS });
registerUsageRoutes(on, { invalidateUsage: () => { usageCache = { ...usageCache, at: 0 }; }, readUsage, readClaudeLimits, tightestAccount });
const MEMORY_DEMO = process.env.HIVE_MEMORY_DEMO === "1";
const memoryAddress = () => MEMORY_SERVER_URL;
const memoryVaultHere = vaultFollowing(() => vaultAccount(HIVE_HOME, memoryOrigin(memoryAddress())));
const memoryLogin = MEMORY_DEMO
  ? createDemoLogin()
  : createMemoryLogin({ baseUrl: memoryAddress, vault: memoryVaultHere, clients: fileClientStore(join(HIVE_HOME, "memory-client.json")) });
registerMemoryRoutes(on, {
  bodyOf: body,
  login: memoryLogin,
  vault: memoryVaultHere,
  memories: createMemorySource({
    baseUrl: memoryAddress,
    demo: MEMORY_DEMO,
    login: memoryLogin,
    readToken: async () => {
      if (process.env[MEMORY_TOKEN_KEY]) return process.env[MEMORY_TOKEN_KEY];
      let token = "";
      if (ENV_FILE) try { token = readEnvFile(await readFile(ENV_FILE, "utf8"))[MEMORY_TOKEN_KEY] || ""; } catch {}
      return token || (MEMORY_DEMO ? "" : await memoryLogin.access());
    }
  })
});
registerHistoryRoutes(on, { isSeatName, paneHistory, readImage });
registerArtifactRoutes(on, { leafUrl: () => LEAF_URL, pullPage: (slug) => prDomain.pullPage(slug), bodyOf: body, isSeatName, keepArtifact, askedTab, mirrorToShelf, artifactIndex, artifactKey, keptArtifacts, ARTIFACT_HOME, readFileSync, join, canonicalLabel, SHELF_SLUG, TABS, readShelfPage, SHELF_HOME, shelfRepoUrl, shelfPull, shelfIndex, getDev: () => DEV, readShelfComments, commentOnShelf, settleShelfComment, withPinShim, seatIsOnAPage, whoIsOnThePage, publishPanel, keepPrintToShelf, readShelfFile, keepThumbOnShelf, readShelfThumb: (slug, tab, v) => readThumb(SHELF_HOME, slug, tab, v) });
registerErrandRoutes(on, { bodyOf: body, renameErrand, markSeen, HIVE_HOME, invalidateCollectionCache: () => { cache.at = 0; }, readErrands, liveSessions: () => cache.data?.sessions || [], archiveSeat });
registerTaskRoutes(on, {
  bodyOf: body,
  home: HIVE_HOME,
  me: () => DEV,
  shelf: { home: () => (shelfCloned ? SHELF_HOME : ""), turn: shelfTurn, pull: shelfPull, push: pushShelf },
  deliverSay,
  spawnSeat: async (asked) => {
    const job = openJob(asked);
    runJob(job, asked);
    return { name: job.name, id: job.id };
  },
  liveSeats: () => (cache.data?.sessions || []).map((seat) => seat.name),
  readErrands: () => readErrands(HIVE_HOME),
  prsOf: (name) => (cache.data?.sessions || []).find((seat) => seat.name === name)?.prs || [],
  taskHooks: { read: (asked) => extensions.tasksRead(asked), changed: (asked) => extensions.tasksChanged(asked) }
});
const meetingRoutes = registerMeetingRoutes(on, {
  bodyOf: body,
  home: HIVE_HOME,
  me: () => DEV,
  shelf: { home: () => (shelfCloned ? SHELF_HOME : ""), turn: shelfTurn, pull: shelfPull, push: pushShelf },
  readConfig,
  engine: sttEngine,
  people: async () => [...new Set(((await readTeam()).devs || []).map((one) => one?.dev).filter(Boolean))],
  onThePod: () => HIVE_HOME.startsWith("/workspace/"),
  captionAssets: join(HERE, "assets", "meet-captions"),
  aveiaUrl: () => AVEIA_URL,
  sock: () => SOCK,
  summarize: async ({ model, prompt, input }) => {
    const ask = summarizerCommand({ claude: theClaude(), model, prompt });
    const said = await shr(...viaBash(ask.exe, ask.args), { timeout: 300000, maxBuffer: 8 << 20, cwd: TEMP_DIR, input });
    if (!said.ok && !said.out) throw new Error(said.error || "the model did not answer");
    return said.out;
  },
  log: (line) => console.log(line)
});
const routines = registerRoutineRoutes(on, { bodyOf: body, home: HIVE_HOME, openJob, runJob, precheckRun: (line, timeout) => shr("bash", ["-lc", line], { timeout, cwd: HUB }), invalidate: () => { cache.at = 0; }, log: console.log });
extensions = await createExtensionRegistry({
  roots: [
    { origin: "built-in", dir: join(HERE, "extensions") },
    { origin: "hub", dir: HUB ? join(HUB, "extensions") : "" },
    { origin: "personal", dir: join(HIVE_HOME, "extensions") }
  ],
  config: (await readConfig()).config.extensions,
  stateDir: join(HIVE_HOME, "extension-state"),
  secretsFile: join(HIVE_HOME, "extension-secrets.json"),
  bodyOf: body,
  hubDir: HUB,
  log: console.log
}).load();
registerExtensionRoutes(on, { bodyOf: body, registry: extensions, readConfig, writeConfig, invalidateFleetCache: () => { cache.at = 0; }, store: createExtensionStore({ repo: EXTENSIONS_REPO, personalDir: join(HIVE_HOME, "extensions") }) });
registerSeatRoutes(on, { bodyOf: body, phoneBridgeFor: () => phoneBridge, openJob, runJob, readErrands, isSeatName, deliverSay, wakeAndWait, fleetTick, structuredSeat, typeText, deliverAnswer, saveFiles, bridgeFor: () => bridge, hiveHome: HIVE_HOME, serverFor, openShell, spawning, invalidateFleetCache: () => { cache.at = 0; }, renameSeat, cloudReach, killSeatWindow, historyClosedSeat, forgetSeat, seatLeftovers, removeWorktree, forgetShots, archiveSeat, reviveArchivedSeat, archivedSeats, saveArchivedSeats });
registerSlackRoutes(on, { bodyOf: body, isSeatName, bridgeFor: () => slackBridge, linkerFor: () => slackLinker });
registerThreadRoutes(on, { bodyOf: body, liveSessions: () => cache.data?.sessions || [], threadKey, threadCache, collectThreads, readThreadRegistry, writeThreadRegistry, replyOnSlack, reactOnSlack, markOnSlack, slackFileOut });
registerAccountRoutes(on, { bodyOf: body, settingsEffort, agentCatalog, readAccounts, readLedger, noteBack, hiveHome: HIVE_HOME, invalidateAccountCache: () => { accountCache = { at: 0, list: [] }; invalidateProviders(); }, runAccount });
registerProviderRoutes(on, { bodyOf: body, readProviders, runProvider, invalidateProviders });
registerArchiveRoutes(on, { scanHistory, searchArchive, previewSession, runSessionSync, configureSessionSync, bodyOf: body, localSyncState, existsSync, syncEngine, getSyncSuggestion: () => syncSuggestion, syncStatus, bringLocal, reviveSession });
registerUpdateRoutes(on, { checkUpdate, getUpdatePhase: () => updatePhase, whatLanded, markReleaseSeen, getLandedSha: () => landedCache?.sha, builtFrom: BUILT_FROM, applyPublished, repo: REPO, shr, viaBash, appDir: APP_DIR, releaseTeam: RELEASE_TEAM, resetUpdateCache: () => { updateCache = { at: 0, data: null, running: false }; }, packaged: PACKAGED, platform: process.platform, builtBundle, existsSync, readdirSync, join, appBundle: process.env.HIVE_APP_BUNDLE, schedule: setTimeout, log: console.log });
registerDoctorRoutes(on, { doctor, bodyOf: body, HIVE_HOME });
registerOnboardingRoutes(on, { bodyOf: body, invalidateOnboarding, onboardingState, onboardingAction, noteTourFeedback });
registerTeamRoutes(on, {
  bodyOf: body,
  getDev: () => DEV,
  devName: DEV_NAME,
  deliverSay,
  dropLive,
  followTeamNotes,
  isSeatName,
  keepOwed,
  keyboards,
  knocksWaiting,
  peerTakesKnocks,
  lendKeyboard,
  takeKeyboardBack,
  noteToPeer,
  onPeerSeat,
  owing,
  peerKeyOf,
  getPokers: () => POKERS,
  pokesWaiting,
  publishPanel,
  readHive,
  readTeam,
  refreshLentTurns,
  state: {
    get knocking() { return knocking; },
    set knocking(value) { knocking = value; },
    get poking() { return poking; },
    set poking(value) { poking = value; },
    get teamMoved() { return teamMoved; },
    set teamMoved(value) { teamMoved = value; }
  },
  tellTheAsker,
  turnsOfSeat
});
registerPortariaRoutes(on, { bodyOf: body, portariaState, portariaDo });
registerCanopyRoutes(on, { canopyStateOf, canopyLiveOf: () => canopyLive, isSeatName, newestCanopyTab, canopyCall });

const server = createServer(answer);
const pickProtocol = (offered) => (offered.has("hive") ? "hive" : false);

const wss = new WebSocketServer({ noServer: true, handleProtocols: pickProtocol });

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const name = url.searchParams.get("name");
  const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
  const cols = Number(url.searchParams.get("cols")) || 120;
  const rows = Number(url.searchParams.get("rows")) || 30;
  const root = url.searchParams.get("target") === "pod";
  const authId = url.searchParams.get("auth");
  if (authId) {
    if (!isProvider(authId)) { ws.send(`\r\n\x1b[31mno agent goes by ${authId}\x1b[0m\r\n`); return ws.close(); }
    if (NATIVE) return pipeNative(ws, AUTH_SESSION(authId), cols, rows, "the sign-in window is not open — start it from providers");
    const view = nextView(`auth-${authId}`);
    if (!(await openAuthMirror(view, authId))) {
      ws.send("\r\n\x1b[2mthe sign-in window is not open — start it from providers\x1b[0m\r\n");
      return ws.close();
    }
    return pipeTmux(ws, view, cols, rows);
  }
  if (!name && !root) return ws.close();
  if (!root && !isSeatName(name)) {
    ws.send("\r\n\x1b[31mthis seat has a name tmux cannot address\x1b[0m\r\n");
    return ws.close();
  }
  if (where === "cloud" || root) {
    const seat = root ? SERVER_CONSOLE : name;
    if (root) {
      const opened = await onCloudSeats("POST", "", { name: seat, kind: "shell" });
      if (!opened.ok && !/already a seat here/.test(opened.error)) {
        ws.send(`\r\n\x1b[31m${opened.error}\x1b[0m\r\n`);
        return ws.close();
      }
    }
    const overHttp = await cloudReach.terminal({ seat, cols, rows });
    if (overHttp.how === "http") { bridgeTerminal(ws, overHttp.url, { reconnectKey: RECONNECT_KEY }); return; }
    ws.send(`\r\n\x1b[31m${overHttp.error || cloudDoorTrouble()}\x1b[0m\r\n`);
    return ws.close();
  }

  const window = await localWindowNamed(name);
  if (!window || window.dead) {
    if (window?.dead) closeEndedSeat(name).catch(() => {});
    ws.send("\r\n\x1b[2m─ this seat is closed ─\x1b[0m\r\n");
    return ws.close();
  }

  if (NATIVE) return pipeNative(ws, name, cols, rows);
  const session = nextView(name);
  await openMirror(session, name);
  return pipeTmux(ws, session, cols, rows, name);
});

const SERVER_CANDIDATES = [
  process.env.HIVE_SERVER_DIR,
  join(HERE, "../server"),
  join(HUB, REPO_FOLDER, "server")
].filter(Boolean);
const serverReady = (c) => existsSync(join(c, "node_modules/@anthropic-ai/claude-agent-sdk"));
const SERVER_DIR = SERVER_CANDIDATES.find((c) => existsSync(join(c, "bridge.mjs")) && serverReady(c))
  || SERVER_CANDIDATES.find((c) => existsSync(join(c, "bridge.mjs")))
  || join(HERE, "../server");
const ENGINE_DIR = join(SERVER_DIR, "engine");

async function ensureLocalServerDeps() {
  if (serverReady(SERVER_DIR)) return;
  const r = await shr(...viaBash("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"]), { timeout: 240000, cwd: SERVER_DIR });
  console.log(r.ok ? `server deps installed in ${SERVER_DIR}` : `server deps missing in ${SERVER_DIR} and npm install failed: ${r.error.slice(0, 160)}`);
}
ensureLocalServerDeps().catch(() => {});
const bridge = await import(pathToFileURL(join(SERVER_DIR, "bridge.mjs")).href).catch(() => null);

const servers = createServers({
  home: HIVE_HOME,
  log: (line) => console.log(line)
});

const seats = createSessions({
  base: HIVE_HOME,
  driver: join(ENGINE_DIR, "driver.mjs"),
  onEvent: (name, event) => desk.deliver(name, event),
  transferValidate: async (agent, model) => {
    await providerReadyOrSay(agent);
    const models = await agentCatalog(agent);
    if (!models.some((row) => row.value === model)) throw new Error("choose an available model from the picker");
  },
  transferStart: async (name, meta) => {
    await hubEnvIntoTmux();
    await seatInATmuxWindow({ name, agent: meta.agent || "claude", model: meta.model, cwd: meta.cwd, resumeId: meta.session_id, account: meta.account, structured: true, compactAt: await autocompactNow() });
  },
  transferSignal: async (name) => {
    const signalled = NATIVE
      ? await nativeRoom().type(name, "\x03")
      : (await shr(TMUX, ["send-keys", "-t", `${LOCAL_SESSION}:=${name}`, "C-c"], { timeout: 4000 })).ok;
    if (!signalled) throw new Error("the old driver's window could not receive the shutdown signal");
  },
  transferStop: async (name) => {
    if (NATIVE) nativeRoom().kill(name);
    else await shr(TMUX, ["kill-window", "-t", `${LOCAL_SESSION}:=${name}`], { timeout: 4000 });
  },
  transferChanged: (name, meta) => {
    chosenModels.set(name, meta.model_id || meta.model || "");
    cache.at = 0;
  },
  log: (line) => console.log(`hive: ${line}`)
});
const desk = createDesk(seats, { base: HIVE_HOME, keep: keepShot });

let lastConfig = null;
const phoneBridge = createPhoneBridge({
  home: HIVE_HOME,
  identity: servers.identity,
  door: async () => { const one = await serverFor(); return one ? { url: one.url, audience: one.audience } : null; },
  seats: async () => {
    const { sessions: all } = await collect();
    return all.filter((one) => one.where === "local").map((one) => ({ name: one.name, title: one.title || one.name }));
  },
  profile: () => (lastConfig ? { avatar: lastConfig.avatar || "", wear: lastConfig.wear || "", language: lastConfig.language || "" } : null),
  draftOf: (name) => draftOf(HIVE_HOME, name),
  keepDraft: (name, text, at) => { keepDraft(HIVE_HOME, name, text, at); cache.at = 0; },
  enabled: async () => { const { config } = await readConfig(); lastConfig = config; return !!config.phone && !SANDBOX; },
  machineName: () => (lastConfig ? thisMachine(lastConfig) : String(hostname() || "mac").replace(/\.local$/i, "")),
  spawn: async (mission) => {
    const asked = { ...mission, structured: true };
    const job = openJob(asked);
    await runJob(job, asked);
    return job.step === "failed" ? { error: job.error } : { id: job.id, name: job.name, where: job.where };
  },
  answer: async (kind, payload) => {
    if (kind === "shelf") {
      const slug = String(payload.slug || "");
      if (!SHELF_SLUG.test(slug)) return { error: "that is not a page on the shelf" };
      const tab = TABS.includes(payload.tab) ? payload.tab : TABS[0];
      const v = Number(payload.v) || 0;
      let page = readShelfPage(SHELF_HOME, slug, tab, v);
      if (page.error) {
        await shelfPull().catch(() => {});
        page = readShelfPage(SHELF_HOME, slug, tab, v);
      }
      return page.error ? { error: page.error } : { html: page.html, slug, tab, v };
    }
    if (kind === "files") {
      const name = String(payload.seat || "");
      if (!isSeatName(name)) return { error: "that is not a seat name" };
      const where = payload.where === "cloud" ? "cloud" : "local";
      try { return { files: rankFiles(await seatFiles(name, where), String(payload.q || "")).slice(0, 30) }; }
      catch (wrong) { return { files: [], error: String(wrong?.message || wrong).slice(0, 160) }; }
    }
    if (kind === "people") {
      const team = await readTeam();
      return { people: (team.devs || []).map((one) => ({ name: one.dev, up: !!one.up, needs: Number(one.needs) || 0, seats: Array.isArray(one.seats) ? one.seats.length : 0, mine: !!one.mine })) };
    }
    if (kind === "providers") {
      const list = await readProviders();
      const agents = list.filter((one) => one.enabled).map((one) => ({ id: one.id, label: one.label, name: one.name, ready: !!one.ready, why: one.why || "", accounts: (one.accounts || []).map((account) => ({ name: account.name, loggedIn: !!account.loggedIn })) }));
      const models = {};
      for (const one of agents.filter((agent) => agent.ready)) {
        try { models[one.id] = (await agentCatalog(one.id)).slice(0, 80).map((m) => ({ value: m.value, label: m.label, group: m.group || "", efforts: (m.efforts || []).map((e) => (typeof e === "string" ? e : e?.value)).filter(Boolean), defaultEffort: m.defaultEffort || "", isDefault: !!m.isDefault })); }
        catch (wrong) { models[one.id] = []; }
      }
      return { agents, models, defaultAgent: (agents.find((agent) => agent.ready) || agents[0])?.id || "claude" };
    }
    return { error: "this computer does not answer that" };
  },
  log: (line) => console.log(`hive: ${line}`)
});

const slackBridge = createSlackBridge({
  home: HIVE_HOME,
  keysOf: () => slackKeys({ env: process.env, envFile: ENV_FILE, home: HIVE_HOME }),
  openChat: async ({ prompt, errand }) => {
    const asked = { prompt, errand, structured: true, where: "local" };
    const job = openJob(asked);
    await runJob(job, asked);
    return job.step === "failed" ? { error: job.error } : { name: job.name, where: job.where };
  },
  say: (seat, text) => deliverSay(seat, "slack", "", text),
  socketImpl: WebSocket,
  log: (line) => console.log(`hive: ${line}`)
});

const slackLinker = createSlackLinker({
  home: HIVE_HOME,
  relayOf: () => relayOf({ env: process.env, config: readHiveEnvConfig() }),
  log: (line) => console.log(`hive: ${line}`)
});

on("GET", "/api/seat/earlier", async (req, res, url, json) => {
  const name = url.searchParams.get("name") || "";
  const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
  const before = Number(url.searchParams.get("before")) || 0;
  const turns = Number(url.searchParams.get("turns")) || 0;
  if (!isSeatName(name)) return json({ error: "this seat has a name the driver cannot address" }, 400);
  if (!before) return json({ error: "earlier than what — a seq is needed" }, 400);
  const door = where === "local" ? desk : await serverFor();
  if (!door) return json({ error: where === "cloud" ? cloudDoorTrouble() : "this hive has no server for that side yet" }, 503);
  const held = await door.client.get(`/api/sessions/${encodeURIComponent(name)}/events?from=0&window=all&before=${before}&turns=${turns}`);
  if (!held.ok) return json({ error: held.error || "the server did not answer for this seat" }, 502);
  return json({ events: held.body?.events || [], earlier: !!held.body?.earlier, first: held.body?.first || 0 });
});
const streams = new Map();

function streamFor(one) {
  if (streams.has(one.where)) return streams.get(one.where);
  const stream = attachServerStream({
    identity: servers.identity,
    audience: one.audience,
    url: one.url || "",
    socket: one.socket || "",
    warn: (why) => console.log(`hive: ${one.where} — ${why}`)
  });
  streams.set(one.where, stream);
  return stream;
}

let doorComplaint = "";
const cloudDoorSaid = (why) => {
  if (doorComplaint === why) return;
  doorComplaint = why;
  console.log(`hive: the cloud door did not answer — ${why}`);
};

/* the reason the door gave is the whole diagnosis, and it used to end in this
   process's log, where nobody looks. A seat that cannot be reached says it. */
function cloudDoorTrouble() {
  const where = readHiveEnvConfig().HIVE_SERVER_URL || process.env.HIVE_SERVER_URL || "";
  if (!where) return NO_ADDRESS;
  const why = doorComplaint || "it answered nothing, and said nothing about why";
  return `no server answers at ${where} — ${why}`;
}

const DOOR_FRESH = 30000;
let doorCache = { at: 0, server: null };
let hiveName = "";

function myHiveName() {
  return hiveName;
}

async function whoAmI() {
  if (hiveName) return hiveName;
  await serverFor();
  return hiveName;
}

async function serverFor() {
  if (doorCache.server && Date.now() - doorCache.at < DOOR_FRESH) {
    return { ...doorCache.server, stream: streamFor(doorCache.server) };
  }
  const found = await findCloudServer({
    env: { ...readHiveEnvConfig(), ...(process.env.HIVE_SERVER_URL ? { HIVE_SERVER_URL: process.env.HIVE_SERVER_URL } : {}) },
    read: () => (existsSync(HIVE_ENV_CONFIG) ? readFileSync(HIVE_ENV_CONFIG, "utf8") : ""),
    write: (text) => writeFileSync(HIVE_ENV_CONFIG, text)
  });
  if (found.error) { doorCache = { at: 0, server: null }; cloudDoorSaid(found.error); return null; }
  const one = await servers.remote("cloud", { url: found.url, audience: found.key });
  if (!one) { doorCache = { at: 0, server: null }; cloudDoorSaid(`${found.url || "the door"} named no key I can sign for`); return null; }
  doorComplaint = "";
  if (found.name) hiveName = found.name;
  doorCache = { at: Date.now(), server: one };
  return { ...one, stream: streamFor(one) };
}

/* the new-chat box asks the same question a live seat asks: what can this agent
   actually run here. The claude catalogue needs a session, so it is answered by
   the seat itself — here we only serve the two that answer from the CLI. */
const catalogCache = new Map();

async function agentCatalog(agent) {
  const kept = catalogCache.get(agent);
  if (kept && Date.now() - kept.at < 300000) return kept.models;
  await providerReadyOrSay(agent);
  const mod = await import(pathToFileURL(join(ENGINE_DIR, "agents.mjs")).href).catch(() => null);
  if (!mod) throw new Error(`this hive cannot reach its engine — looked in ${ENGINE_DIR}`);
  const models = agent === "claude" ? await claudeCatalog(mod) : await otherAgentCatalog(mod, agent);
  catalogCache.set(agent, { at: Date.now(), models });
  return models;
}

async function otherAgentCatalog(mod, agent) {
  const spec = mod.agents?.[agent];
  if (!spec?.listCatalog) throw new Error(`this hive's driver cannot list ${agent} models — update it`);
  return spec.listCatalog({ run: catalogRun, rpc: catalogRpc });
}

/* claude only answers what it can run from inside a session, so the box borrows
   one: no prompt is ever sent to it and it is closed as soon as it has spoken. */
async function claudeCatalog(mod) {
  if (!mod.normalizeClaudeModels) throw new Error("this hive's driver is too old to list claude models — update it");
  const sdk = await import(pathToFileURL(join(SERVER_DIR, "node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs")).href);
  const idle = (async function* () {})();
  const session = sdk.query({ prompt: idle, options: { cwd: HUB, permissionMode: "bypassPermissions" } });
  try {
    return mod.normalizeClaudeModels(await session.supportedModels());
  } finally {
    try { await session.interrupt(); } catch {}
  }
}

/* what a seat runs at when nobody chose a level: the same settings files Claude
   Code reads. Answers for seats whose driver is too old to say it themselves. */
async function settingsEffort() {
  const mod = await import(pathToFileURL(join(ENGINE_DIR, "agents.mjs")).href).catch(() => null);
  if (!mod?.effortFromSettings) return "";
  const files = [
    join(process.env.CLAUDE_CONFIG_DIR || join(HOME, ".claude"), "settings.json"),
    join(HUB, ".claude", "settings.json"),
    join(HUB, ".claude", "settings.local.json"),
  ];
  const texts = [];
  for (const file of files) {
    try { texts.push(await readFile(file, "utf8")); } catch { texts.push(""); }
  }
  return mod.effortFromSettings(texts);
}

const catalogRun = (bin, args) => runProviderCatalog(bin, args, HUB);
const catalogRpc = (bin, args, use, env) => rpcProviderCatalog(bin, args, use, env, HUB);

const eventsWss = new WebSocketServer({ noServer: true, handleProtocols: pickProtocol });

const climb = (req, socket, head) => {
  const asked = new URL(req.url, "http://localhost");
  const target = asked.pathname === "/pty" ? wss : asked.pathname === "/events" ? eventsWss : null;
  if (!target) return socket.destroy();
  target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
};

server.on("upgrade", climb);

eventsWss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const name = url.searchParams.get("name");
  const where = url.searchParams.get("where") === "cloud" ? "cloud" : "local";
  const from = Number(url.searchParams.get("from")) || 0;
  const asked = url.searchParams.get("window");
  const window = asked === "tail" || asked === "turns" ? asked : "all";
  const turns = Number(url.searchParams.get("turns")) || 0;
  const refuse = (error) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ bridge_reply: { ok: false, error }, cid: null }));
    ws.close();
  };
  if (!isSeatName(name)) return refuse("this seat has a name the driver cannot address");
  if (!bridge) return refuse(`bridge.mjs not found — looked in ${SERVER_DIR}`);

  seatThroughServer(ws, { where, name, from, window, turns, refuse });
});

async function seatThroughServer(ws, { where, name, from, window = "all", turns = 0, refuse }) {
  const door = where === "local" ? desk : await serverFor();
  if (!door) return refuse(where === "cloud" ? cloudDoorTrouble() : "this hive has no server for that side yet");

  const seat = attachSeat({
    client: door.client,
    stream: door.stream,
    name,
    from,
    window,
    turns,
    send: (line) => { if (ws.readyState === 1) ws.send(line); }
  });
  ws.on("message", (raw) => seat.command(raw.toString()));
  ws.on("close", () => seat.stop());
}

process.on("exit", killOwnHelpers);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const SOCK = process.env.HIVE_SOCK || socketPathFor({ home: HIVE_HOME, hub: HUB });

function leaveTheDoorToTheOtherHive() {
  console.error(`another hive already answers at ${SOCK}; this one drives no fleet and is leaving`);
  process.exit(ANOTHER_HIVE_OWNS_THE_PORT);
}

function tryTheDoor() {
  return new Promise((claimed, taken, broke) => {
    const lost = (wrong) => {
      if (wrong?.code === "EADDRINUSE") return claimed(false);
      broke ? broke(wrong) : claimed(false);
    };
    server.once("error", lost);
    server.listen(SOCK, () => {
      server.removeListener("error", lost);
      if (!isNamedPipe(SOCK)) { try { chmodSync(SOCK, 0o600); } catch {} }
      claimed(true);
    });
  });
}

async function claimDoor() {
  mkdirSync(HIVE_HOME, { recursive: true });
  let mine = await tryTheDoor();
  if (!mine) {
    if (await whoHasTheDoor(SOCK) === "another hive") leaveTheDoorToTheOtherHive();
    sweepStale(SOCK);
    mine = await tryTheDoor();
    if (!mine) leaveTheDoorToTheOtherHive();
  }
  console.log(`hive at ${SOCK} — no port, nothing on the network`);
  console.log(`hub ${HUB} · server ${readHiveEnvConfig().HIVE_SERVER_URL || "(none)"} · pty over websocket, no ttyd`);
  canopyPoll();
}

if (!PACKAGED) await rebuildWhenStale(HERE);
await claimDoor();

if (!NATIVE) await sh("bash", ["-c", `chmod +x ${JSON.stringify(join(HERE, "node_modules/node-pty/prebuilds"))}/*/spawn-helper 2>/dev/null; true`], { timeout: 5000 });
await sh("tmux", ["set-window-option", "-g", "aggressive-resize", "on"], { timeout: 3000 });

if (!process.env.HIVE_NO_SWEEP && OWNS_FLEET) sweepStrandedMirrors().catch(() => {});
if (!process.env.HIVE_NO_SWEEP && OWNS_FLEET) sweepStrandedHelpers().catch(() => {});
if (!process.env.HIVE_NO_SWEEP && OWNS_FLEET) sweepLive().catch(() => {});
if (!process.env.HIVE_NO_SWEEP) sweepOldShots().catch(() => {});
await loadTitles();
await loadFleet();
await loadArchivedSeats();
mirrorFleetToTheBox();
await reconcileLocalFleet().catch(() => {});
tellSeatsNobodyLooksYet();
if (!SANDBOX && CLOUD) (async () => { if (await podUp()) await ensurePodServer(); })().catch(() => {});
if (!SANDBOX) ensurePeerTools("local").catch(() => {});
hubEnvIntoTmux().catch(() => {});
keepAutopushAlive().catch(() => {});
mirrorMemory().catch(() => {});
publishPanel().catch(() => {});
setInterval(() => { publishPanel().catch(() => {}); }, 30000);
if (!SANDBOX) { phoneBridge.tick().catch(() => {}); setInterval(() => { phoneBridge.tick().catch(() => {}); }, 5000); }
if (!SANDBOX) { slackBridge.tick().catch(() => {}); setInterval(() => { slackBridge.tick().catch(() => {}); }, 5000); }
recallOwed();
followTeamNotes().catch(() => {});
setInterval(() => { followTeamNotes().catch(() => {}); }, 30000);
setInterval(() => { drainOutHere().catch(() => {}); }, 2000);
setInterval(() => { collectAnswers().catch(() => {}); }, 5000);
fleetTick().catch(() => {});
setInterval(() => { fleetTick().catch(() => {}); }, 20000);
setInterval(() => { routines.tick().catch(() => {}); }, 30000);
setInterval(() => { meetingRoutes.sweep().catch(() => {}); }, 10000).unref();
if (!process.env.HIVE_NO_SWEEP && OWNS_FLEET) setInterval(() => { closeQuietSeats().catch(() => {}); }, QUIET_SWEEP_EVERY_MS);
if (!process.env.HIVE_NO_SWEEP && OWNS_FLEET) setInterval(() => { pruneQuietDiaries().catch(() => {}); }, QUIET_SWEEP_EVERY_MS);

setInterval(() => { mirrorMemory().catch(() => {}); }, 600000);


scanHistory({}).catch(() => {});
setInterval(() => { scanHistory({}).catch(() => {}); }, 300000);


fileIndex("local").catch(() => {});

await ensureConfigFile();
