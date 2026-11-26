import { isFaceKey, isRetiredWear, parseWear, wearKey } from "../assets/avatar/avatar.mjs";
import { AUTOCOMPACT_AUTO, AUTOCOMPACT_FLOOR_K, AUTOCOMPACT_CEILING_K, PROMPT_SUGGESTIONS_ENV, CODE_MODE_ENV, autocompactThousands } from "../../server/engine/agents.mjs";
import { STT_DEFAULT_MODEL, STT_MODELS } from "./stt-download.mjs";
import { cleanQuietDays } from "./quiet-seats.mjs";
import { cleanDiaryDays } from "./diary-prune.mjs";
import { cleanMeetingSettings } from "./meetings.mjs";
import { TITLE_INSTRUCTIONS_CEILING, TITLE_PROJECTS_CEILING, TITLE_PROJECT_NAME_CEILING, noTitleInstructions } from "../assets/title-instructions.mjs";
import { cleanThreads } from "../assets/thread-rules.mjs";
import { PR_VIEWS_MAX, PR_VIEW_FILTERS, PR_VIEW_NAME_MAX, PR_VIEW_QUERY_MAX, cleanPrView } from "../assets/pr-views.mjs";
import { cleanBehaviorPatch } from "./behavior-config.mjs";
import { themeCssProblem } from "../assets/theme-css.mjs";

export const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export const FONT_DEFAULTS = {
  sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  terminalSize: 12,
  chatLineHeight: 1.55,
  chatSpacing: 10
};
const TERMINAL_SIZE_RANGE = [8, 32];
export const FONT_AREAS = ["prompt", "code", "terminal"];
export const FONT_AREA_SIZES = { promptSize: [10, 24], codeSize: [9, 24] };
export const FONT_SMOOTHING_CHOICES = ["auto", "thin"];
export const CHAT_LINE_HEIGHT_RANGE = [1, 2.5];
export const CHAT_SPACING_RANGE = [0, 40];

export const GITHUB_REPO_URL = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

export function githubRepoOf(url) {
  const m = String(url || "").trim().match(GITHUB_REPO_URL);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : "";
}

export function sameGithubRepo(a, b) {
  const one = githubRepoOf(a);
  return !!one && one === githubRepoOf(b);
}

export function cleanFont(raw, where, problems) {
  const font = { ...FONT_DEFAULTS };
  if (raw === undefined) return font;
  if (!isPlainObject(raw)) { problems.push(`${where}: font should be an object`); return font; }
  for (const family of ["sans", "mono"]) {
    const value = raw[family];
    if (value === undefined) continue;
    if (typeof value === "string" && value.trim()) font[family] = value.trim();
    else problems.push(`${where}: font.${family} should be a non-empty string`);
  }
  if (raw.terminalSize !== undefined) {
    const [low, high] = TERMINAL_SIZE_RANGE;
    if (typeof raw.terminalSize === "number" && raw.terminalSize >= low && raw.terminalSize <= high) font.terminalSize = raw.terminalSize;
    else problems.push(`${where}: font.terminalSize should be a number between ${low} and ${high}`);
  }
  if (raw.chatLineHeight !== undefined) {
    const [low, high] = CHAT_LINE_HEIGHT_RANGE;
    if (typeof raw.chatLineHeight === "number" && raw.chatLineHeight >= low && raw.chatLineHeight <= high) font.chatLineHeight = raw.chatLineHeight;
    else problems.push(`${where}: font.chatLineHeight should be a number between ${low} and ${high}`);
  }
  if (raw.chatSpacing !== undefined) {
    const [low, high] = CHAT_SPACING_RANGE;
    if (typeof raw.chatSpacing === "number" && raw.chatSpacing >= low && raw.chatSpacing <= high) font.chatSpacing = Math.round(raw.chatSpacing);
    else problems.push(`${where}: font.chatSpacing should be a number between ${low} and ${high}`);
  }
  for (const area of FONT_AREAS) {
    const value = raw[area];
    if (value === undefined) continue;
    if (typeof value === "string" && value.trim()) font[area] = value.trim();
    else problems.push(`${where}: font.${area} should be a non-empty string`);
  }
  for (const [field, [low, high]] of Object.entries(FONT_AREA_SIZES)) {
    const value = raw[field];
    if (value === undefined) continue;
    if (typeof value === "number" && value >= low && value <= high) font[field] = Math.round(value);
    else problems.push(`${where}: font.${field} should be a number between ${low} and ${high}`);
  }
  if (raw.smoothing !== undefined) {
    if (FONT_SMOOTHING_CHOICES.includes(raw.smoothing)) font.smoothing = raw.smoothing;
    else problems.push(`${where}: font.smoothing should be ${FONT_SMOOTHING_CHOICES.join(", ")}`);
  }
  return font;
}

export function fontPatchOf(font) {
  const kept = { sans: font.sans, mono: font.mono, terminalSize: font.terminalSize, chatLineHeight: font.chatLineHeight, chatSpacing: font.chatSpacing };
  for (const field of [...FONT_AREAS, ...Object.keys(FONT_AREA_SIZES), "smoothing"]) if (font[field] !== undefined) kept[field] = font[field];
  return kept;
}

export function cleanKeys(raw, where, problems) {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) { problems.push(`${where}: keys should be an object of action -> key`); return {}; }
  const keys = {};
  for (const [action, key] of Object.entries(raw)) {
    if (typeof key === "string" && key.trim()) keys[action] = key.trim();
    else problems.push(`${where}: keys.${action} should be a non-empty string`);
  }
  return keys;
}

