const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const HERE = require("node:path").join(__dirname, "..");
const ENTRYPOINTS = ["main.js", "main/boot.js", "server.mjs"];
const RELATIVE_IMPORT = /(?:^|[^\w$.])(?:from|import|require)\s*\(?\s*["'](\.[^"']*)["']/g;

function importsIn(source) {
  const found = new Set();
  for (const line of source.split("\n")) {
    for (const hit of line.matchAll(RELATIVE_IMPORT)) found.add(hit[1]);
  }
  return [...found];
}

function resolveImport(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const tries = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, path.join(base, "index.js")];
  return tries.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || "";
}

function reachedFrom(entrypoints) {
  const seen = new Set();
  const queue = entrypoints.map((name) => path.join(HERE, name));
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const spec of importsIn(fs.readFileSync(file, "utf8"))) {
      const target = resolveImport(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen];
}

function packagedBy(patterns) {
  const globs = patterns.filter((p) => p.includes("*")).map((p) => p.replace(/\/\*\*$/, ""));
  const exact = new Set(patterns.filter((p) => !p.includes("*")));
  return (relative) => exact.has(relative) || globs.some((dir) => relative.startsWith(`${dir}/`));
}

test("every file the app reaches at runtime is in build.files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const packaged = packagedBy(pkg.build.files);
  const missing = reachedFrom(ENTRYPOINTS)
    .map((file) => path.relative(HERE, file).split(path.sep).join("/"))
    .filter((relative) => !relative.startsWith("..") && !packaged(relative));
  assert.deepStrictEqual(
    missing,
    [],
    `these files ship nowhere — add them to build.files in app/package.json: ${missing.join(", ")}`
  );
});

test("the walk follows static, dynamic and required imports", () => {
  const source = [
    'import { a } from "./one.mjs";',
    'const b = require("./two.js");',
    'const c = await import("./three.mjs");',
    'export { d } from "./four.mjs";',
    'import fs from "node:fs";',
    'import x from "@xterm/xterm";'
  ].join("\n");
  assert.deepStrictEqual(importsIn(source), ["./one.mjs", "./two.js", "./three.mjs", "./four.mjs"]);
});

test("a file outside build.files is caught", () => {
  const packaged = packagedBy(["main.js", "assets/**"]);
  assert.strictEqual(packaged("main.js"), true);
  assert.strictEqual(packaged("assets/markdown.mjs"), true);
  assert.strictEqual(packaged("peers.mjs"), false);
});

test("the entrypoints reach the modules the server pulls in", () => {
  const reached = reachedFrom(ENTRYPOINTS).map((file) => path.relative(HERE, file).split(path.sep).join("/"));
  for (const file of ["lib/fleet.mjs", "main/update.js"]) assert.ok(reached.includes(file), `${file} was not reached`);
});

test("what the app imports from outside its own folder ships as extraResources", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const shipped = [];
  for (const entry of pkg.build.extraResources) {
    for (const file of entry.filter || []) shipped.push(path.posix.join(entry.to, file));
  }
  const outside = reachedFrom(ENTRYPOINTS)
    .map((file) => path.relative(HERE, file))
    .filter((relative) => relative.startsWith(".."));
  assert.ok(outside.length, "the app imports nothing from outside its folder — this test lost its subject");
  const missing = outside.filter((relative) => !shipsUnder(shipped, relative.split(path.sep).slice(1).join("/")));
  assert.deepStrictEqual(
    missing,
    [],
    `the app imports these from outside app/, but they ship nowhere — add them to extraResources in app/package.json: ${missing.join(", ")}`
  );
});

test("the sidecars the server spawns by path ship as extraResources", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const shipped = [];
  for (const entry of pkg.build.extraResources) {
    for (const file of entry.filter || []) shipped.push(path.posix.join(entry.to, file));
  }
  const source = fs.readFileSync(path.join(HERE, "server.mjs"), "utf8");
  for (const hit of source.matchAll(/join\(HERE, "\.\.\/([^"]+\.mjs)"\)/g)) {
    const sidecar = hit[1];
    assert.ok(shipsUnder(shipped, sidecar), `${sidecar} is spawned by path but ships nowhere — add it to extraResources`);
    assert.ok(fs.existsSync(path.join(HERE, "..", sidecar)), `${sidecar} is spawned by path but does not exist`);
  }
});

test("the sidecars the server spawns from its own folder are in build.files", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const packaged = packagedBy(pkg.build.files);
  const source = fs.readFileSync(path.join(HERE, "server.mjs"), "utf8");
  const spawned = [...source.matchAll(/join\(HERE, "([^".\/][^"]*\.mjs)"\)/g)].map((hit) => hit[1]);
  assert.ok(spawned.length, "the server names no sidecar of its own — this test lost its subject");
  for (const sidecar of spawned) {
    assert.ok(fs.existsSync(path.join(HERE, sidecar)), `${sidecar} is spawned by path but does not exist`);
    assert.ok(packaged(sidecar), `${sidecar} is spawned by path but ships nowhere — add it to build.files`);
  }
});

