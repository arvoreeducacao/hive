import { existsSync } from "node:fs";
import { ACCOUNT_NAME, CLAUDE, DEFAULT_ACCOUNT, GUESSED_WAIT_MS, accountDir, accountOrder, accountUnder, hasRoom, noteBack, noteSpent, pickAccount, readLedger } from "./accounts.mjs";

/* the part of a seat that moves it from a login with no room left to the next one
   down the order. Every driver has the same story: the turn ends on a refusal, the
   login is written down as spent for the whole machine, the next login with room
   takes the turn over, and the seat walks home once its own login has its hour
   back. What differs per agent is only how the running child is told about the
   new login, so that comes in as a callback. */
export function accountFailover({
  base,
  provider = CLAUDE,
  bornIn = "",
  home = "",
  emit = () => {},
  persist = () => {},
  apply = () => {},
  redo = () => false,
  busy = () => false,
  guessedWait = GUESSED_WAIT_MS,
}) {
  let accountName = accountUnder(base, provider, bornIn);
  let accountDirNow = accountName ? accountDir(base, provider, accountName) : bornIn ? String(bornIn) : "";
  let homeAccount = home || accountName || DEFAULT_ACCOUNT;
  let handoffs = 0;

  function moveTo(wanted, why = "asked") {
    if (wanted && !ACCOUNT_NAME.test(wanted)) throw new Error("no account goes by that name");
    const dir = accountDir(base, provider, wanted);
    if (dir && !existsSync(dir)) throw new Error(`this machine holds no account called ${wanted}`);
    if (wanted === accountName) return accountName;
    accountName = wanted;
    accountDirNow = dir;
    apply({ name: accountName, dir, why });
    persist({ account: accountName });
    emit({ type: "driver", subtype: "account_changed", account: accountName, why });
    return accountName;
  }

  async function passTheTurnOn(spent) {
    if (accountName === null) return false;
    const mine = accountName || DEFAULT_ACCOUNT;
    const until = spent.until || (spent.why === "login" ? 0 : Date.now() + guessedWait);
    await noteSpent(base, mine, { until, why: spent.why, says: spent.says, provider }).catch(() => {});
    const order = await accountOrder(base, homeAccount, provider).catch(() => []);
    if (handoffs >= Math.max(order.length, 2) * 2) {
      emit({ type: "driver", subtype: "account_handoff_stopped", account: mine });
      return false;
    }
    const ledger = await readLedger(base, provider).catch(() => ({}));
    const next = pickAccount({ order, current: mine, ledger });
    if (!next) {
      emit({ type: "driver", subtype: "every_account_spent", account: mine, until: until || null, says: spent.says });
      return false;
    }
    handoffs += 1;
    try {
      moveTo(next === DEFAULT_ACCOUNT ? "" : next, spent.why);
    } catch (no) {
      emit({ type: "driver", subtype: "warning", message: `this seat could not move to ${next}: ${String(no?.message || no)}` });
      return false;
    }
    emit({ type: "driver", subtype: "account_took_over", from: mine, account: next, why: spent.why, until: until || null });
    redo();
    return true;
  }

  async function turnEnded(spent) {
    if (spent && await passTheTurnOn(spent)) return true;
    if (!spent) handoffs = 0;
    return false;
  }

  async function goHome() {
    if (accountName === null) return false;
    const mine = accountName || DEFAULT_ACCOUNT;
    if (mine === homeAccount || busy()) return false;
    const ledger = await readLedger(base, provider).catch(() => ({}));
    if (!hasRoom(ledger, homeAccount)) return false;
    await noteBack(base, homeAccount, provider).catch(() => {});
    try {
      moveTo(homeAccount === DEFAULT_ACCOUNT ? "" : homeAccount, "came-back");
    } catch {
      return false;
    }
    handoffs = 0;
    emit({ type: "driver", subtype: "account_came_home", account: homeAccount, from: mine });
    return true;
  }

  return {
    get name() { return accountName; },
    get dir() { return accountDirNow; },
    get home() { return homeAccount; },
    get handoffs() { return handoffs; },
    setHome(name) { if (name) homeAccount = name; },
    moveTo,
    passTheTurnOn,
    turnEnded,
    goHome,
  };
}
