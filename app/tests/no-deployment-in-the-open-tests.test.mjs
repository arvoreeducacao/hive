import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(`${REPO}${path}`, "utf8");

const tracked = execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 24 })
  .split("\n")
  .filter(Boolean);

const deploymentsIn = (paths) => paths
  .filter((path) => /^[^/]+\/hive\.defaults$/.test(path))
  .map((path) => path.slice(0, path.indexOf("/")));

const DEPLOYMENT_FLOWS = ["arvore", "deploy", "release", "release-js", "release-linux", "release-windows"].map((name) => `${name}.yml`);

const isTest = (path) => /(^|\/)tests?\//.test(path) && /\.(mjs|js|cjs)$/.test(path);
const isFlow = (path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path);
const flowName = (path) => path.slice(path.lastIndexOf("/") + 1);

const READERS = /^(read\w*|exists\w*|stat\w*|lstat\w*|access\w*|open\w*|createReadStream|spawn\w*|exec\w*|fork|join|resolve|URL|import|require|copy\w*|cp\w*)$/;

const calleeBefore = (head) => {
  let depth = 0;
  for (let at = head.length - 1; at >= 0; at -= 1) {
    if (head[at] === ")") depth += 1;
    if (head[at] !== "(") continue;
    if (depth) { depth -= 1; continue; }
    return (/([A-Za-z_$][\w$]*)\s*$/.exec(head.slice(0, at)) || [])[1] || "";
  }
  return "";
};

const STRING = /"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/;
const RUN = new RegExp(`(${STRING.source})(\\s*,\\s*(${STRING.source}))*`, "g");
const ITEM = new RegExp(STRING.source, "g");

const segmentOf = (literal) => {
  const body = literal.slice(1, -1);
  return body.includes("${") ? body.slice(body.lastIndexOf("}") + 1) : body;
};

