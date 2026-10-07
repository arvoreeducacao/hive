import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [file, out] = process.argv.slice(2);

if (!file || !out) {
  console.error("usage: sign-pack.mjs <pack> <signature>");
  process.exit(2);
}

const held = String(process.env.HIVE_OTA_KEY || "").trim();

if (!held) {
  console.error("no HIVE_OTA_KEY in the environment — a pack nobody signed is a pack no Hive will take");
  process.exit(1);
}

const pem = held.includes("BEGIN") ? held : Buffer.from(held, "base64").toString("utf8");

writeFileSync(out, sign(null, readFileSync(file), createPrivateKey(pem)));
console.log(`signed ${file}`);