export function cleanSound(raw, where, problems) {
  if (raw === undefined) return false;
  if (typeof raw === "boolean") return raw;
  problems.push(`${where}: sound should be true or false`);
  return false;
}

const NOTICE_KINDS = ["needs", "answered", "asked"];
const VOLUME_RANGE = [0, 100];
const VOLUME_DEFAULT = 70;

export function cleanSounds(raw, where, problems) {
  const sounds = {};
  if (raw === undefined) return sounds;
  if (!isPlainObject(raw)) { problems.push(`${where}: sounds should be an object of ${NOTICE_KINDS.join(" / ")} -> the name of a sound`); return sounds; }
  for (const [kind, name] of Object.entries(raw)) {
    if (!NOTICE_KINDS.includes(kind)) { problems.push(`${where}: sounds.${kind} is not a notice — ${NOTICE_KINDS.join(" or ")}`); continue; }
    if (typeof name === "string" && name.trim()) sounds[kind] = name.trim();
    else problems.push(`${where}: sounds.${kind} should be the name of a sound`);
  }
  return sounds;
}

export function cleanVolume(raw, where, problems) {
  if (raw === undefined) return VOLUME_DEFAULT;
  const [low, high] = VOLUME_RANGE;
  if (typeof raw === "number" && raw >= low && raw <= high) return Math.round(raw);
  problems.push(`${where}: volume should be a number between ${low} and ${high}`);
  return VOLUME_DEFAULT;
}

const LAYOUTS = ["grid", "row", "strip"];
export const LANGUAGES = ["en", "pt-BR"];
export const BLOCK_SIZE_RANGE = [2, 6];
export const BLOCK_SIZE_DEFAULT = 4;

export function cleanBlockSize(raw, where, problems) {
  if (raw === undefined) return BLOCK_SIZE_DEFAULT;
  const [low, high] = BLOCK_SIZE_RANGE;
  if (typeof raw === "number" && raw >= low && raw <= high) return Math.round(raw);
  problems.push(`${where}: blockSize should be a number between ${low} and ${high}`);
  return BLOCK_SIZE_DEFAULT;
}
export const PETS_OFF = "off";
export const PET_CHOICES = ["blob", PETS_OFF];
export const RETIRED_PETS = ["capybara", "bee", "fox"];

export { AUTOCOMPACT_AUTO, AUTOCOMPACT_FLOOR_K, AUTOCOMPACT_CEILING_K };

export function cleanAutocompact(raw, where, problems) {
  if (raw === undefined || raw === AUTOCOMPACT_AUTO) return AUTOCOMPACT_AUTO;
  const k = autocompactThousands(raw);
  if (k) return `${k}k`;
  problems.push(`${where}: autocompact should be ${AUTOCOMPACT_AUTO} or a size from ${AUTOCOMPACT_FLOOR_K}k to ${AUTOCOMPACT_CEILING_K}k`);
  return AUTOCOMPACT_AUTO;
}

/* the face in the title bar. it was always there, and with the blob at the foot of the rail the
   same face is on screen twice. auto is the middle: the mug steps aside when the rail already
   wears it, and stays for everyone who never adopted the blob. */
export const BRAND_FACE_CHOICES = ["always", "auto", "never"];
export const BRAND_FACE_DEFAULT = "auto";

/* how far the eyes reach for the cursor. off is a face that never looks up; window is the reach
   the mug in the title bar already has; screen follows the cursor out of the window, which costs
   a poll in the main process and is the only one that reads as alive. */
export const GAZE_CHOICES = ["off", "window", "screen"];
export const GAZE_DEFAULT = "screen";

export const LOOK_CHOICES = ["classic", "dimension"];
export const LOOK_DEFAULT = "classic";
export const EXPERIENCE_DEFAULT = "raycast";
export const EXPERIENCE_CHOICES = ["raycast"];
const EXPERIENCES_RETIRED = ["current", "experimental"];
export const EXPERIENCE_BEHAVIORS = ["resizeInfo"];
const BEHAVIORS_RETIRED = ["imageZoom", "titleClick"];
export const INFO_WIDTH_RANGE = [240, 1200];
export const INFO_WIDTH_DEFAULT = 380;
export const INFO_HEIGHT_RANGE = [60, 2000];
export const THREAD_WIDTH_RANGE = [240, 1200];
export const THREAD_WIDTH_DEFAULT = 392;
export const TOOL_CALLS_CHOICES = ["all", "failed", "none", "zen"];
export const TOOL_CALLS_DEFAULT = "all";
export const TIME_FORMAT_CHOICES = ["system", "12h", "24h"];
export const TIME_FORMAT_DEFAULT = "system";
export const QUIT_SHORTCUT_CHOICES = ["hold", "twice", "direct"];
export const QUIT_SHORTCUT_DEFAULT = "hold";
export const SCREEN_READER_CHOICES = ["status", "messages", "everything"];
export const SCREEN_READER_DEFAULT = "status";
export const VISUAL_CHOICES = ["lean", "full"];
export const VISUAL_DEFAULT = "lean";

export const CONTEXT_USAGE_ENV = "CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT";

export function contextUsageEnv(config) {
  return config?.contextUsage ? { [CONTEXT_USAGE_ENV]: "1" } : {};
}

export const LIMITS_FOOT_DEFAULT = false;

export { PROMPT_SUGGESTIONS_ENV, CODE_MODE_ENV };

export const SEAT_TUNING_ENVS = [CONTEXT_USAGE_ENV, PROMPT_SUGGESTIONS_ENV, CODE_MODE_ENV];

