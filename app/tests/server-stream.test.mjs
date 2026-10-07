import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { attachServerStream, reasonOf } from "../lib/server-stream.mjs";

const REFUSED = '{"error":"that key is not on the roster"}';

const rest = (ms = 30) => new Promise((done) => setTimeout(done, ms));

function refusingDial(kept, { status = 401, said = REFUSED } = {}) {
  return () => {
    const sock = new EventEmitter();
    sock.readyState = 0;
    kept.push(sock);
    queueMicrotask(() => {
      const answer = new EventEmitter();
      answer.statusCode = status;
      answer.destroy = () => {};
      sock.emit("unexpected-response", { destroy: () => {} }, answer);
      if (said) answer.emit("data", said);
      answer.emit("end");
    });
    return sock;
  };
}

function stumblingDial(kept) {
  return () => {
    const sock = new EventEmitter();
    sock.readyState = 0;
    kept.push(sock);
    queueMicrotask(() => {
      sock.emit("error", new Error("connect ECONNREFUSED"));
      sock.emit("close");
    });
    return sock;
  };
}

test("a door that refuses the key is quoted, not counted", async () => {
  const heard = [];
  const kept = [];
  const stream = attachServerStream({
    open: refusingDial(kept),
    warn: (why) => heard.push(why),
    turnedAwayStep: 5,
    turnedAwayCap: 5
  });
  try {
    await rest(60);
    assert.ok(kept.length > 3, `should have kept trying, tried ${kept.length}`);
    assert.deepEqual(heard, ["that key is not on the roster"]);
    assert.equal(stream.refusal, "that key is not on the roster");
  } finally {
    stream.stop();
  }
});

test("a refusal waits far longer between tries than an ordinary stumble", async () => {
  const refusedKept = [];
  const refused = attachServerStream({
    open: refusingDial(refusedKept),
    warn: () => {},
    turnedAwayStep: 4000,
    turnedAwayCap: 4000
  });
  const stumbledKept = [];
  const stumbled = attachServerStream({
    open: stumblingDial(stumbledKept),
    warn: () => {},
    retryStep: 1,
    retryCap: 1
  });
  try {
    await rest(60);
    assert.equal(refusedKept.length, 1, "a refused key should not be hammering the door");
    assert.ok(stumbledKept.length > 3, `a closed door should be retried quickly, tried ${stumbledKept.length}`);
  } finally {
    refused.stop();
    stumbled.stop();
  }
});

test("an ordinary stumble still complains on the fourth try, not on every one", async () => {
  const heard = [];
  const kept = [];
  const stream = attachServerStream({
    open: stumblingDial(kept),
    warn: (why) => heard.push(why),
    retryStep: 1,
    retryCap: 1,
    complainAfter: 4
  });
  try {
    await rest(60);
    assert.ok(kept.length >= 8, `should have tried plenty, tried ${kept.length}`);
    assert.ok(heard.length < kept.length / 2, `complained ${heard.length} times in ${kept.length} tries`);
    assert.match(heard[0], /ECONNREFUSED|the server stream closed/);
  } finally {
    stream.stop();
  }
});

test("the same socket failing twice is one try, not two", async () => {
  const heard = [];
  const kept = [];
  const stream = attachServerStream({
    open: () => {
      const sock = new EventEmitter();
      sock.readyState = 0;
      kept.push(sock);
      return sock;
    },
    warn: (why) => heard.push(why),
    retryStep: 4000,
    retryCap: 4000,
    complainAfter: 1
  });
  try {
    const first = kept[0];
    first.emit("error", new Error("boom"));
    first.emit("close");
    await rest(20);
    assert.deepEqual(heard, ["server stream: boom"]);
    assert.equal(kept.length, 1, "one failed socket should schedule one retry");
  } finally {
    stream.stop();
  }
});

test("a refusal with no readable body still names the status", async () => {
  const heard = [];
  const kept = [];
  const stream = attachServerStream({
    open: refusingDial(kept, { status: 403, said: "<html>nope</html>" }),
    warn: (why) => heard.push(why),
    turnedAwayStep: 4000,
    turnedAwayCap: 4000
  });
  try {
    await rest(40);
    assert.deepEqual(heard, ["the door answered 403 and said nothing else"]);
  } finally {
    stream.stop();
  }
});

test("a status that is not a refusal keeps the quick retry", async () => {
  const kept = [];
  const stream = attachServerStream({
    open: refusingDial(kept, { status: 502, said: "" }),
    warn: () => {},
    retryStep: 1,
    retryCap: 1,
    turnedAwayStep: 4000,
    turnedAwayCap: 4000
  });
  try {
    await rest(60);
    assert.ok(kept.length > 3, `502 is the door restarting, should retry fast, tried ${kept.length}`);
  } finally {
    stream.stop();
  }
});

test("reasonOf prefers the sentence the server wrote", () => {
  assert.equal(reasonOf(REFUSED, 401), "that key is not on the roster");
  assert.equal(reasonOf("that request is 94s off the clock", 401), "that request is 94s off the clock");
  assert.equal(reasonOf("<html>502</html>", 502), "the door answered 502 and said nothing else");
  assert.equal(reasonOf("", 401), "the door answered 401 and said nothing else");
  assert.equal(reasonOf("{not json", 401), "{not json");
  assert.equal(reasonOf("x".repeat(500), 401).length, 200);
});
