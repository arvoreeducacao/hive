#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { buildContext, diagnose, doorCanRun, overThePort, run, TIMEOUTS } from "./doctor-runner.mjs";
import { actionOf, actionable, exitCode, fixOutcome, formatHuman } from "./doctor-core.mjs";
import { fixArgv } from "./fix-shell.mjs";

const USAGE = `${process.execPath} ${fileURLToPath(import.meta.url)} [--json] [--fix]

  --json  the report as json, stable contract
  --fix   applies the fixes that need no keyboard, then diagnoses again
          investigations are only listed: they read, they resolve nothing

Runs on the dev's machine and reaches a server that is up through its door.
Only what a stopped box needs goes through the deployment's power switch.
Without --fix it changes nothing, neither here nor on the server.`;

const argv = process.argv.slice(2);
const asked = (flag) => argv.includes(flag);

if (asked("-h") || asked("--help")) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const wantsJson = asked("--json");
const note = (text) => process.stderr.write(`${text}\n`);

let report = await diagnose();

if (asked("--fix")) {
  const targets = report.items.filter((item) => actionable(item) && actionOf(item) === "fix");
  const yours = report.items.filter((item) => actionable(item) && actionOf(item) !== "fix");
  if (!targets.length) note("nothing here can be fixed without you");
  const attempted = [];
  /* a fix that works inside the box takes the door when there is one, the same
     way every check above just read it. The power switch stays the printed
     command, because it is also what turns a stopped box back on — but a
     machine with no kubectl is not a machine that cannot be fixed. */
  const ctx = await buildContext();
  const throughTheDoor = doorCanRun(ctx);
  for (const item of targets) {
    note(`fixing ${item.id}: ${item.fix.label}`);
    if (item.fix.podScript && throughTheDoor) {
      const said = await overThePort(ctx, item.fix.podScript, TIMEOUTS.fix);
      if (!said.ok) note(`  failed: ${said.err.split("\n").filter(Boolean).pop() || "the server would not run it"}`);
      for (const line of said.out.split("\n").filter(Boolean).slice(-3)) note(`  ${line}`);
      attempted.push(item.id);
      continue;
    }
    const how = fixArgv(item.fix);
    if (how.error) {
      note(`  failed: ${how.error}`);
      continue;
    }
    const r = await run(how.exe, how.args, TIMEOUTS.fix);
    if (!r.ok) note(`  failed: ${r.err.split("\n").filter(Boolean).pop() || "no detail"}`);
    for (const line of r.out.split("\n").filter(Boolean).slice(-3)) note(`  ${line}`);
    attempted.push(item.id);
  }
  for (const item of yours) {
    if (actionOf(item) === "investigate") note(`${item.id} needs a look: ${item.fix.command}`);
    else note(`${item.id} needs you: ${item.fix ? item.fix.command : "no automatic fix"}`);
  }
  report = await diagnose();
  for (const id of attempted) note(`  ${fixOutcome(id, report).note}`);
}

if (wantsJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else process.stdout.write(`${formatHuman(report, { color: process.stdout.isTTY })}\n`);

process.exit(exitCode(report));