export function seatTuningEnv(config) {
  return {
    ...contextUsageEnv(config),
    ...(config?.promptSuggestions ? { [PROMPT_SUGGESTIONS_ENV]: "1" } : {}),
    ...(config?.codeMode ? { [CODE_MODE_ENV]: "1" } : {})
  };
}

export function cleanFlag(raw, name, where, problems, fallback = true) {
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean") return raw;
  problems.push(`${where}: ${name} should be true or false`);
  return fallback;
}

export const STT_LANGUAGE_DETECT = "";

export function cleanSttLanguage(raw, where, problems) {
  if (raw === undefined) return STT_LANGUAGE_DETECT;
  if (typeof raw === "string" && (raw.trim() === "" || /^[a-z]{2,3}$/.test(raw.trim()))) return raw.trim();
  problems.push(`${where}: sttLanguage should be empty, for the model to work the language out, or a code like pt or en`);
  return STT_LANGUAGE_DETECT;
}

export function cleanSttMic(raw, where, problems) {
  if (raw === undefined) return "";
  if (typeof raw === "string" && raw.length <= 200) return raw;
  problems.push(`${where}: sttMic should be the id of a microphone, or empty for the system default`);
  return "";
}

export function cleanSttModel(raw, where, problems) {
  if (raw === undefined) return STT_DEFAULT_MODEL;
  if (typeof raw === "string" && STT_MODELS.some((one) => one.id === raw.trim())) return raw.trim();
  problems.push(`${where}: sttModel should be ${STT_MODELS.map((one) => one.id).join(" or ")}`);
  return STT_DEFAULT_MODEL;
}

export function cleanLayout(raw, where, problems) {
  if (raw === undefined) return LAYOUTS[0];
  if (typeof raw === "string" && LAYOUTS.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: layout should be ${LAYOUTS.join(", ")}`);
  return LAYOUTS[0];
}

export const TERMINAL_CHOICES = ["ghostty", "xterm"];

export function cleanTerminal(raw, where, problems) {
  if (raw === undefined) return TERMINAL_CHOICES[0];
  if (typeof raw === "string" && TERMINAL_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: terminal should be ${TERMINAL_CHOICES.join(" or ")}`);
  return TERMINAL_CHOICES[0];
}

export const TERMINAL_SHELL_MAX = 200;
const TERMINAL_SHELL_SHAPE = /^(?:\/[\w@%+=:,./ -]*[\w@%+=:,./-]|[\w@%+=:,.-]+)$/;

export function cleanTerminalShell(raw, where, problems) {
  if (raw === undefined || raw === null) return "";
  const said = typeof raw === "string" ? raw.trim() : null;
  if (said === "" || (said && said.length <= TERMINAL_SHELL_MAX && TERMINAL_SHELL_SHAPE.test(said))) return said;
  problems.push(`${where}: terminalShell should be empty, for your login shell, or the name or the full path of a shell, like fish or /opt/homebrew/bin/fish`);
  return "";
}

export function cleanLanguage(raw, where, problems) {
  if (raw === undefined) return LANGUAGES[0];
  if (typeof raw === "string" && LANGUAGES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: language should be ${LANGUAGES.join(" or ")}`);
  return LANGUAGES[0];
}

export function cleanPet(raw, where, problems) {
  if (raw === undefined) return PETS_OFF;
  if (typeof raw === "string" && RETIRED_PETS.includes(raw.trim())) return PETS_OFF;
  if (typeof raw === "string" && PET_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: pet should be ${PET_CHOICES.join(", ")}`);
  return PETS_OFF;
}

export function cleanToolCalls(raw, where, problems) {
  if (raw === undefined) return TOOL_CALLS_DEFAULT;
  if (typeof raw === "string" && TOOL_CALLS_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: toolCalls should be ${TOOL_CALLS_CHOICES.join(", ")}`);
  return TOOL_CALLS_DEFAULT;
}

export function cleanTitleInstructions(raw, where, problems) {
  const clean = noTitleInstructions();
  if (raw === undefined) return clean;
  if (!isPlainObject(raw)) { problems.push(`${where}: titleInstructions should be an object with all and projects`); return clean; }
  if (raw.all !== undefined) {
    if (typeof raw.all === "string" && raw.all.trim().length <= TITLE_INSTRUCTIONS_CEILING) clean.all = raw.all.trim();
    else problems.push(`${where}: titleInstructions.all should be text of at most ${TITLE_INSTRUCTIONS_CEILING} characters`);
  }
  if (raw.projects === undefined) return clean;
  if (!isPlainObject(raw.projects)) { problems.push(`${where}: titleInstructions.projects should be an object of project -> instructions`); return clean; }
  for (const [project, text] of Object.entries(raw.projects)) {
    if (Object.keys(clean.projects).length >= TITLE_PROJECTS_CEILING) { problems.push(`${where}: titleInstructions.projects keeps at most ${TITLE_PROJECTS_CEILING} projects — the rest were ignored`); break; }
    const name = project.trim();
    if (!name || name.length > TITLE_PROJECT_NAME_CEILING) { problems.push(`${where}: titleInstructions.projects needs project names of at most ${TITLE_PROJECT_NAME_CEILING} characters`); continue; }
    if (typeof text !== "string" || text.trim().length > TITLE_INSTRUCTIONS_CEILING) { problems.push(`${where}: titleInstructions.projects.${name} should be text of at most ${TITLE_INSTRUCTIONS_CEILING} characters`); continue; }
    if (text.trim()) clean.projects[name] = text.trim();
  }
  return clean;
}

export function cleanTimeFormat(raw, where, problems) {
  if (raw === undefined) return TIME_FORMAT_DEFAULT;
  if (typeof raw === "string" && TIME_FORMAT_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: timeFormat should be ${TIME_FORMAT_CHOICES.join(", ")}`);
  return TIME_FORMAT_DEFAULT;
}

