import { scanTranscripts } from "./archive-scan.mjs";

process.once("message", async ({ scan }) => {
  let answer;
  try {
    const found = await scanTranscripts({ ...scan, onProgress: (reached) => process.send({ progress: reached }) });
    answer = { done: found };
  } catch (wrong) {
    answer = { failed: String(wrong?.stack || wrong) };
  }
  process.send(answer, () => process.exit(0));
});
