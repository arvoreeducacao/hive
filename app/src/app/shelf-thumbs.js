const THUMB_PARTITION = "shelf-thumbs";
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 300;
const SETTLE_MS = 800;
const GIVE_UP_MS = 20000;
const REMEMBERED = 200;

const answered = new Set();
let taking = "";

const mainWindow = () => {
  try { return !new URLSearchParams(location.search).get("seat"); } catch { return true; }
};

const inTheApp = () => /Electron/i.test(navigator.userAgent) && mainWindow() && !document.hidden;

function shrink(url) {
  return new Promise((resolve, reject) => {
    const picture = new Image();
    picture.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_WIDTH;
      canvas.height = THUMB_HEIGHT;
      canvas.getContext("2d").drawImage(picture, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      resolve(canvas.toDataURL("image/png"));
    };
    picture.onerror = () => reject(new Error("the capture could not be read back"));
    picture.src = url;
  });
}

function shootShelfPage({ slug, tab, v }) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("webview");
    frame.setAttribute("partition", THUMB_PARTITION);
    frame.className = "shelf-thumb-stage";
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("src", `shelf://${slug}/?tab=${encodeURIComponent(tab)}&v=${Number(v)}`);
    let over = false;
    const finish = (settle, value) => {
      if (over) return;
      over = true;
      clearTimeout(giveUp);
      frame.remove();
      settle(value);
    };
    const giveUp = setTimeout(() => finish(reject, new Error("the page never finished loading")), GIVE_UP_MS);
    frame.addEventListener("did-fail-load", (ev) => {
      if (ev.isMainFrame === false || ev.errorCode === -3) return;
      finish(reject, new Error(ev.errorDescription || "the page did not load"));
    });
    frame.addEventListener("did-stop-loading", () => setTimeout(async () => {
      try {
        const shot = await frame.capturePage();
        if (shot.isEmpty()) throw new Error("the page gave back an empty frame");
        finish(resolve, await shrink(shot.toDataURL()));
      } catch (err) {
        finish(reject, err);
      }
    }, SETTLE_MS), { once: true });
    document.body.appendChild(frame);
  });
}

function remember(id) {
  answered.add(id);
  if (answered.size > REMEMBERED) answered.delete(answered.values().next().value);
}

function hand(id, data) {
  return fetch("/api/shelf/thumb/taken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, data })
  }).catch(() => {});
}

function takeShelfThumbs(jobs, { shoot = shootShelfPage, send = hand, here = inTheApp } = {}) {
  if (taking || !Array.isArray(jobs) || !jobs.length || !here()) return null;
  const job = jobs.find((one) => one && !answered.has(one.id));
  if (!job) return null;
  taking = job.id;
  return shoot(job)
    .then((data) => send(job.id, data), () => send(job.id, ""))
    .finally(() => {
      remember(job.id);
      taking = "";
    });
}

export { SETTLE_MS, THUMB_HEIGHT, THUMB_PARTITION, THUMB_WIDTH, shootShelfPage, takeShelfThumbs };