export function cleanQuitShortcut(raw, where, problems) {
  if (raw === undefined) return QUIT_SHORTCUT_DEFAULT;
  if (typeof raw === "string" && QUIT_SHORTCUT_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: quitShortcut should be ${QUIT_SHORTCUT_CHOICES.join(", ")}`);
  return QUIT_SHORTCUT_DEFAULT;
}

export function cleanScreenReader(raw, where, problems) {
  if (raw === undefined) return SCREEN_READER_DEFAULT;
  if (typeof raw === "string" && SCREEN_READER_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: screenReaderAnnouncements should be ${SCREEN_READER_CHOICES.join(", ")}`);
  return SCREEN_READER_DEFAULT;
}

export function cleanBrandFace(raw, where, problems) {
  if (raw === undefined) return BRAND_FACE_DEFAULT;
  if (typeof raw === "string" && BRAND_FACE_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: brandFace should be ${BRAND_FACE_CHOICES.join(", ")}`);
  return BRAND_FACE_DEFAULT;
}

export function cleanExperience(raw, where, problems) {
  if (raw === undefined) return EXPERIENCE_DEFAULT;
  if (EXPERIENCE_CHOICES.includes(raw)) return raw;
  if (EXPERIENCES_RETIRED.includes(raw)) return EXPERIENCE_DEFAULT;
  problems.push(`${where}: experience should be ${EXPERIENCE_CHOICES.join(", ")}`);
  return EXPERIENCE_DEFAULT;
}

export function cleanExperienceOff(raw, where, problems) {
  if (raw === undefined) return [];
  if (Array.isArray(raw) && raw.every((one) => EXPERIENCE_BEHAVIORS.includes(one) || BEHAVIORS_RETIRED.includes(one))) return [...new Set(raw.filter((one) => EXPERIENCE_BEHAVIORS.includes(one)))];
  problems.push(`${where}: experienceOff should list only ${EXPERIENCE_BEHAVIORS.join(", ")}`);
  return [];
}

export function cleanInfoWidth(raw, where, problems) {
  if (raw === undefined) return INFO_WIDTH_DEFAULT;
  const [low, high] = INFO_WIDTH_RANGE;
  if (Number.isInteger(raw) && raw >= low && raw <= high) return raw;
  problems.push(`${where}: infoWidth should be a whole number of pixels from ${low} to ${high}`);
  return INFO_WIDTH_DEFAULT;
}

export function cleanInfoHeight(raw, where, problems) {
  if (raw === undefined || raw === null) return null;
  const [low, high] = INFO_HEIGHT_RANGE;
  if (Number.isInteger(raw) && raw >= low && raw <= high) return raw;
  problems.push(`${where}: infoHeight should be null, for the natural height, or a whole number of pixels from ${low} to ${high}`);
  return null;
}

export function cleanThreadWidth(raw, where, problems) {
  if (raw === undefined) return THREAD_WIDTH_DEFAULT;
  const [low, high] = THREAD_WIDTH_RANGE;
  if (Number.isInteger(raw) && raw >= low && raw <= high) return raw;
  problems.push(`${where}: threadWidth should be a whole number of pixels from ${low} to ${high}`);
  return THREAD_WIDTH_DEFAULT;
}

export function cleanLook(raw, where, problems) {
  if (raw === undefined) return LOOK_DEFAULT;
  if (typeof raw === "string" && LOOK_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: look should be ${LOOK_CHOICES.join(", ")}`);
  return LOOK_DEFAULT;
}

export function cleanVisual(raw, where, problems) {
  if (raw === undefined) return VISUAL_DEFAULT;
  if (typeof raw === "string" && VISUAL_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: visual should be ${VISUAL_CHOICES.join(", ")}`);
  return VISUAL_DEFAULT;
}

export function cleanGaze(raw, where, problems) {
  if (raw === undefined) return GAZE_DEFAULT;
  if (typeof raw === "string" && GAZE_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: gaze should be ${GAZE_CHOICES.join(", ")}`);
  return GAZE_DEFAULT;
}

export const SEND_SHORTCUT_CHOICES = ["enter", "mod-enter-multiline", "mod-enter"];
export const SEND_SHORTCUT_DEFAULT = "enter";
export const FOLLOW_UP_CHOICES = ["queue", "steer"];
export const FOLLOW_UP_DEFAULT = "queue";

export function cleanSendShortcut(raw, where, problems) {
  if (raw === undefined) return SEND_SHORTCUT_DEFAULT;
  if (typeof raw === "string" && SEND_SHORTCUT_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: sendShortcut should be ${SEND_SHORTCUT_CHOICES.join(", ")}`);
  return SEND_SHORTCUT_DEFAULT;
}

export function cleanFollowUp(raw, where, problems) {
  if (raw === undefined) return FOLLOW_UP_DEFAULT;
  if (typeof raw === "string" && FOLLOW_UP_CHOICES.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: followUp should be ${FOLLOW_UP_CHOICES.join(", ")}`);
  return FOLLOW_UP_DEFAULT;
}

