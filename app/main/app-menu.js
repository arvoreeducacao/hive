const MENU_WORDS = { settings: "Settings…", updates: "Check for Updates…" };
const WORD_MAX = 60;
const KEY_NAMES = {
  Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Semicolon: ";", Quote: "'", Backquote: "`", Minus: "-", Equal: "=",
  Enter: "Return", Space: "Space", Escape: "Escape", Tab: "Tab", Backspace: "Backspace",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right"
};

function menuWords(raw) {
  const words = { ...MENU_WORDS };
  for (const name of Object.keys(MENU_WORDS)) {
    const said = typeof raw?.[name] === "string" ? raw[name].trim() : "";
    if (said && said.length <= WORD_MAX) words[name] = said;
  }
  return words;
}

function cleanBinding(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.code !== "string" || !/^[A-Za-z0-9]+$/.test(raw.code)) return null;
  return { code: raw.code, meta: !!raw.meta, ctrl: !!raw.ctrl, alt: !!raw.alt, shift: !!raw.shift };
}

function keyNameOf(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return KEY_NAMES[code] || "";
}

function acceleratorOf(binding, mac) {
  const key = binding ? keyNameOf(binding.code) : "";
  if (!key) return "";
  const mods = [];
  if (binding.ctrl) mods.push("Control");
  if (binding.alt) mods.push("Alt");
  if (binding.shift) mods.push("Shift");
  if (binding.meta) mods.push(mac ? "Command" : "Super");
  return [...mods, key].join("+");
}

function bindingHits(binding, input) {
  if (!binding || input.type !== "keyDown" || input.isAutoRepeat) return false;
  return input.code === binding.code && !!input.meta === binding.meta && !!input.control === binding.ctrl && !!input.alt === binding.alt && !!input.shift === binding.shift;
}

function hiveAppMenu({ mac, name = "Hive", words, settingsKey, act }) {
  const said = menuWords(words);
  const accelerator = acceleratorOf(settingsKey, mac);
  const settings = { label: said.settings, click: () => act("settings"), ...(accelerator ? { accelerator, registerAccelerator: false } : {}) };
  const updates = { label: said.updates, click: () => act("updates") };
  if (!mac) return { settings, updates };
  return {
    label: name,
    submenu: [
      { role: "about" },
      updates,
      { type: "separator" },
      settings,
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ]
  };
}

module.exports = { MENU_WORDS, acceleratorOf, bindingHits, cleanBinding, hiveAppMenu, menuWords };
