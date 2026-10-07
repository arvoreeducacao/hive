import { createServer } from "node:http";
import { spawn } from "node:child_process";

import {
  NO_LEAF,
  canWrite,
  codeForm,
  consentUrl,
  heldOf,
  leafBase,
  leafSession,
  mcpUrl,
  registration,
  stale
} from "./lib/leaf-link.mjs";
import { heldFile, keepHeld, metadataOf, readHeld, refreshed } from "./lib/leaf-held.mjs";

const HELD_FILE = heldFile();
const PORT = Number(process.env.LEAF_LOGIN_PORT) || 8899;
const REDIRECT = `http://127.0.0.1:${PORT}/leaf`;

const say = (line) => process.stdout.write(`${line}\n`);

async function asJson(url, asked) {
  const answer = await fetch(url, asked);
  const text = await answer.text();
  let body = {};
  try { body = JSON.parse(text); } catch {}
  if (!answer.ok) {
    const why = body.error_description || body.error || text.slice(0, 200) || `http ${answer.status}`;
    return { error: `${url.replace(/\?.*/, "")} answered ${answer.status}: ${why}` };
  }
  return { body };
}

async function clientOf(base, endpoints, was) {
  if (was.clientId && was.redirect === REDIRECT) return { clientId: was.clientId };
  if (!endpoints.register) return { error: "this leaf does not let a client register itself" };
  const made = await asJson(endpoints.register, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(registration(REDIRECT))
  });
  if (made.error) return made;
  const clientId = String(made.body.client_id || "");
  if (!clientId) return { error: "the leaf registered the client but gave no id" };
  say(`registered this hive as a client of ${base}`);
  return { clientId };
}

function waitForCode(state) {
  return new Promise((then) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, REDIRECT);
      if (url.pathname !== "/leaf") {
        res.writeHead(404).end();
        return;
      }
      const said = {
        code: url.searchParams.get("code") || "",
        state: url.searchParams.get("state") || "",
        error: url.searchParams.get("error_description") || url.searchParams.get("error") || ""
      };
      const bad = said.error || (said.state !== state ? "the answer came back with the wrong state" : "") || (!said.code ? "the answer came back without a code" : "");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><meta charset="utf-8"><title>Hive e Leaf</title><body style="font:16px system-ui;padding:48px;max-width:34rem">${bad ? `<p>Deu errado: ${bad}</p>` : "<p>Pronto. O Hive já pode escrever no Leaf como você. Pode fechar esta aba.</p>"}`);
      server.close();
      then(bad ? { error: bad } : { code: said.code });
    });
    server.listen(PORT, "127.0.0.1");
    server.on("error", (err) => then({ error: `port ${PORT} is taken: ${err.message}` }));
  });
}

function openInBrowser(url) {
  if (process.platform !== "darwin") return;
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

async function prove(base, access) {
  const session = leafSession({ base, token: access });
  const opened = await session.open();
  if (opened.error) return opened;
  const listed = await session.tools();
  if (listed.error) return listed;
  return { tools: listed.tools };
}

async function main() {
  const base = leafBase();
  if (!base) return { error: NO_LEAF };
  const asked = await metadataOf(base);
  if (asked.error) return asked;
  const endpoints = asked.endpoints;

  const was = readHeld();
  const client = await clientOf(base, endpoints, was);
  if (client.error) return client;
  const resource = mcpUrl(base);

  if (was.refresh && was.clientId === client.clientId) {
    const again = await refreshed({ was, endpoints, base });
    if (!again.error) {
      keepHeld({ base, clientId: client.clientId, redirect: REDIRECT, ...again.held });
      return { how: "refreshed", base, next: again.held };
    }
    say("the refresh no longer works, asking you to approve again");
  }

  const consent = consentUrl({ endpoints, clientId: client.clientId, redirect: REDIRECT, resource });
  const waiting = waitForCode(consent.state);
  say("");
  say("Abra este endereço e aprove o acesso do Hive (você precisa estar logado no Leaf):");
  say(consent.url);
  say("");
  openInBrowser(consent.url);

  const back = await waiting;
  if (back.error) return back;

  const got = await asJson(endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: codeForm({ clientId: client.clientId, redirect: REDIRECT, code: back.code, verifier: consent.verifier, resource }).toString()
  });
  if (got.error) return got;
  const next = heldOf(got.body);
  if (next.error) return next;
  keepHeld({ base, clientId: client.clientId, redirect: REDIRECT, ...next });
  return { how: "approved", base, next };
}

const done = await main();
if (done.error) {
  process.stderr.write(`${done.error}\n`);
  process.exit(1);
}

say(`${done.how}: the hive holds a leaf token for ${done.base}`);
say(`it lasts ${Math.round((done.next.expiresAt - Date.now()) / 60000)} min and renews itself; write access: ${canWrite(done.next) ? "yes" : "no"}`);
say(`kept in ${HELD_FILE}, readable only by you`);
if (stale(done.next)) say("careful: the token came back already expired");

const proven = await prove(done.base, done.next.access);
if (proven.error) {
  process.stderr.write(`the token was kept, but the mcp refused it: ${proven.error}\n`);
  process.exit(1);
}
say(`the leaf offers: ${proven.tools.join(", ")}`);
