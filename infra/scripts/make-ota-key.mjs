import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const secret = privateKey.export({ type: "pkcs8", format: "pem" });
const inTheApp = publicKey.export({ type: "spki", format: "pem" });

console.log("# the secret — paste into the repository secret HIVE_OTA_KEY, keep a copy in 1Password, and never commit it");
console.log(secret.trim());
console.log("");
console.log("# the public half — this is what goes into RELEASE_KEY in app/main/ota.js");
console.log(JSON.stringify(inTheApp));
