import { filesCanGoBack, forkChat, revertFiles } from "../lib/chat-rewind.mjs";

export function registerRewindRoutes(on, { bodyOf, isSeatName, seatOf, checkpoints, readEvents, readMeta, fork, readTranscript, open }) {
  const answer = async (json, job) => {
    try {
      const said = await job();
      return json(said, said.error ? said.status || 409 : 200);
    } catch (wrong) {
      return json({ error: String(wrong?.message || wrong) }, 500);
    }
  };

  on("GET", "/api/chat/revert-files", async (req, res, url, json) => {
    const name = url.searchParams.get("name");
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    return answer(json, () => filesCanGoBack({ seat: seatOf(name), seq: url.searchParams.get("seq"), readEvents, checkpoints }));
  });

  on("POST", "/api/chat/revert-files", async (req, res, url, json) => {
    const data = await bodyOf(req);
    if (!isSeatName(data.name)) return json({ error: "unknown session" }, 400);
    return answer(json, () => revertFiles({ seat: seatOf(data.name), seq: data.seq, readEvents, checkpoints }));
  });

  on("POST", "/api/chat/fork", async (req, res, url, json) => {
    const data = await bodyOf(req);
    if (!isSeatName(data.name)) return json({ error: "unknown session" }, 400);
    return answer(json, () => forkChat({ seat: seatOf(data.name), seq: data.seq, title: data.title, readEvents, readMeta, fork, readTranscript, open }));
  });
}