const basesOf = (path) => {
  const bases = [""];
  for (let dir = posix.dirname(path); dir !== "."; dir = posix.dirname(dir)) bases.push(dir);
  return bases;
};

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function guardOver(paths, flows = DEPLOYMENT_FLOWS) {
  const deployments = deploymentsIn(paths);
  const ownerOf = (path) => deployments.find((folder) => path.startsWith(`${folder}/`));
  const intoADeployment = (path) => !path.startsWith("..") && !!ownerOf(`${path}/`);
  const namesADeployment = (path) => deployments.some((folder) => new RegExp(`(^|/)${escaped(folder)}(/|$)`).test(path));
  const whatIsThere = new Set(paths.flatMap((path) => {
    const parts = path.split("/");
    return parts.map((_, at) => parts.slice(0, at + 1).join("/"));
  }));

  const flowsLeftBehind = new RegExp(`(^|\\.github/workflows/)(${flows.map(escaped).join("|")})$`);

  const reachOf = (head) => {
    if (READERS.test(calleeBefore(head)) || /(\bfrom|\bimport)\s*$/.test(head)) return intoADeployment;
    if (/=\s*$/.test(head)) return (path) => intoADeployment(path) && whatIsThere.has(path);
    return null;
  };

  function readsInCode(path, text) {
    const found = [];
    for (const [at, line] of text.split("\n").entries()) {
      for (const run of line.matchAll(RUN)) {
        const items = run[0].match(ITEM).map(segmentOf);
        const named = items.find((one) => flowsLeftBehind.test(one));
        if (named) {
          found.push(`${path}:${at + 1}: ${line.trim().slice(0, 120)}`);
          continue;
        }
        const joined = items.filter(Boolean).join("/").replace(/\/{2,}/g, "/");
        if (!namesADeployment(joined)) continue;
        const head = line.slice(0, run.index);
        const reach = reachOf(head);
        if (!reach) continue;
        if (!joined.includes("/") && !/\b(join|resolve)\([^"'`]*,\s*$/.test(head)) continue;
        const relative = joined.replace(/^\/+/, "");
        if (basesOf(path).some((base) => reach(posix.normalize(posix.join(base, relative))))) {
          found.push(`${path}:${at + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    return found;
  }

  function readsInFlow(path, text) {
    const found = [];
    for (const [at, line] of text.split("\n").entries()) {
      for (const word of line.split(/[\s"'=;|&()]+/)) {
        const target = word.replace(/^\.\//, "").replace(/\/+$/, "");
        if (target && intoADeployment(posix.normalize(target))) found.push(`${path}:${at + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    return found;
  }

  const openTests = () => paths.filter((path) => isTest(path) && !ownerOf(path));
  const openFlows = () => paths.filter((path) => isFlow(path) && !flows.includes(flowName(path)));

  return { readsInCode, readsInFlow, openTests, openFlows };
}

const guard = guardOver(tracked);

test("no test outside a deployment folder reads a file inside one, or a workflow that leaves with it, so the tree passes without them", () => {
  const found = guard.openTests().flatMap((path) => guard.readsInCode(path, read(path)));
  assert.deepEqual(found, [],
    `\nthese read a deployment's own files — an assertion about them belongs in that folder's tests, and one about the app takes a fixture:\n${found.join("\n")}\n`);
});

test("no open workflow runs or reads anything inside a deployment folder", () => {
  const found = guard.openFlows().flatMap((path) => guard.readsInFlow(path, read(path)));
  assert.deepEqual(found, [], `\nthese workflows reach into a deployment, so they belong in that deployment's own workflow:\n${found.join("\n")}\n`);
});

test("the guard knows the shapes a test reaches a deployment by, and leaves alone what only looks like one", () => {
  const { readsInCode, readsInFlow, openTests } = guardOver([
    "acme/hive.defaults", "acme/k8s/door.yaml", "acme/tests/door.test.mjs", "app/tests/x.test.mjs", "app/lib/acme/y.mjs"
  ], ["acme.yml", "ship.yml"]);
  assert.deepEqual(openTests(), ["app/tests/x.test.mjs"]);
  const shapes = [
    'read("acme/k8s/door.yaml");',
    'readFileSync(join(REPO, "acme", "k8s", "door.yaml"));',
    'readFileSync(join(HERE, "..", "acme", "k8s", "door.yaml"));',
    'readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "acme/k8s/door.yaml"));',
    'readFileSync(new URL("../../acme/hive.defaults", import.meta.url));',
    'existsSync(`${REPO}/acme/k8s/door.yaml`);',
    'existsSync(join(REPO, "acme"));',
    'existsSync(join(REPO, "acme/k8s/a-file-that-is-gone.yaml"));',
    'spawnSync(join(REPO, "acme", "hive-setup.sh"), ["ada"]);',
    'const DEPLOYMENT = "acme/hive.defaults";',
    'import { x } from "../../acme/scripts/x.mjs";',
    'const deploy = read(".github/workflows/ship.yml");',
    'const mac = triggerPaths("ship.yml");',
    'for (const flow of ["ci.yml", "acme.yml"]) {'
  ];
  for (const shape of shapes) {
    assert.equal(readsInCode("app/tests/x.test.mjs", shape).length, 1, `the guard missed: ${shape}`);
  }
  const strangers = [
    'const repo = "acme/hive";',
    'join(HIVE, "accounts", "acme");',
    '{ owner: "acme" }',
    'assert.equal(keptOut("acme/k8s/door.yaml"), true);',
    'bar([roomy, dry], "acme");',
    'fetch("https://linear.app/acme/issue/EXP-1");',
    'readFileSync("/Users/ada/repos/dev-workspaces/acme/k8s/door.yaml");',
    'monacoLanguageOf("lib/acme/jobs/cron_lock.ex");',
    'const ci = read(".github/workflows/ci.yml");',
    'assert.equal(isChangePath("ship.yml.bak"), true);'
  ];
  for (const stranger of strangers) {
    assert.deepEqual(readsInCode("app/tests/x.test.mjs", stranger), [], `the guard flagged what reads nothing: ${stranger}`);
  }
  assert.equal(readsInFlow("x.yml", "run: node --test app/tests/*.test.mjs acme/tests/*.test.mjs").length, 1);
  assert.equal(readsInFlow("x.yml", "run: shellcheck -S error infra/scripts/*.sh ./acme/scripts/*.sh").length, 1);
  assert.deepEqual(readsInFlow("x.yml", "run: node --test app/tests/*.test.mjs infra/tests/*.test.mjs"), []);
  assert.deepEqual(readsInFlow("x.yml", '      - "*/hive.defaults"'), []);
});