const THEME_NAME_MAX = 60;
const THEMES_MAX = 40;
const THEME_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const THEME_AUTHORS = ["agent"];
export const APPEARANCE_CHOICES = ["fixed", "system"];
export const APPEARANCE_DEFAULT = "fixed";
export const THEME_LIGHT_DEFAULT = "Bonsai Light";
export const CONTRAST_RANGE = [0, 100];
export const CONTRAST_DEFAULT = 0;
export const GLASS_RANGE = [0, 100];
export const GLASS_AUTO = null;
export const PANEL_MOTION_RANGE = [0, 400];
export const PANEL_MOTION_DEFAULT = 0;
export const CHAT_WIDTH_WORDS = ["auto", "full"];
export const CHAT_WIDTH_RANGE = [480, 1600];
export const CHAT_WIDTH_DEFAULT = "auto";
export const THEME_UI_KEYS = ["bg", "panel", "panel2", "panel3", "well", "line", "line2", "line3", "txt", "txt2", "txt3", "accent", "accentD", "accentHi", "accentBg", "green", "yellow", "blue", "violet"];
export const THEME_TERMINAL_KEYS = ["background", "foreground", "cursor", "selectionBackground", "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white", "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];

export const MACHINE_CEILING = 32;

export function cleanMachine(raw, where, problems) {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") {
    problems.push(`${where}: machine should be a name in text`);
    return "";
  }
  return raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MACHINE_CEILING);
}

export function cleanShelf(raw, where, problems) {
  if (raw === undefined || raw === "") return "";
  if (typeof raw === "string" && GITHUB_REPO_URL.test(raw.trim())) return raw.trim();
  problems.push(`${where}: shelf should be the https url of a private GitHub repo`);
  return "";
}

export function cleanThemeName(raw, where, problems) {
  if (raw === undefined) return "";
  if (typeof raw === "string" && raw.trim().length <= THEME_NAME_MAX) return raw.trim();
  problems.push(`${where}: theme should be the name of a theme`);
  return "";
}

export function cleanThemeColors(raw, keys, where, problems) {
  const colors = {};
  if (raw === undefined) return colors;
  if (!isPlainObject(raw)) { problems.push(`${where} should be an object of colour -> hex`); return colors; }
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.includes(key)) { problems.push(`${where}.${key} is not a colour a theme knows`); continue; }
    if (typeof value === "string" && THEME_HEX.test(value.trim())) colors[key] = value.trim();
    else problems.push(`${where}.${key} should be a hex colour like #CD694A`);
  }
  return colors;
}

export function cleanThemes(raw, where, problems) {
  const themes = {};
  if (raw === undefined) return themes;
  if (!isPlainObject(raw)) { problems.push(`${where}: themes should be an object of name -> palette`); return themes; }
  for (const [name, def] of Object.entries(raw)) {
    if (Object.keys(themes).length >= THEMES_MAX) { problems.push(`${where}: themes keeps at most ${THEMES_MAX} palettes — the rest were ignored`); break; }
    if (!name.trim() || name.trim().length > THEME_NAME_MAX) { problems.push(`${where}: a theme needs a name of at most ${THEME_NAME_MAX} characters`); continue; }
    if (!isPlainObject(def)) { problems.push(`${where}: themes.${name} should be an object with ui and terminal`); continue; }
    const kept = {
      ui: cleanThemeColors(def.ui, THEME_UI_KEYS, `${where}: themes.${name}.ui`, problems),
      terminal: cleanThemeColors(def.terminal, THEME_TERMINAL_KEYS, `${where}: themes.${name}.terminal`, problems)
    };
    if (def.css !== undefined && def.css !== "") {
      const wrong = themeCssProblem(def.css);
      if (wrong) problems.push(`${where}: themes.${name}.css was left out — ${wrong}`);
      else kept.css = def.css;
    }
    if (def.by !== undefined) {
      if (THEME_AUTHORS.includes(def.by)) kept.by = def.by;
      else problems.push(`${where}: themes.${name}.by should be ${THEME_AUTHORS.join(", ")}`);
    }
    themes[name.trim()] = kept;
  }
  return themes;
}

export function cleanAppearance(raw, where, problems) {
  if (raw === undefined) return APPEARANCE_DEFAULT;
  if (APPEARANCE_CHOICES.includes(raw)) return raw;
  problems.push(`${where}: appearance should be ${APPEARANCE_CHOICES.join(", ")}`);
  return APPEARANCE_DEFAULT;
}

export function cleanThemeLight(raw, where, problems) {
  if (raw === undefined) return THEME_LIGHT_DEFAULT;
  if (typeof raw === "string" && raw.trim() && raw.trim().length <= THEME_NAME_MAX) return raw.trim();
  problems.push(`${where}: themeLight should be the name of a theme`);
  return THEME_LIGHT_DEFAULT;
}

function cleanWhole(raw, name, [low, high], fallback, where, problems) {
  if (raw === undefined) return fallback;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= low && raw <= high) return Math.round(raw);
  problems.push(`${where}: ${name} should be a number between ${low} and ${high}`);
  return fallback;
}

export const cleanContrast = (raw, where, problems) => cleanWhole(raw, "contrast", CONTRAST_RANGE, CONTRAST_DEFAULT, where, problems);

export const cleanPanelMotion = (raw, where, problems) => cleanWhole(raw, "panelMotion", PANEL_MOTION_RANGE, PANEL_MOTION_DEFAULT, where, problems);

export function cleanGlass(raw, where, problems) {
  if (raw === undefined || raw === GLASS_AUTO) return GLASS_AUTO;
  return cleanWhole(raw, "glass", GLASS_RANGE, GLASS_AUTO, where, problems);
}

export function cleanChatWidth(raw, where, problems) {
  if (raw === undefined) return CHAT_WIDTH_DEFAULT;
  if (CHAT_WIDTH_WORDS.includes(raw)) return raw;
  const [low, high] = CHAT_WIDTH_RANGE;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= low && raw <= high) return Math.round(raw);
  problems.push(`${where}: chatWidth should be ${CHAT_WIDTH_WORDS.join(", ")} or a number of pixels between ${low} and ${high}`);
  return CHAT_WIDTH_DEFAULT;
}

