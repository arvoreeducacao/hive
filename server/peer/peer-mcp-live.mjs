import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { liveServerRoot, peerModuleIn } from "../engine/peer-module.mjs";
import { stateDir } from "../engine/paths.mjs";

const beside = join(dirname(fileURLToPath(import.meta.url)), "peer-mcp.mjs");
const live = peerModuleIn(liveServerRoot({ shipped: process.env.HIVE_APP_SHIPPED || "", home: stateDir() }));

await import(pathToFileURL(live || beside).href);
