import { FIGURE_MARK, HIVE_LIGHT, IMAGE_MARK, liftDataImages, liftFigures, pinFigures, stripWeight } from "./leaf-figures.mjs";
import { takesArgument } from "./leaf-link.mjs";

export const FIGURE_TOOL = "upload_image";
export const FIGURE_CEILING = 500000;
export const PAGE_CEILING = 600000;
export const FIGURE_TYPE = "image/svg+xml";

const LEFTOVER = /<img\b((?:"[^"]*"|'[^']*'|[^>"'])*?)\bsrc="leaf-(?:figure|image)-\d+"((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ALT = /\balt\s*=\s*"([^"]*)"/;

export function bodyForLeaf(html, base = HIVE_LIGHT) {
  const lifted = liftFigures(html, base);
  const pulled = liftDataImages(stripWeight(lifted.html));
  return { html: pulled.html, figures: lifted.figures, images: pulled.images };
}

export function sayMissing(html) {
  return String(html || "").replace(LEFTOVER, (whole, before, after) => {
    const said = ALT.exec(before)?.[1] || ALT.exec(after)?.[1] || "";
    return said ? `<p><em>Desenho que não veio: ${said}</em></p>` : "";
  });
}

export const readsHtml = (inputs, tool) => takesArgument(inputs, tool, "html");

async function upAll({ session, pieces, what, missing }) {
  const urls = [];
  for (const piece of pieces) {
    if (piece.bytes > FIGURE_CEILING) {
      urls.push("");
      missing.push({ n: piece.n, what, why: `the ${what} is ${Math.round(piece.bytes / 1024)} kB, over the 500 kB the leaf takes` });
      continue;
    }
    const sent = await session.call(FIGURE_TOOL, {
      data: piece.data || Buffer.from(piece.svg, "utf8").toString("base64"),
      contentType: piece.contentType || FIGURE_TYPE
    });
    if (sent.error) {
      urls.push("");
      missing.push({ n: piece.n, what, why: sent.error });
      continue;
    }
    const url = sent.said?.url || "";
    urls.push(url);
    if (!url) missing.push({ n: piece.n, what, why: `the leaf kept the ${what} but gave no address` });
  }
  return urls;
}

export async function sendToLeaf({ session, tools = [], inputs = {}, title, html, docId, parentId, base = HIVE_LIGHT }) {
  const writing = docId ? "update_document" : "create_document";
  if (!readsHtml(inputs, writing)) {
    return { error: `this leaf does not read html yet: ${writing} takes only markdown, and it drops an html argument without a word` };
  }
  const { html: body, figures, images } = bodyForLeaf(html, base);
  const canUpload = tools.includes(FIGURE_TOOL);
  const missing = [];
  let urls = [];
  let shots = [];

  if (canUpload) {
    urls = await upAll({ session, pieces: figures, what: "drawing", missing });
    shots = await upAll({ session, pieces: images, what: "image", missing });
  } else if (figures.length || images.length) {
    missing.push({ n: -1, why: `this leaf has no ${FIGURE_TOOL} yet, so ${figures.length + images.length} drawings and images stayed behind` });
  }

  const pinned = canUpload ? pinFigures(pinFigures(body, urls), shots, IMAGE_MARK) : body;
  const page = sayMissing(pinned);
  if (page.length > PAGE_CEILING) {
    return { error: `the page is ${Math.round(page.length / 1024)} kB of html, over the ${PAGE_CEILING / 1000} kB the leaf takes` };
  }
  if (!page.trim()) return { error: "there is nothing left of that page to send" };

  const wrote = docId
    ? await session.call("update_document", { documentId: docId, html: page, mode: "replace" })
    : await session.call("create_document", { title, html: page, ...(parentId ? { parentId } : {}) });
  if (wrote.error) return { error: wrote.error };

  const id = String(wrote.said?.id || docId || "");
  if (!id) return { error: "the leaf wrote the page but gave no id" };

  return {
    id,
    url: String(wrote.said?.url || ""),
    how: docId ? "updated" : "created",
    drawings: urls.filter(Boolean).length,
    images: shots.filter(Boolean).length,
    kept: figures.length + images.length,
    missing
  };
}

export const figureMarkOf = FIGURE_MARK;