/* what the face wears, as the file keeps it: "glasses:round hat:wizard". a piece the catalogue
   does not know is dropped and said, the rest is kept — a config is never thrown away whole
   because one word in it went stale. */
export function cleanWear(raw, where, problems) {
  if (raw === undefined || raw === "" || raw === null) return "";
  if (typeof raw !== "string" && (typeof raw !== "object" || Array.isArray(raw))) {
    problems.push(`${where}: wear should be "slot:piece slot:piece", like "glasses:round hat:cap"`);
    return "";
  }
  const kept = wearKey(parseWear(raw));
  const asked = typeof raw === "string"
    ? raw.trim().split(/\s+/).filter(Boolean).filter((part) => !isRetiredWear(...part.split(":"))).length
    : Object.keys(raw).filter((slot) => !isRetiredWear(slot, raw[slot])).length;
  if (asked !== kept.split(" ").filter(Boolean).length) problems.push(`${where}: some of the wear is not a piece the hive has, and was left out`);
  return kept;
}

export function cleanAvatar(raw, where, problems) {
  if (raw === undefined || raw === "") return "";
  if (typeof raw === "string" && isFaceKey(raw)) return raw.trim();
  problems.push(`${where}: avatar should be body/screen/colour or blobatar`);
  return "";
}

export const PROVIDER_IDS = ["claude", "codex", "kimi", "kiro", "cursor", "gemini", "antigravity", "opencode"];
const PROVIDER_NAME_MAX = 40;
const PROVIDER_ARGS_MAX = 40;
const PROVIDER_ENV_MAX = 40;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function cleanProviderArgs(raw, where, problems) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) { problems.push(`${where}.args should be a list of words`); return []; }
  const args = raw.filter((one) => typeof one === "string" && one.trim()).map((one) => one.trim()).slice(0, PROVIDER_ARGS_MAX);
  if (args.length !== raw.length) problems.push(`${where}.args should hold only words, at most ${PROVIDER_ARGS_MAX}`);
  return args;
}

function cleanProviderEnv(raw, where, problems) {
  const env = {};
  if (raw === undefined) return env;
  if (!isPlainObject(raw)) { problems.push(`${where}.env should be an object of NAME -> value`); return env; }
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(env).length >= PROVIDER_ENV_MAX) { problems.push(`${where}.env keeps at most ${PROVIDER_ENV_MAX} variables`); break; }
    if (!ENV_NAME.test(key)) { problems.push(`${where}.env.${key} is not a name an environment variable can have`); continue; }
    if (typeof value !== "string") { problems.push(`${where}.env.${key} should be a string`); continue; }
    env[key] = value;
  }
  return env;
}

export function cleanProvider(raw, where, problems) {
  const provider = { enabled: true, name: "", color: "", binary: "", args: [], env: {} };
  if (raw === undefined) return provider;
  if (!isPlainObject(raw)) { problems.push(`${where} should be an object`); return provider; }
  if (raw.enabled !== undefined) {
    if (typeof raw.enabled === "boolean") provider.enabled = raw.enabled;
    else problems.push(`${where}.enabled should be true or false`);
  }
  if (raw.name !== undefined) {
    if (typeof raw.name === "string" && raw.name.trim().length <= PROVIDER_NAME_MAX) provider.name = raw.name.trim();
    else problems.push(`${where}.name should be a short name, at most ${PROVIDER_NAME_MAX} characters`);
  }
  if (raw.color !== undefined && raw.color !== "") {
    if (typeof raw.color === "string" && THEME_HEX.test(raw.color.trim())) provider.color = raw.color.trim();
    else problems.push(`${where}.color should be a hex colour like #CD694A`);
  }
  if (raw.binary !== undefined && raw.binary !== "") {
    if (typeof raw.binary === "string" && raw.binary.trim() && !raw.binary.includes("\n")) provider.binary = raw.binary.trim();
    else problems.push(`${where}.binary should be the path of the executable`);
  }
  provider.args = cleanProviderArgs(raw.args, where, problems);
  provider.env = cleanProviderEnv(raw.env, where, problems);
  return provider;
}

export function cleanProviders(raw, where, problems) {
  const providers = {};
  if (raw === undefined) return providers;
  if (!isPlainObject(raw)) { problems.push(`${where}: providers should be an object of provider -> settings`); return providers; }
  for (const [id, def] of Object.entries(raw)) {
    if (!PROVIDER_IDS.includes(id)) { problems.push(`${where}: providers.${id} is not an agent this hive runs (${PROVIDER_IDS.join(", ")})`); continue; }
    providers[id] = cleanProvider(def, `${where}: providers.${id}`, problems);
  }
  return providers;
}

export const EXTENSION_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXTENSION_NAME_MAX = 40;
const EXTENSIONS_MAX = 60;
const EXTENSION_SETTINGS_MAX = 40;
const EXTENSION_HASH = /^[0-9a-f]{8,64}$/;
const isSetting = (value) => (typeof value === "number" ? Number.isFinite(value) : typeof value === "string" || typeof value === "boolean");

