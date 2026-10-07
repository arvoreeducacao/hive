import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const FLOW_DIR = join(REPO, ".github/workflows");

const flows = () => readdirSync(FLOW_DIR).filter((name) => name.endsWith(".yml"));
const textOf = (name) => readFileSync(join(FLOW_DIR, name), "utf8");

test("every working-directory a workflow names exists in the repo", () => {
  const missing = [];
  for (const name of flows()) {
    for (const hit of textOf(name).matchAll(/working-directory:\s*(\S+)/g)) {
      const dir = hit[1].replace(/["']/g, "");
      if (dir.startsWith("$")) continue;
      if (!existsSync(join(REPO, dir))) missing.push(`${name}: working-directory ${dir}`);
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("every dockerfile a workflow builds exists", () => {
  const missing = [];
  for (const name of flows()) {
    for (const hit of textOf(name).matchAll(/docker build[^\n]*?-f\s+(\S+)/g)) {
      if (!existsSync(join(REPO, hit[1]))) missing.push(`${name}: -f ${hit[1]}`);
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

const OPEN_FLOWS = ["ci.yml"];

const testGlobsOf = (name) => textOf(name).split("\n")
  .filter((line) => line.includes("node --test"))
  .flatMap((line) => line.split(/\s+/).filter((word) => word.includes("tests/") && word.includes("*")));

const topFolderOf = (glob) => glob.split("/")[0];

test("every test glob a workflow runs matches at least one file", () => {
  const missing = [];
  for (const name of flows()) {
    for (const glob of testGlobsOf(name)) {
      if (!OPEN_FLOWS.includes(name) && !existsSync(join(REPO, topFolderOf(glob)))) continue;
      const dir = join(REPO, dirname(glob));
      const tail = glob.slice(glob.lastIndexOf("/") + 1).replace("*", "");
      const found = existsSync(dir) && readdirSync(dir).some((file) => file.endsWith(tail));
      if (!found) missing.push(`${name}: ${glob} matches nothing`);
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("no workflow still names a folder this repo no longer has", () => {
  const gone = ["driver", "broker"];
  const found = [];
  for (const name of flows()) {
    for (const line of textOf(name).split("\n")) {
      for (const folder of gone) {
        if (existsSync(join(REPO, folder))) continue;
        const rx = new RegExp(`(working-directory:\\s*|-f\\s+|\\s)${folder}(/|\\s|$)`);
        if (rx.test(line)) found.push(`${name}: still names ${folder}/ — ${line.trim().slice(0, 70)}`);
      }
    }
  }
  assert.deepEqual(found, [], found.join("\n"));
});

test("every bare import a ci test reaches is one the ci installs", () => {
  const BARE = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"]([^.'"][^'"]*)['"]/g;
  const RELATIVE = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.[^'"]+)['"]/g;
  const BARE_REQUIRE = /require(?:\.resolve)?\(\s*['"]([^.'"][^'"]*)['"]\s*\)/g;
  const RELATIVE_REQUIRE = /require(?:\.resolve)?\(\s*['"](\.[^'"]+)['"]\s*\)/g;

  const packageOf = (file) => {
    let dir = dirname(file);
    while (dir.startsWith(REPO)) {
      if (existsSync(join(dir, "package.json"))) return dir;
      dir = dirname(dir);
    }
    return "";
  };

  const reached = (entry, seen = new Set()) => {
    if (seen.has(entry) || !existsSync(entry)) return seen;
    seen.add(entry);
    const text = readFileSync(entry, "utf8");
    for (const pattern of [RELATIVE, RELATIVE_REQUIRE]) {
      for (const hit of text.matchAll(pattern)) {
        const target = resolve(dirname(entry), hit[1]);
        reached(target, seen);
      }
    }
    return seen;
  };

  const missing = [];
  for (const name of flows()) {
    const text = textOf(name);
    const installs = new Set([...text.matchAll(/working-directory:\s*(\S+)/g)].map((hit) => hit[1].replace(/["']/g, "")));
    for (const line of text.split("\n")) {
      if (!line.includes("node --test")) continue;
      for (const glob of line.split(/\s+/).filter((word) => word.includes("tests/") && word.includes("*"))) {
        const dir = join(REPO, dirname(glob));
        if (!existsSync(dir)) continue;
        const tail = glob.slice(glob.lastIndexOf("/") + 1).replace("*", "");
        for (const file of readdirSync(dir).filter((one) => one.endsWith(tail))) {
          for (const touched of reached(join(dir, file))) {
            const home = packageOf(touched);
            if (!home) continue;
            const folder = relative(REPO, home) || ".";
            const source = readFileSync(touched, "utf8");
            const bare = [...source.matchAll(BARE), ...source.matchAll(BARE_REQUIRE)]
              .map((hit) => hit[1])
              .filter((one) => !one.startsWith("node:"));
            if (!bare.length) continue;
            if (!installs.has(folder)) missing.push(`${name}: ${relative(REPO, touched)} needs ${bare.join(", ")} but ${folder} is never installed`);
          }
        }
      }
    }
  }
  assert.deepEqual([...new Set(missing)], [], [...new Set(missing)].join("\n"));
});

test("a job that installs a native module runs where it can be compiled", () => {
  const LEAN = "arc-runner-set";
  const native = [];
  for (const dir of ["app", "server", "mobile"]) {
    const file = join(REPO, dir, "package.json");
    if (!existsSync(file)) continue;
    const deps = Object.keys(JSON.parse(readFileSync(file, "utf8")).dependencies || {});
    if (deps.includes("node-pty")) native.push(dir);
  }
  assert.ok(native.length, "no folder has a native module — this test lost its subject");

  const wrong = [];
  for (const name of flows()) {
    const lines = textOf(name).split("\n");
    let runner = "";
    let boxed = false;
    for (let at = 0; at < lines.length; at += 1) {
      const job = lines[at].match(/^  [a-z][\w-]*:\s*$/);
      if (job) { runner = ""; boxed = false; continue; }
      const on = lines[at].match(/runs-on:\s*(\S+)/);
      if (on) { runner = on[1].replace(/["']/g, ""); continue; }
      if (/^\s*container:/.test(lines[at])) { boxed = true; continue; }
      const dir = lines[at].match(/working-directory:\s*(\S+)/);
      if (!dir || runner !== LEAN) continue;
      if (!native.includes(dir[1].replace(/["']/g, ""))) continue;
      const run = lines[at - 1] || "";
      if (!run.includes("npm ci")) continue;
      if (run.includes("--ignore-scripts")) {
        wrong.push(`${name}: npm ci in ${dir[1]} skips scripts, so node-pty ships no binary and every test that boots the app fails`);
      } else if (!boxed) {
        wrong.push(`${name}: npm ci in ${dir[1]} on ${LEAN} compiles node-pty, and that runner has no make — the job needs a container that does`);
      }
    }
  }
  assert.deepEqual([...new Set(wrong)], [], [...new Set(wrong)].join("\n"));
});
test("no workflow runs tests without a ceiling on how long one may take", () => {
  const loose = [];
  for (const name of flows()) {
    const text = readFileSync(join(FLOW_DIR, name), "utf8");
    for (const line of text.split("\n")) {
      if (!/node --test\b/.test(line)) continue;
      if (!/--test-timeout=\d+/.test(line)) loose.push(`${name}: ${line.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(loose, [], `a test that never answers holds the runner forever:\n${loose.join("\n")}`);
});

test("a test that opens a stream or a server releases it even when it fails", () => {
  const dirs = ["server/tests", "app/tests"];
  const guilty = [];
  for (const dir of dirs) {
    for (const name of readdirSync(join(REPO, dir))) {
      if (!/\.test\.(mjs|js)$/.test(name)) continue;
      const text = readFileSync(join(REPO, dir, name), "utf8");
      for (const block of text.split(/\ntest\(/).slice(1)) {
        const opens = /attachStream\(|attachServerStream\(/.test(block);
        if (!opens) continue;
        if (!/finally\s*\{/.test(block)) guilty.push(`${dir}/${name}`);
      }
    }
  }
  assert.deepEqual([...new Set(guilty)], [], `these open a stream outside a finally, so a failure hangs the run: ${guilty.join(", ")}`);
});

test("a job that needs a tool the lean runner lacks says which image has it", () => {
  const LEAN = new Set(["arc-runner-set", "arc-deploy-set", "arc-runner-set-amd64"]);
  const ABSENT = ["aws", "kubectl", "helm", "make", "node-gyp"];
  const wrong = [];
  for (const name of flows()) {
    const lines = textOf(name).split("\n");
    let runner = "";
    let boxed = false;
    let job = "";
    for (const line of lines) {
      const opens = line.match(/^  ([a-z][\w-]*):\s*$/);
      if (opens) { job = opens[1]; runner = ""; boxed = false; continue; }
      const on = line.match(/runs-on:\s*(\S+)/);
      if (on) { runner = on[1].replace(/["']/g, ""); continue; }
      if (/^\s*container:/.test(line)) { boxed = true; continue; }
      if (!LEAN.has(runner) || boxed) continue;
      if (/docker\s+run/.test(line)) continue;
      for (const tool of ABSENT) {
        if (new RegExp(`(^|[\\s|;&(])${tool}\\s`).test(line)) {
          wrong.push(`${name} / ${job}: runs "${tool}" on ${runner}, which does not have it, and the job declares no container`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(wrong)], [], [...new Set(wrong)].join("\n"));
});

const DOCKERFILES = ["infra/docker/workspace.Dockerfile"];

const builtHere = (text) => new Set([...text.matchAll(/docker build[^\n]*?-t\s+(\S+)/g)].map((hit) => hit[1]));

test("no job pulls from docker hub, where the anonymous quota is shared by the whole org", () => {
  const hub = [];
  const seen = [...flows().map((name) => [name, textOf(name)]), ...DOCKERFILES.map((path) => [path, readFileSync(join(REPO, path), "utf8")])];
  for (const [name, text] of seen) {
    const local = builtHere(text);
    for (const line of text.split("\n")) {
      const image = /(?:container:\s*|image:\s*|docker run[^\n]*?\s|FROM\s+)([a-z][\w.\/-]*:[\w.-]+)/.exec(line);
      if (!image) continue;
      const named = image[1];
      if (named.startsWith("public.ecr.aws/") || named.includes("dkr.ecr.")) continue;
      if (local.has(named)) continue;
      hub.push(`${name}: ${named}`);
    }
  }
  assert.deepEqual(hub, [], "a pull from docker hub is one 429 away from breaking every build in the org");
});

test("every dockerfile the ci builds is one this guard reads", () => {
  const built = new Set();
  for (const name of flows()) for (const hit of textOf(name).matchAll(/docker build[^\n]*?-f\s+(\S+)/g)) built.add(hit[1]);
  assert.deepEqual([...built].filter((path) => !DOCKERFILES.includes(path)), []);
});
