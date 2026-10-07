import { listSeats, me, resolveSeat, seatLine, sendSay, peekSeat } from "./peer.mjs";

const USAGE = `node peer-cli.mjs say <seat> <text…>   — deliver a message to a seat, driver or terminal
node peer-cli.mjs peers [--json]      — the fleet on this side, with what each one is doing
node peer-cli.mjs peek <seat> [lines] — the last lines of a seat's conversation`;

const [command, ...rest] = process.argv.slice(2);

function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function pick(raw) {
  const self = await me();
  const seats = (await listSeats()).filter((s) => s.name !== self.name);
  const found = resolveSeat(seats, raw);
  if (found.error) die(found.error);
  return { seat: found.seat, self };
}

if (command === "say") {
  const [name, ...words] = rest;
  const body = words.join(" ");
  if (!name || !body.trim()) die("usage: say <seat> <text…>");
  const { seat, self } = await pick(name);
  const from = self.name || "";
  const sent = await sendSay(seat, body, { from });
  if (!sent.ok) die(`could not reach ${seat.name}: ${sent.error}`);
  const how = sent.how === "terminal" ? "typed into its terminal" : sent.queued ? "queued behind the turn it is running" : "delivered";
  process.stdout.write(`${seat.name}: ${how}\n`);
} else if (command === "peers") {
  const self = await me();
  const seats = (await listSeats()).filter((s) => s.name !== self.name);
  if (rest.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ me: self, seats }, null, 2)}\n`);
  } else if (!seats.length) {
    process.stdout.write("no other seats on this side\n");
  } else {
    for (const seat of seats) process.stdout.write(`${seat.alive ? "·" : "×"} ${seatLine(seat)}\n`);
  }
} else if (command === "peek") {
  const [name, lines] = rest;
  if (!name) die("usage: peek <seat> [lines]");
  const { seat } = await pick(name);
  process.stdout.write(`${await peekSeat(seat, Number(lines) || 30)}\n`);
} else {
  die(USAGE, 2);
}