export function cleanExtensions(raw, where, problems) {
  const extensions = {};
  if (raw === undefined) return extensions;
  if (!isPlainObject(raw)) { problems.push(`${where}: extensions should be an object of name -> { enabled, settings }`); return extensions; }
  for (const [name, def] of Object.entries(raw)) {
    if (Object.keys(extensions).length >= EXTENSIONS_MAX) { problems.push(`${where}: extensions keeps at most ${EXTENSIONS_MAX} entries — the rest were ignored`); break; }
    if (name.length > EXTENSION_NAME_MAX || !EXTENSION_NAME.test(name)) { problems.push(`${where}: extensions.${name} is not a name an extension can have`); continue; }
    if (!isPlainObject(def)) { problems.push(`${where}: extensions.${name} should be an object with enabled and settings`); continue; }
    const one = {};
    if (def.enabled !== undefined) {
      if (typeof def.enabled === "boolean") one.enabled = def.enabled;
      else problems.push(`${where}: extensions.${name}.enabled should be true or false`);
    }
    if (def.hash !== undefined) {
      if (typeof def.hash === "string" && EXTENSION_HASH.test(def.hash)) one.hash = def.hash;
      else problems.push(`${where}: extensions.${name}.hash should be the hash the app wrote`);
    }
    if (def.settings !== undefined) {
      if (!isPlainObject(def.settings)) problems.push(`${where}: extensions.${name}.settings should be an object of key -> value`);
      else {
        one.settings = {};
        for (const [key, value] of Object.entries(def.settings)) {
          if (Object.keys(one.settings).length >= EXTENSION_SETTINGS_MAX) { problems.push(`${where}: extensions.${name}.settings keeps at most ${EXTENSION_SETTINGS_MAX} keys`); break; }
          if (isSetting(value)) one.settings[key] = value;
          else problems.push(`${where}: extensions.${name}.settings.${key} should be a string, a number or true/false`);
        }
      }
    }
    extensions[name] = one;
  }
  return extensions;
}

export function cleanPrViews(raw, where, problems) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    problems.push(`${where}: prViews should be a list of saved PR views, each { id, name, filter, query }`);
    return [];
  }
  const views = [];
  for (const one of raw) {
    if (views.length >= PR_VIEWS_MAX) { problems.push(`${where}: prViews keeps at most ${PR_VIEWS_MAX} views — the rest were ignored`); break; }
    const view = cleanPrView(one);
    if (!view) { problems.push(`${where}: a saved PR view needs an id, a name of at most ${PR_VIEW_NAME_MAX} characters, a filter (${PR_VIEW_FILTERS.join(", ")}) and a search of at most ${PR_VIEW_QUERY_MAX} characters`); continue; }
    if (views.some((kept) => kept.id === view.id || kept.name.toLowerCase() === view.name.toLowerCase())) { problems.push(`${where}: prViews has two views called ${view.name}`); continue; }
    views.push(view);
  }
  return views;
}

export { cleanQuietDays };

