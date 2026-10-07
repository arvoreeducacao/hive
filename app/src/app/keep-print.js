import { phrase } from "./core.js";

const PRINT_CEILING = 300 * 1024;
const QUALITY_FLOOR = 0.55;
const ROUNDS = 8;

function loadPicture(src) {
  return new Promise((then, fail) => {
    const img = new Image();
    img.onload = () => then(img);
    img.onerror = () => fail(new Error("the picture could not be read"));
    img.src = src;
  });
}

function drawAt(img, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const asBlob = (canvas, quality) => new Promise((then) => canvas.toBlob(then, "image/jpeg", quality));

async function jpegUnder(src, ceiling = PRINT_CEILING) {
  const img = await loadPicture(src);
  let scale = 1;
  let quality = 0.82;
  let blob = null;
  for (let round = 0; round < ROUNDS; round += 1) {
    blob = await asBlob(drawAt(img, scale), quality);
    if (blob && blob.size <= ceiling) return blob;
    if (quality > QUALITY_FLOOR) quality -= 0.1;
    else scale *= 0.8;
  }
  return blob;
}

const asDataUrl = (blob) => new Promise((then, fail) => {
  const reader = new FileReader();
  reader.onload = () => then(String(reader.result));
  reader.onerror = () => fail(new Error("the picture could not be encoded"));
  reader.readAsDataURL(blob);
});

async function keepPrintOnPage(e, shot, caption, { after = "last", fetchImpl = fetch, encode = jpegUnder } = {}) {
  const said = String(caption || "").trim();
  if (!said) return { error: phrase("say what this print shows, in one line") };
  const blob = await encode(shot.src);
  if (!blob) return { error: phrase("the picture could not be made small enough") };
  const data = await asDataUrl(blob);
  const r = await fetchImpl("/api/shelf/keep-print", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: e.name, where: e.where, path: shot.path, caption: said, data, after })
  });
  const kept = await r.json().catch(() => ({ error: phrase("the app could not reach its own server") }));
  return kept;
}

export { PRINT_CEILING, jpegUnder, keepPrintOnPage };