function shipsUnder(patterns, relative) {
  return patterns.some((pattern) => {
    const rx = new RegExp("^" + pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*") + "$");
    return rx.test(relative);
  });
}

function serverFilesUnder(dir, root = dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "tests") continue;
      found.push(...serverFilesUnder(full, root));
      continue;
    }
    if (entry.name.endsWith(".mjs") && !entry.name.includes(".test.")) found.push(path.relative(root, full));
  }
  return found;
}

test("what the app runs from server/ ships with it, imports included", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const entry = pkg.build.extraResources.find((one) => one.from === "../server");
  const shipped = entry.filter || [];
  const serverDir = path.join(HERE, "..", "server");
  const entrypoints = new Set();
  const under = serverFilesUnder(serverDir);
  for (const source of ["server.mjs", "lib/fleet.mjs", "lib/accounts.mjs"].map((one) => fs.readFileSync(path.join(HERE, one), "utf8"))) {
    for (const hit of source.matchAll(/\.\.\/server\/([\w/-]+\.mjs)/g)) {
      const found = under.find((one) => one === hit[1] || one === path.join("..", hit[1]));
      if (found) entrypoints.add(path.join("..", "server", found));
    }
  }
  assert.ok(entrypoints.size, "the app names no file from server/ — this test lost its subject");
  const missing = reachedFrom([...entrypoints])
    .map((file) => path.relative(serverDir, file))
    .filter((relative) => !relative.startsWith("..") && !shipsUnder(shipped, relative));
  assert.deepStrictEqual(
    missing,
    [],
    `these server files ship nowhere — add them to the ../server filter in extraResources: ${missing.join(", ")}`
  );
});

test("what the server spawns by path from server/ ships with the app", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const entry = pkg.build.extraResources.find((one) => one.from === "../server");
  const shipped = entry.filter || [];
  const serverDir = path.join(HERE, "..", "server");
  const spawned = new Set();
  const under = serverFilesUnder(serverDir);
  for (const file of under) {
    const source = fs.readFileSync(path.join(serverDir, file), "utf8");
    for (const hit of source.matchAll(/join\(\s*(?:HERE|serverDir|gatewayDir)\s*,\s*"([\w-]+\.mjs)"/g)) {
      const found = under.find((one) => path.basename(one) === hit[1]);
      if (found) spawned.add(found);
    }
  }
  assert.ok(spawned.size, "no server file is spawned by path any more — this test lost its subject");
  const missing = [...spawned].filter((file) => !shipsUnder(shipped, file));
  assert.deepStrictEqual(
    missing,
    [],
    `spawned by path but ships nowhere — the installed app would find no file there: ${missing.join(", ")}`
  );
});

test("build.files names only things that are here", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
  const shipped = pkg.build.files
    .filter((one) => !one.startsWith("!") && !one.startsWith("node_modules"))
    .map((one) => one.replace(/\/\*\*$/, ""));
  const STAMPED = new Set(["build.json"]);
  const gone = shipped.filter((one) => !STAMPED.has(one) && !fs.existsSync(path.join(HERE, one)));
  assert.deepStrictEqual(gone, [], `build.files names things that are not here: ${gone.join(", ")}`);
});
test("the stamp lands in the one place the server reads, the package ships, and git ignores", () => {
  const stamped = path.join(HERE, "build.json");
  const beside = path.join(HERE, "main", "build.json");
  const before = fs.existsSync(stamped) ? fs.readFileSync(stamped) : null;
  const strayBefore = fs.existsSync(beside);
  try {
    fs.rmSync(stamped, { force: true });
    require("node:child_process").execFileSync(process.execPath, [path.join(HERE, "main", "stamp.mjs")], { stdio: "pipe" });
    assert.ok(fs.existsSync(stamped), "npm run stamp no longer writes app/build.json, which is the only stamp the server reads");
    assert.ok(!fs.existsSync(beside) || strayBefore, "the stamp wrote app/main/build.json, a place nothing reads and git does not ignore");

    const server = fs.readFileSync(path.join(HERE, "server.mjs"), "utf8");
    assert.match(server, /readFileSync\(join\(HERE, "build\.json"\)/, "the server stopped reading the stamp from app/build.json");

    const pkg = JSON.parse(fs.readFileSync(path.join(HERE, "package.json"), "utf8"));
    assert.ok(pkg.build.files.includes("build.json"), "build.files stopped shipping the stamp, so the packaged app would carry none");

    const ignored = fs.readFileSync(path.join(HERE, "..", ".gitignore"), "utf8").split("\n").map((line) => line.trim());
    assert.ok(ignored.includes("app/build.json"), "the stamp is no longer ignored, so every build would dirty the checkout");
  } finally {
    if (before) fs.writeFileSync(stamped, before); else fs.rmSync(stamped, { force: true });
  }
});