export function cleanPatch(patch) {
  const problems = [];
  const clean = {};
  if (!isPlainObject(patch)) return { clean, problems: ["the patch should be an object"] };
  if (patch.font !== undefined) clean.font = fontPatchOf(cleanFont(patch.font, "patch", problems));
  if (patch.sound !== undefined) clean.sound = cleanSound(patch.sound, "patch", problems);
  if (patch.answered !== undefined) clean.answered = cleanFlag(patch.answered, "answered", "patch", problems, false);
  if (patch.sounds !== undefined) clean.sounds = cleanSounds(patch.sounds, "patch", problems);
  if (patch.volume !== undefined) clean.volume = cleanVolume(patch.volume, "patch", problems);
  if (patch.layout !== undefined) clean.layout = cleanLayout(patch.layout, "patch", problems);
  if (patch.blockSize !== undefined) clean.blockSize = cleanBlockSize(patch.blockSize, "patch", problems);
  if (patch.language !== undefined) clean.language = cleanLanguage(patch.language, "patch", problems);
  if (patch.terminal !== undefined) clean.terminal = cleanTerminal(patch.terminal, "patch", problems);
  if (patch.terminalShell !== undefined) clean.terminalShell = cleanTerminalShell(patch.terminalShell, "patch", problems);
  if (patch.pet !== undefined) clean.pet = cleanPet(patch.pet, "patch", problems);
  if (patch.brandFace !== undefined) clean.brandFace = cleanBrandFace(patch.brandFace, "patch", problems);
  if (patch.gaze !== undefined) clean.gaze = cleanGaze(patch.gaze, "patch", problems);
  if (patch.sendShortcut !== undefined) clean.sendShortcut = cleanSendShortcut(patch.sendShortcut, "patch", problems);
  if (patch.followUp !== undefined) clean.followUp = cleanFollowUp(patch.followUp, "patch", problems);
  if (patch.experience !== undefined) clean.experience = cleanExperience(patch.experience, "patch", problems);
  if (patch.experienceOff !== undefined) clean.experienceOff = cleanExperienceOff(patch.experienceOff, "patch", problems);
  if (patch.infoWidth !== undefined) clean.infoWidth = cleanInfoWidth(patch.infoWidth, "patch", problems);
  if (patch.infoHeight !== undefined) clean.infoHeight = cleanInfoHeight(patch.infoHeight, "patch", problems);
  if (patch.threadWidth !== undefined) clean.threadWidth = cleanThreadWidth(patch.threadWidth, "patch", problems);
  if (patch.splitsLearned !== undefined) clean.splitsLearned = cleanFlag(patch.splitsLearned, "splitsLearned", "patch", problems, false);
  if (patch.look !== undefined) clean.look = cleanLook(patch.look, "patch", problems);
  if (patch.theme !== undefined) clean.theme = cleanThemeName(patch.theme, "patch", problems);
  if (patch.themes !== undefined) clean.themes = cleanThemes(patch.themes, "patch", problems);
  if (patch.appearance !== undefined) clean.appearance = cleanAppearance(patch.appearance, "patch", problems);
  if (patch.themeLight !== undefined) clean.themeLight = cleanThemeLight(patch.themeLight, "patch", problems);
  if (patch.contrast !== undefined) clean.contrast = cleanContrast(patch.contrast, "patch", problems);
  if (patch.glass !== undefined) clean.glass = cleanGlass(patch.glass, "patch", problems);
  if (patch.panelMotion !== undefined) clean.panelMotion = cleanPanelMotion(patch.panelMotion, "patch", problems);
  if (patch.chatWidth !== undefined) clean.chatWidth = cleanChatWidth(patch.chatWidth, "patch", problems);
  if (patch.dim !== undefined) clean.dim = cleanFlag(patch.dim, "dim", "patch", problems);
  if (patch.visual !== undefined) clean.visual = cleanVisual(patch.visual, "patch", problems);
  if (patch.autocompact !== undefined) clean.autocompact = cleanAutocompact(patch.autocompact, "patch", problems);
  if (patch.contextUsage !== undefined) clean.contextUsage = cleanFlag(patch.contextUsage, "contextUsage", "patch", problems, false);
  if (patch.limitsFoot !== undefined) clean.limitsFoot = cleanFlag(patch.limitsFoot, "limitsFoot", "patch", problems, LIMITS_FOOT_DEFAULT);
  if (patch.toolCalls !== undefined) clean.toolCalls = cleanToolCalls(patch.toolCalls, "patch", problems);
  if (patch.titleInstructions !== undefined) clean.titleInstructions = cleanTitleInstructions(patch.titleInstructions, "patch", problems);
  if (patch.timeFormat !== undefined) clean.timeFormat = cleanTimeFormat(patch.timeFormat, "patch", problems);
  if (patch.quitShortcut !== undefined) clean.quitShortcut = cleanQuitShortcut(patch.quitShortcut, "patch", problems);
  if (patch.screenReaderAnnouncements !== undefined) clean.screenReaderAnnouncements = cleanScreenReader(patch.screenReaderAnnouncements, "patch", problems);
  if (patch.screenReaderWindowTitle !== undefined) clean.screenReaderWindowTitle = cleanFlag(patch.screenReaderWindowTitle, "screenReaderWindowTitle", "patch", problems, false);
  if (patch.promptSuggestions !== undefined) clean.promptSuggestions = cleanFlag(patch.promptSuggestions, "promptSuggestions", "patch", problems, false);
  if (patch.codeMode !== undefined) clean.codeMode = cleanFlag(patch.codeMode, "codeMode", "patch", problems, false);
  if (patch.autoUpdateAgents !== undefined) clean.autoUpdateAgents = cleanFlag(patch.autoUpdateAgents, "autoUpdateAgents", "patch", problems, true);
  if (patch.keepAwakeWhileAgentsWork !== undefined) clean.keepAwakeWhileAgentsWork = cleanFlag(patch.keepAwakeWhileAgentsWork, "keepAwakeWhileAgentsWork", "patch", problems, true);
  if (patch.closeQuietAfterDays !== undefined) clean.closeQuietAfterDays = cleanQuietDays(patch.closeQuietAfterDays, "patch", problems);
  if (patch.pruneDiariesAfterDays !== undefined) clean.pruneDiariesAfterDays = cleanDiaryDays(patch.pruneDiariesAfterDays, "patch", problems);
  if (patch.threads !== undefined) clean.threads = cleanThreads(patch.threads, "patch", problems, { partial: true });
  if (patch.share !== undefined) clean.share = cleanFlag(patch.share, "share", "patch", problems);
  if (patch.knocks !== undefined) clean.knocks = cleanFlag(patch.knocks, "knocks", "patch", problems);
  if (patch.phone !== undefined) clean.phone = cleanFlag(patch.phone, "phone", "patch", problems, false);
  if (patch.stt !== undefined) clean.stt = cleanFlag(patch.stt, "stt", "patch", problems, false);
  if (patch.sttLanguage !== undefined) clean.sttLanguage = cleanSttLanguage(patch.sttLanguage, "patch", problems);
  if (patch.sttMic !== undefined) clean.sttMic = cleanSttMic(patch.sttMic, "patch", problems);
  if (patch.sttModel !== undefined) clean.sttModel = cleanSttModel(patch.sttModel, "patch", problems);
  if (patch.meetings !== undefined) clean.meetings = cleanMeetingSettings(patch.meetings, "patch", problems);
  if (patch.machines !== undefined) clean.machines = cleanFlag(patch.machines, "machines", "patch", problems, false);
  if (patch.machine !== undefined) clean.machine = cleanMachine(patch.machine, "patch", problems);
  if (patch.shelf !== undefined) clean.shelf = cleanShelf(patch.shelf, "patch", problems);
  if (patch.avatar !== undefined) clean.avatar = cleanAvatar(patch.avatar, "patch", problems);
  if (patch.wear !== undefined) clean.wear = cleanWear(patch.wear, "patch", problems);
  if (patch.keys !== undefined) clean.keys = cleanKeys(patch.keys, "patch", problems);
  if (patch.providers !== undefined) clean.providers = cleanProviders(patch.providers, "patch", problems);
  if (patch.extensions !== undefined) clean.extensions = cleanExtensions(patch.extensions, "patch", problems);
  if (patch.prViews !== undefined) clean.prViews = cleanPrViews(patch.prViews, "patch", problems);
  Object.assign(clean, cleanBehaviorPatch(patch, problems));
  return { clean, problems };
}
