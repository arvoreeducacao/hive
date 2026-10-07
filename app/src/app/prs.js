import { render } from "./arrange.js";
import { apiGet, st } from "./core.js";
import { paintThread, threadVisible } from "./thread.js";

const CI_LABEL = { passed: "ci ok", failed: "ci failed", running: "ci running", none: "no ci" };

const REVIEW_LABEL = { approved: "approved", changes_requested: "changes requested", review_required: "no review" };

const LINE_CAP = 400;

const MINUTE_CAP = 60;

st.prs = [];

st.openPr = null;

st.reviewChat = null;

st.openFile = null;

st.threads = [];

let threadsShape = "";

async function pullThreads(close) {
  let threads;
  try {
    const d = await apiGet(`/api/threads${close ? "?close=1" : ""}`);
    threads = d.threads || [];
  } catch { return; }
  const shape = JSON.stringify(threads);
  if (shape === threadsShape) return;
  threadsShape = shape;
  st.threads = threads;
  render();
  if (threadVisible()) paintThread();
}

export { CI_LABEL, LINE_CAP, MINUTE_CAP, REVIEW_LABEL, pullThreads };
