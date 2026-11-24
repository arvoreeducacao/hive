const PASTE_AS_FILE_BYTES = 32 * 1024;

const PASTED_FILE = /pasted-text(?:-\d+)?\.txt/g;

const byteLength = (text) => new TextEncoder().encode(String(text || "")).byteLength;

const pastedAsFile = (said) => !!said && (said.length >= PASTE_AS_FILE_BYTES || byteLength(said) >= PASTE_AS_FILE_BYTES);

function pastedFileName(text) {
  const taken = new Set((String(text || "").match(PASTED_FILE) || []).map((one) => one.toLowerCase()));
  if (!taken.has("pasted-text.txt")) return "pasted-text.txt";
  for (let n = 2; ; n++) if (!taken.has(`pasted-text-${n}.txt`)) return `pasted-text-${n}.txt`;
}

function utf8Base64(text) {
  let bin = "";
  const bytes = new TextEncoder().encode(String(text || ""));
  for (let at = 0; at < bytes.length; at += 0x8000) bin += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(bin);
}

function pastedFile(text, boxText) {
  return { name: pastedFileName(boxText), data: `data:text/plain;base64,${utf8Base64(text)}` };
}

function pastedTextFile(text, taken) {
  return new File([String(text || "")], pastedFileName(taken), { type: "text/plain" });
}

function pasteRoute(words, { plain = false, folds = () => false, asFile = true } = {}) {
  if (!words) return "native";
  if (plain) return "plain";
  if (asFile && pastedAsFile(words)) return "file";
  return folds(words) ? "fold" : "native";
}

export { PASTE_AS_FILE_BYTES, pasteRoute, pastedAsFile, pastedFile, pastedFileName, pastedTextFile, utf8Base64 };
