import { ASK_WAIT_MAX_SECONDS, listSeats, me, spendBirths, seatRoster, resolveSeat, sendSay, peekSeat, socketCommand, awaitReply, askPerson, buzzPhone, noteTask, publishPage, answerOnPage, browserNavigate, browserShoot, browserEval, browserConsole, browserResize, browserProfile, browserCookies, browserSetCookie, browserMap, browserClick, browserType, browserKey, browserWait, browserChoose, browserTabs, browserStep, browserUpload, browserNetwork, deviceCall, DEVICE_OPEN_WAIT, openSeat, renameSeat, sayOnSlack } from "./peer.mjs";
import { BIRTHS_MAX } from "../engine/protocol.mjs";

export const PEER_TOOLS = [
  {
    name: "peers",
    description: "The other chats in the hive right now: name, where each runs, what it is working on. Call this before messaging a seat you are not sure exists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "message",
    description: "Send a message to another seat. It lands in that chat as a turn, from you, and the person sees it. Use it to tell a peer something it needs; use ask when you need the answer before you can continue.",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "the seat's name, whole or an unambiguous prefix" },
        text: { type: "string", description: "what to say to it, in full sentences — it has none of your context" },
      },
      required: ["seat", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "ask",
    description: "Ask another seat something and wait for its answer. Blocks until it replies or the timeout runs out; the answer comes back here instead of interrupting your conversation.",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "the seat's name, whole or an unambiguous prefix" },
        question: { type: "string", description: "one self-contained question — it cannot see your screen" },
        timeout_seconds: { type: "number", description: `how long to wait, default 180, max ${ASK_WAIT_MAX_SECONDS}` },
      },
      required: ["seat", "question"],
      additionalProperties: false,
    },
  },
  {
    name: "peek",
    description: "Read the last lines of another seat's conversation without writing to it. Use it to find out whether a peer is stuck before you message it.",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "the seat's name, whole or an unambiguous prefix" },
        lines: { type: "number", description: "how many lines back, default 30" },
      },
      required: ["seat"],
      additionalProperties: false,
    },
  },
  {
    name: "publish",
    description: "Put an HTML page you wrote on the team's shelf — the hive's own gallery, kept in a private repo everyone here clones. This is how a page reaches the team; nothing else publishes. Every label goes up, draft included, so the whole team can read the page from v1 on and the repo keeps whatever you send it. Write the file first, then call this.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "absolute path of the .html file you wrote" },
        label: { type: "string", description: "where the page is in its life: draft, in-review, decided, delivered, closed — a suffix is fine, as in in-review-after-the-team-read-it. The old portuguese labels still work and are rewritten to these." },
        tab: { type: "string", description: "documento, telas, plano or lente — lente is the interactive map of a PR. Leave it out and the filename decides: canvas, telas, mockup or screens land on telas, lente lands on lente, everything else on documento" },
      },
      required: ["path", "label"],
      additionalProperties: false,
    },
  },
  {
    name: "reply_on_page",
    description: "Answer, inside the page itself, a question someone asked on a piece of a screen. The answer lands in that same conversation, pinned to that same element, and whoever opens the page later reads it there — it does not live only in this chat. Use it whenever a line arrives here saying someone asked on a page: answer there first, and only then talk here.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "the page on the shelf, as the line that reached you names it" },
        thread: { type: "string", description: "the conversation to answer, as the line that reached you names it" },
        text: { type: "string", description: "the answer, in the words the person would use" },
      },
      required: ["slug", "thread", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_navigate",
    description: "Open a URL in this seat's browser inside the hive — localhost, staging, or a page to inspect. The page loads whether or not the person has the browser pane open: it lands in your own tab, which is yours to drive and never steals the tab the person is reading, the card names it, and opening the pane shows what you are doing live. Sending the seat somewhere again drives that same tab, so checking a page you keep rewriting leaves one tab, not a pile — browser_tabs open is how you get a second page beside it. An address on the shelf lands on the page itself, with its documento/telas/plano rail. The page stays loaded when the pane is closed, when the person opens another chat, and while other seats browse their own pages. Dev pages use the seat's dev profile; the browser never carries the person's personal login.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "the address — localhost:3000, a full URL, or a page to look at" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the page this seat has open and see it. The pane does not have to be open — navigate first and shoot. Use it to check a screen you navigated to, or to show the person what a change looks like.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_profile",
    description: "Log the seat's browser in as a test user by name — teacher, principal, teacher2 or student. It sets the dev session cookie on the page's origin from the team's .env; the token never passes through this chat. Navigate to the page first. Reloads the tab so the login takes.",
    inputSchema: { type: "object", properties: { profile: { type: "string", description: "teacher, principal, teacher2 or student" } }, required: ["profile"], additionalProperties: false },
  },
  {
    name: "browser_set_cookie",
    description: "Write one cookie on the page this seat has open. ALWAYS confirm with the person first — ask them with a question whether to set it, and only call this after they say yes. Use it for a flag or a state you cannot reach through a profile; for logging in as a test user, use browser_profile instead. Navigate to the page first.",
    inputSchema: { type: "object", properties: { name: { type: "string", description: "cookie name — letters, numbers, _ or -" }, value: { type: "string", description: "the value to write" } }, required: ["name", "value"], additionalProperties: false },
  },
  {
    name: "browser_cookies",
    description: "List the cookies on the page this seat has open — name, whether it is HttpOnly, and a masked hint of the value (never the full secret).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_resize",
    description: "Emulate a viewport size on the page this seat has open — to check a screen at phone, tablet or desktop width without touching the window. Pass mobile:true for touch and a mobile layout; reset:true goes back to the real window size.",
    inputSchema: { type: "object", properties: { width: { type: "number", description: "CSS pixels wide, 200–3840 (e.g. 390 phone, 834 tablet, 1440 desktop)" }, height: { type: "number", description: "CSS pixels tall, 200–3840" }, mobile: { type: "boolean", description: "mobile layout + touch emulation" }, reset: { type: "boolean", description: "true drops the emulation and goes back to the window size" } }, additionalProperties: false },
  },
  {
    name: "browser_eval",
    description: "Run JavaScript on the page this seat has open and get the result back. Use it to read the page — a value, the DOM, what an element shows — or to replay an API call the page just made (same cookies). The last expression is what comes back, JSON-encoded.",
    inputSchema: { type: "object", properties: { code: { type: "string", description: "the expression to run in the page, e.g. document.title or JSON of the DOM you need" } }, required: ["code"], additionalProperties: false },
  },
  {
    name: "browser_snapshot",
    description: "Read the page this seat has open as a list of elements — role, name, value, state — each with a ref like e12. This is how you see a screen well enough to fill it in: take the snapshot, find the field or button by name, then browser_click or browser_type with its ref. Cheaper and surer than reading the DOM through browser_eval, and it is what a screenshot cannot give you. Refs go stale when the page changes — snapshot again after anything that redraws it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_click",
    description: "Click one element on the page this seat has open, by the ref browser_snapshot gave it. It is a real mouse click at the element's place on the screen, not a JavaScript call, so the page reacts the way it would for a person. Think before clicking something that ships, deletes, merges or pays — a click is not a look.",
    inputSchema: { type: "object", properties: { ref: { type: "string", description: "the ref from browser_snapshot, like e12" } }, required: ["ref"], additionalProperties: false },
  },
  {
    name: "browser_type",
    description: "Type into a field on the page this seat has open, by the ref browser_snapshot gave it. It focuses the field, replaces what is there and types as a person would. Pass submit:true to press Enter at the end.",
    inputSchema: { type: "object", properties: { ref: { type: "string", description: "the ref from browser_snapshot, like e12" }, text: { type: "string", description: "what to type — it replaces what the field already has" }, submit: { type: "boolean", description: "press Enter after typing" } }, required: ["ref", "text"], additionalProperties: false },
  },
  {
    name: "browser_select_option",
    description: "Choose an option in a dropdown on the page this seat has open, by the ref browser_snapshot gave the dropdown. Say the option the way the page shows it; if it is not there, the error lists the ones that are.",
    inputSchema: { type: "object", properties: { ref: { type: "string", description: "the ref of the dropdown, like e12" }, option: { type: "string", description: "the option to choose, as it reads on screen" } }, required: ["ref", "option"], additionalProperties: false },
  },
  {
    name: "browser_press_key",
    description: "Press one key on the page this seat has open — Enter, Tab, Escape, Backspace, Delete, the arrows, PageUp, PageDown, Home, End. For closing a dialog, moving between fields, or sending a form the button does not submit.",
    inputSchema: { type: "object", properties: { key: { type: "string", description: "Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, End" } }, required: ["key"], additionalProperties: false },
  },
  {
    name: "browser_wait_for",
    description: "Wait until some text shows up on the page this seat has open — or until it goes away, with gone:true. Use it after a click that saves or navigates, instead of guessing how long the page takes.",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "the text to wait for, as the page shows it" }, gone: { type: "boolean", description: "true waits for the text to disappear instead" }, seconds: { type: "number", description: "how long to wait, 1–60 (default 10)" } }, required: ["text"], additionalProperties: false },
  },
  {
    name: "browser_tabs",
    description: "The pages this seat has open, and the seat's own way of opening more. list says what is open, which tab is yours and which one the person is looking at; open starts another page without losing the one you are on; select moves your tools to another tab, without moving what the person sees; close ends one. Opening a tab is yours to do — you do not have to ask the person for a window. The person can browse other tabs while you work, and can close yours: when that happens the next tool says so instead of failing for the wrong reason.",
    inputSchema: { type: "object", properties: { act: { type: "string", description: "list, open, select or close" }, url: { type: "string", description: "for open: the address to land on — leave it out for an empty tab" }, index: { type: "number", description: "for select and close: the number the list gave the tab" } }, additionalProperties: false },
  },
  {
    name: "browser_back",
    description: "Go back one page in the tab this seat is acting on, and say where it landed.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_forward",
    description: "Go forward one page in the tab this seat is acting on, after a browser_back.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_reload",
    description: "Reload the page this seat is acting on — after a deploy, a data change, or a login that the page has not noticed yet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "browser_upload",
    description: "Hand a file on this machine to a file field on the page, by the ref browser_snapshot gave the field (or a ref that contains one). Give full paths. A file that looks like a secret — keys, .env, credentials, anything under .ssh or .aws — is refused, and so is anything over 25MB.",
    inputSchema: { type: "object", properties: { ref: { type: "string", description: "the ref of the file field, like e12" }, files: { type: "array", items: { type: "string" }, description: "full paths, up to five" } }, required: ["ref", "files"], additionalProperties: false },
  },
  {
    name: "browser_network",
    description: "The calls the page this seat has open has made — method, status, kind, time and size, newest last. Use it when a screen shows nothing and you need to know whether the request failed, came back 403, or was never made. Pass failed_only:true to see only what broke, or about to filter by a piece of the url.",
    inputSchema: { type: "object", properties: { about: { type: "string", description: "only calls whose url contains this" }, failed_only: { type: "boolean", description: "only the calls that failed or came back 400 and up" } }, additionalProperties: false },
  },
  {
    name: "browser_console",
    description: "Read the console messages the page this seat has open has logged — errors, warnings, logs — with their source and line. Use it to see what broke on a screen you are working on.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "device_open",
    description: "Boot a phone on this machine and put its screen in this seat's device pane — the person sees it in the tile and can tap it too. platform android boots an emulator, platform ios boots an iPhone simulator (mac with Xcode only). Only works where the hive app is open (never from the pod). Pass app to open one right away: an android package name or an iOS bundle id, or a nickname this hive was configured with. A phone that is already up is reused in a second; a cold boot takes about 30s. Nothing to boot? The error tells you the one-line recipe.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", description: "android (default) or ios — ios needs a mac with Xcode" },
        avd: { type: "string", description: "which phone to boot — on android the AVD name (leave it out for hive-pixel); on ios a simulator name like \"iPhone 16\" or its udid (leave it out for one already booted, else the first iPhone)" },
        app: { type: "string", description: "app to open after boot: an android package name, an iOS bundle id, or a nickname this hive was configured with" },
        window: { type: "boolean", description: "android only: true boots with the emulator's own window as well — normally it runs headless and the pane is the window" }
      },
      additionalProperties: false
    },
  },
  {
    name: "device_screenshot",
    description: "See what the device on this seat is showing right now — a PNG of the whole screen in device pixels, the same coordinates device_tap takes. Needs device_open first. Use it after every action to read what happened.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "device_tap",
    description: "Tap the device screen at a point, in device pixels — read the point from device_screenshot or the bounds in device_tree. Needs device_open first.",
    inputSchema: { type: "object", properties: { x: { type: "number", description: "pixels from the left edge" }, y: { type: "number", description: "pixels from the top" } }, required: ["x", "y"], additionalProperties: false },
  },
  {
    name: "device_swipe",
    description: "Swipe from one point to another on the device screen, in device pixels — to scroll a list, dismiss a sheet, or drag. Needs device_open first.",
    inputSchema: { type: "object", properties: { x1: { type: "number" }, y1: { type: "number" }, x2: { type: "number" }, y2: { type: "number" }, ms: { type: "number", description: "how long the finger takes, 50–5000, default 300" } }, required: ["x1", "y1", "x2", "y2"], additionalProperties: false },
  },
  {
    name: "device_type",
    description: "Type text into whatever field has the focus on the device — tap the field first. ASCII only, up to 500 characters; use device_key for ENTER, TAB and the like. Needs device_open first.",
    inputSchema: { type: "object", properties: { text: { type: "string", description: "what to type" } }, required: ["text"], additionalProperties: false },
  },
  {
    name: "device_key",
    description: "Press one key on the device. On android: HOME, BACK, ENTER, TAB, DEL, MENU, RECENTS, any KEYCODE_* name, or a keycode number. On ios: HOME, LOCK, SIRI, VOLUME_UP, VOLUME_DOWN, ENTER, TAB, DEL, ESC, SPACE, or a HID usage number — there is no BACK. Needs device_open first.",
    inputSchema: { type: "object", properties: { key: { type: "string", description: "HOME, ENTER, TAB, DEL, BACK on android, LOCK on ios, a KEYCODE_* name or a number" } }, required: ["key"], additionalProperties: false },
  },
  {
    name: "device_tree",
    description: "Read the accessibility tree of the device screen — every node with a text, a description or an id, with its bounds and whether it is clickable. Android only: iOS has no equivalent, so there you read device_screenshot and tap by pixel. Native screens only: a WebView shows up as one node, so on the Árvore app read the screenshot instead. Needs device_open first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "device_logs",
    description: "Read the last lines of the device log — logcat on android, filtered to the app device_open launched when there is one; the simulator's own log on ios, the last few minutes of it unfiltered. Needs device_open first.",
    inputSchema: { type: "object", properties: { lines: { type: "number", description: "how many lines back, default 200, max 2000" } }, additionalProperties: false },
  },
  {
    name: "device_close",
    description: "Shut the phone this seat opened and empty the device pane. Do it when you are done with it — it holds a few GB of memory while it runs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "spawn",
    description: "Open another chat in the hive and hand it a mission. Use it to split work you cannot do in one place — a second front, a long investigation, a repo you are not in. The new seat starts cold: it has none of your context, so write the mission as you would to a person joining today. You can open 3 chats per round, and the budget comes back with the person's next message, and a chat opened by another chat can open its own the same way. Each one costs a worktree and a model, so open what the work needs and no more.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "what this seat has to get done, in full sentences, standing on its own — what the problem is, where to look, what done means" },
        name: { type: "string", description: "the seat's name, lowercase with dashes — name it yourself: you wrote the mission. Leaving it out makes the hive stop and ask a model for a name, which costs seconds and reads worse. Name the subject, not the verb: crm-audio-mudo, not investigar-audio" },
        title: { type: "string", description: "one short line for the tile next to the terminal, in the person's language — what this seat is about, as they would say it out loud" },
        errand: { type: "string", description: "the person's request that this seat came from, in their words, short — the SAME line on every seat you open for it. It is what turns fifteen seats into four things the person asked for, and it is how they find their way back" },
        where: { type: "string", description: "local (this machine) or cloud (the pod) — defaults to where you are" },
        repo: { type: "string", description: "optional repo the seat should start in" },
        model: { type: "string", description: "which model it runs on — the id the person's agent knows, like opus or sonnet. Leave it out for the one that seat would pick by itself" },
        agent: { type: "string", description: "which chat program runs it — claude, codex, kimi, kiro or opencode. Leave it out to open it on the same one you are on. Only what the person has a login for opens; anything else comes back refused" },
        account: { type: "string", description: "which login of that program to use, when the person has more than one. Only for a seat on this machine: on the server the account is the server's" },
        count: { type: "integer", minimum: 1, maximum: 3, description: "open the SAME mission in 2 to 3 chats at once — a race: each works in its own worktree, the person compares the results and keeps one. Only when the person asked for a race, or when the task is small and the approaches genuinely differ; each extra chat costs a model. Default 1" },
      },
      required: ["mission"],
      additionalProperties: false,
    },
  },
  {
    name: "rename",
    description: "Name this chat — the line the person reads on the rail and in the seat list, instead of the slug it was born with. Call it once you know what you are actually working on, and again whenever the subject turns: a seat opened to look at a slow query and now rewriting the importer should say so. Name the subject, not the verb — \"o áudio mudo no CRM\", not \"investigando o áudio\". This does not touch the errand the seat came from: that line is the person's own words, shared by every seat opened for the same request, and it is what turns fifteen seats back into four things they asked for.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "one short line in the person's language, as they would say it out loud — what this chat is about" },
        now: { type: "string", description: "optional: what you are on right now, one line — it shows next to the name while the chat is open" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "task",
    description: "Write a task into the person's own task list in the hive — the button with the count at the top of the app. Only when the person asks you to note, remember or keep something for later; never on your own to record what is left at the end of a turn. The task starts private to them, with this chat marked as where it came from.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "the task in one line, in the person's language, as they would write it on their own list" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "buzz",
    description: "Buzz the person's phone, right now, through their own Hive app. It pulls them away from whatever they are doing — a meeting, dinner, another chat — so it is only for what they would want to be pulled away for: something that broke where people can see it, or a decision that has the work stopped and cannot wait for them to come back. Never for finishing, never for progress, never to say a question is waiting — a seat that stops with a question already buzzes them on its own. One line, in their language, saying what happened, not that something happened. Nothing arrives if their phone is not paired, and the same seat cannot buzz twice inside five minutes.",
    inputSchema: {
      type: "object",
      properties: {
        line: { type: "string", description: "one line they can act on from the lock screen, in their language — what broke or what has to be decided, not \"take a look\"" },
      },
      required: ["line"],
      additionalProperties: false,
    },
  },
  {
    name: "reply_on_slack",
    description: "Answer in the Slack thread this chat was opened from. A chat born on Slack is the only place this works, and it is the only way back: nothing you write in the conversation reaches the person there, so finishing without calling this leaves them in silence. Call it when the work is done, when you need something only they can answer, and before any wait long enough for them to wonder. Write what you would say to them, in their language — they cannot see this chat, the files or the terminal.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "the message, in their language — plain sentences, markdown links and code fences are fine" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_person",
    description: "Ask someone else on the team a question, through their own chats. They see the question on their screen, approve it, and choose which of their chats answers — nothing reaches them without that. Use it when the answer lives with another person and you cannot find it yourself. The answer arrives here as a message from them.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "their name in the hive, lowercase — the one the people menu shows" },
        question: { type: "string", description: "one self-contained question — they have none of your context, and a person will read it before any agent does" },
      },
      required: ["person", "question"],
      additionalProperties: false,
    },
  },
];

function leafLine(leaf) {
  if (!leaf) return "";
  if (leaf.error) return `the leaf did not take this page: ${leaf.error}`;
  const missing = leaf.missing || [];
  const said = `${leaf.url} — the same page in the leaf, where anyone invited can read and edit it`;
  if (!missing.length) return said;
  return `${said}\n${missing.length} of ${leaf.kept} drawings did not make it: ${missing.map((one) => one.why).join(" · ")}`;
}

function text(body) {
  return { content: [{ type: "text", text: String(body) }] };
}

function failure(body) {
  return { content: [{ type: "text", text: String(body) }], isError: true };
}

function image(dataUrl, caption) {
  const at = String(dataUrl || "").indexOf(",");
  const data = at >= 0 ? dataUrl.slice(at + 1) : dataUrl;
  const mime = (String(dataUrl).match(/^data:([^;]+)/) || [])[1] || "image/png";
  return { content: [{ type: "text", text: caption }, { type: "image", data, mimeType: mime }] };
}

async function target(raw, self, env) {
  const seats = (await listSeats(env)).filter((s) => s.name !== self.name);
  const found = resolveSeat(seats, raw);
  if (found.error) {
    const alive = seats.filter((s) => s.alive).map((s) => s.name);
    return { error: `${found.error}. Live seats: ${alive.length ? alive.join(", ") : "none besides you"}` };
  }
  return { seat: found.seat };
}

function nameless(self) {
  if (!self.name) {
    return "this seat has no name in the hive yet, so a peer would have nobody to answer. Close and reopen it, then try again.";
  }
  return "";
}

export function peerCalls(env = process.env) {
  const calls = {
    async browser_navigate(args) {
      const done = await browserNavigate({ url: args.url, env });
      if (done.error) return failure(done.error);
      return text(`opening ${done.url} in the browser pane — the person sees it on the card; open the pane to watch it live`);
    },
    async browser_screenshot() {
      const done = await browserShoot({ env });
      if (done.error) return failure(done.error);
      return image(done.image, "the browser pane right now");
    },
    async browser_profile(args) {
      const done = await browserProfile({ profile: args.profile, env });
      if (done.error) return failure(done.error);
      return text(`the pane is now signed in as ${done.profile} — the tab reloaded to take it`);
    },
    async browser_set_cookie(args) {
      const done = await browserSetCookie({ cookieName: args.name, value: args.value, env });
      if (done.error) return failure(done.error);
      return text(done.value || `wrote ${args.name}`);
    },
    async browser_cookies() {
      const done = await browserCookies({ env });
      if (done.error) return failure(done.error);
      const cookies = done.cookies || [];
      if (!cookies.length) return text("no cookies on this page");
      return text(cookies.map((c) => `${c.name} = ${c.hint}${c.httpOnly ? " (HttpOnly)" : ""}`).join("\n"));
    },
    async browser_resize(args) {
      const done = await browserResize({ width: args.width, height: args.height, mobile: args.mobile === true, reset: args.reset === true, env });
      if (done.error) return failure(done.error);
      return text(done.value ? `viewport ${done.value}` : "viewport changed");
    },
    async browser_eval(args) {
      const done = await browserEval({ code: args.code, env });
      if (done.error) return failure(done.error);
      return text(done.value === undefined ? "ran, no value" : String(done.value));
    },
    async browser_snapshot() {
      const done = await browserMap({ env });
      if (done.error) return failure(done.error);
      return text(done.value || "the page is empty");
    },
    async browser_click(args) {
      const done = await browserClick({ ref: args.ref, env });
      if (done.error) return failure(done.error);
      return text(done.value || `clicked ${args.ref}`);
    },
    async browser_type(args) {
      const done = await browserType({ ref: args.ref, text: args.text, submit: args.submit === true, env });
      if (done.error) return failure(done.error);
      return text(done.value || `typed into ${args.ref}`);
    },
    async browser_select_option(args) {
      const done = await browserChoose({ ref: args.ref, option: args.option, env });
      if (done.error) return failure(done.error);
      return text(done.value || `chose ${args.option}`);
    },
    async browser_press_key(args) {
      const done = await browserKey({ key: args.key, env });
      if (done.error) return failure(done.error);
      return text(done.value || `pressed ${args.key}`);
    },
    async browser_wait_for(args) {
      const done = await browserWait({ text: args.text, gone: args.gone === true, seconds: args.seconds, env });
      if (done.error) return failure(done.error);
      return text(done.value || "it is there");
    },
    async browser_tabs(args) {
      const done = await browserTabs({ act: args.act || "list", url: args.url || "", index: args.index || 0, env });
      if (done.error) return failure(done.error);
      return text(done.value || "done");
    },
    async browser_back() {
      const done = await browserStep({ way: "back", env });
      if (done.error) return failure(done.error);
      return text(done.value || "went back");
    },
    async browser_forward() {
      const done = await browserStep({ way: "forward", env });
      if (done.error) return failure(done.error);
      return text(done.value || "went forward");
    },
    async browser_reload() {
      const done = await browserStep({ way: "reload", env });
      if (done.error) return failure(done.error);
      return text(done.value || "reloaded");
    },
    async browser_upload(args) {
      const done = await browserUpload({ ref: args.ref, files: Array.isArray(args.files) ? args.files : [args.files], env });
      if (done.error) return failure(done.error);
      return text(done.value || "the file is with the page");
    },
    async browser_network(args) {
      const done = await browserNetwork({ about: args.about || "", failedOnly: args.failed_only === true, env });
      if (done.error) return failure(done.error);
      return text(done.value || "this page has not called anything yet");
    },
    async browser_console() {
      const done = await browserConsole({ env });
      if (done.error) return failure(done.error);
      const lines = done.lines || [];
      if (!lines.length) return text("the console is empty");
      return text(lines.map((l) => `[${l.level}] ${l.text}${l.source ? ` (${l.source}:${l.line})` : ""}`).join("\n"));
    },
    async device_open(args) {
      const done = await deviceCall({ path: "open", payload: { platform: args.platform || "android", avd: args.avd || "", app: args.app || "", window: args.window === true }, timeout: DEVICE_OPEN_WAIT, env });
      if (done.error) return failure(done.error);
      const said = done.said || {};
      const how = said.fresh ? `booted in ${Math.round((said.bootMs || 0) / 1000)}s` : "was already up";
      const app = said.app ? ` · ${said.app} opened` : "";
      return text(`${said.avd} (${said.serial}) ${how} · ${said.width}\u00d7${said.height}${app} — the person sees it in the device pane; take device_screenshot to see it yourself`);
    },
    async device_screenshot() {
      const done = await deviceCall({ path: "shot", env });
      if (done.error) return failure(done.error);
      const said = done.said || {};
      return image(said.image, `the device screen right now · ${said.width}\u00d7${said.height}`);
    },
    async device_tap(args) {
      const done = await deviceCall({ path: "tap", payload: { x: args.x, y: args.y }, env });
      if (done.error) return failure(done.error);
      return text(`tapped ${done.said?.x}, ${done.said?.y}`);
    },
    async device_swipe(args) {
      const done = await deviceCall({ path: "swipe", payload: { x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2, ms: args.ms }, env });
      if (done.error) return failure(done.error);
      return text(`swiped ${args.x1},${args.y1} \u2192 ${args.x2},${args.y2} in ${done.said?.ms}ms`);
    },
    async device_type(args) {
      const done = await deviceCall({ path: "type", payload: { text: args.text }, env });
      if (done.error) return failure(done.error);
      return text(`typed ${done.said?.typed} characters`);
    },
    async device_key(args) {
      const done = await deviceCall({ path: "key", payload: { key: args.key }, env });
      if (done.error) return failure(done.error);
      return text(`pressed ${done.said?.key}`);
    },
    async device_tree() {
      const done = await deviceCall({ path: "tree", env });
      if (done.error) return failure(done.error);
      const nodes = done.said?.nodes || [];
      if (!nodes.length) return text("no labelled node on screen — read the screenshot instead");
      const lines = nodes.map((n) => {
        const what = [n.text ? `"${n.text}"` : "", n.desc ? `(${n.desc})` : "", n.id ? `#${n.id.split("/").pop()}` : ""].filter(Boolean).join(" ");
        const where = n.bounds ? `[${n.bounds.join(",")}]` : "";
        return `${n.clickable ? "\u25cf" : "\u00b7"} ${what} ${n.cls.split(".").pop()} ${where}`.trim();
      });
      return text(`${nodes.length} nodes\n${lines.join("\n")}`);
    },
    async device_logs(args) {
      const done = await deviceCall({ path: "logs", payload: { lines: args.lines }, env });
      if (done.error) return failure(done.error);
      const lines = done.said?.lines || [];
      if (!lines.length) return text("the device log is empty");
      return text(lines.join("\n"));
    },
    async device_close() {
      const done = await deviceCall({ path: "close", env });
      if (done.error) return failure(done.error);
      return text(`${done.said?.avd} (${done.said?.serial}) is shutting down — the device pane is empty now`);
    },
    async publish(args) {
      const done = await publishPage({ path: args.path, label: args.label, tab: args.tab || "", env });
      if (done.error) return failure(done.error);
      const sent = done.pushed ? "pushed to the team's repo" : "written to your clone, but the push did not land — say so instead of announcing it";
      const lines = [
        `on the shelf as "${done.title}" · ${done.tab} v${done.version} · ${done.label} · ${sent}`,
        done.url ? `${done.url} — this is the link to announce: it opens the page inside the hive, for anyone on the team` : "",
        done.source ? `${done.source} — the file in the repo, source only; post it to no one` : "",
        leafLine(done.leaf)
      ].filter(Boolean);
      return text(lines.join("\n"));
    },

    async reply_on_page(args) {
      const done = await answerOnPage({ slug: args.slug, thread: args.thread, text: args.text, env });
      if (done.error) return failure(done.error);
      const sent = done.pushed ? "the team has it" : "kept on this machine — the push to the team's repo did not land";
      return text(`answered inside the page, in the conversation pinned to that element · ${sent}`);
    },

    async spawn(args) {
      const asked = Math.min(BIRTHS_MAX, Math.max(1, Math.floor(Number(args.count) || 1)));
      const born = await openSeat({
        mission: args.mission, name: args.name || "", title: args.title || "", errand: args.errand || "",
        where: args.where || "", repo: args.repo || "", model: args.model || "", agent: args.agent || "", account: args.account || "",
        count: args.count || 1, pay: (self) => spendBirths(self, asked), env
      });
      if (born.error) return failure(born.error);
      if (born.race) return text(`opening a race of ${born.race} chats on ${born.where}: ${born.names.map((one) => `"${one}"`).join(", ")}. Each got the same mission and its place in the race, and each works in a worktree of its own. When they are done, the person compares the PRs in the day view and keeps one — the rest go to the archive.`);
      const called = born.name ? `"${born.name}"` : "a name it is still picking";
      return text(`opening a seat with ${called} on ${born.where}. It boots in a few seconds — call peers to see it, then message or ask it like any other chat.\n\nIt starts with nothing but the mission you wrote. If it comes back confused, that is the mission, not the seat.`);
    },

    async task(args) {
      const done = await noteTask({ text: args.text, env });
      if (done.error) return failure(done.error);
      return text(`in the person's task list: "${done.task?.text || args.text}" — only they see it until they share it.`);
    },

    async rename(args) {
      const done = await renameSeat({ title: args.title, now: args.now || "", env });
      if (done.error) return failure(done.error);
      const doing = done.now ? ` · "${done.now}"` : "";
      const half = done.partial ? ` The rail has it; the seat list does not: ${done.partial}` : "";
      return text(`this chat now reads "${done.title}"${doing} wherever the person looks for it.${half}`);
    },

    async peers() {
      const self = await me(env);
      const seats = (await listSeats(env)).filter((s) => s.name !== self.name);
      if (!seats.length) return text("no other seats right now — you are the only chat open.");
      const head = self.name ? `you are ${self.name} (${self.side})` : `you have no seat name yet`;
      return text([head, "", ...seatRoster(seats)].join("\n"));
    },

    async message(args) {
      const self = await me(env);
      const blocked = nameless(self);
      if (blocked) return failure(blocked);
      const found = await target(args.seat, self, env);
      if (found.error) return failure(found.error);
      const sent = await sendSay(found.seat, args.text, { from: self.name, env });
      if (!sent.ok) return failure(`could not reach ${found.seat.name}: ${sent.error}`);
      const how = sent.how === "terminal" ? " (typed into its terminal)" : sent.queued ? " (queued behind the turn it is running)" : "";
      return text(`delivered to ${found.seat.name}${how}. It answers you by name; the answer arrives here as a message from it.`);
    },

    async ask(args) {
      const self = await me(env);
      const blocked = nameless(self);
      if (blocked) return failure(blocked);
      const found = await target(args.seat, self, env);
      if (found.error) return failure(found.error);
      if (!self.structured) {
        const sent = await sendSay(found.seat, args.question, { from: self.name, env });
        if (!sent.ok) return failure(`could not reach ${found.seat.name}: ${sent.error}`);
        return text(`asked ${found.seat.name}, but this seat cannot wait for an answer — it arrives as a message in your conversation.`);
      }

      const wait = Math.min(ASK_WAIT_MAX_SECONDS, Math.max(15, Number(args.timeout_seconds) || 180));
      await socketCommand(self.base, self.name, { type: "expect", from: found.seat.name, wait_ms: (wait + 30) * 1000 });
      const sent = await sendSay(found.seat, args.question, { from: self.name, env });
      if (!sent.ok) {
        await socketCommand(self.base, self.name, { type: "unexpect", from: found.seat.name });
        return failure(`could not reach ${found.seat.name}: ${sent.error}`);
      }
      const reply = await awaitReply(found.seat.name, { base: self.base, name: self.name, timeout: wait * 1000 });
      if (!reply.ok) {
        await socketCommand(self.base, self.name, { type: "unexpect", from: found.seat.name });
        return text(`${found.seat.name} has not answered in ${wait}s. It still has the question; the answer will arrive as a message in your conversation. Carry on with your best assumption and say which one you took.`);
      }
      return text(`${found.seat.name} answered:\n\n${reply.text}`);
    },

    async peek(args) {
      const self = await me(env);
      const found = await target(args.seat, self, env);
      if (found.error) return failure(found.error);
      const lines = Math.min(200, Math.max(5, Number(args.lines) || 30));
      const screen = await peekSeat(found.seat, lines, env);
      return text(screen.trim() ? `${found.seat.name} · last ${lines} lines\n\n${screen}` : `${found.seat.name} has nothing on screen yet.`);
    },

    async buzz(args) {
      const sent = await buzzPhone(args.line, { env });
      if (sent.error) return failure(sent.error);
      return text("the phone was buzzed. It reaches them only if a phone is paired, and the same seat cannot buzz again for five minutes — so carry on, and do not buzz twice about the same thing.");
    },

    async reply_on_slack(args) {
      const sent = await sayOnSlack(args.text, { env });
      if (sent.error) return failure(sent.error);
      return text("it is on the slack thread. They answer there, and what they say arrives here as a message.");
    },

    async ask_person(args) {
      const self = await me(env);
      const blocked = nameless(self);
      if (blocked) return failure(blocked);
      const sent = await askPerson(args.person, args.question, { env });
      if (sent.error) return failure(sent.error);
      return text(`the question is on its way to ${sent.to}. They see it on their screen and choose which of their chats answers it; nothing lands without that. The answer arrives here as a message from them — carry on meanwhile, and say which assumption you took if you cannot wait.`);
    },
  };
  return calls;
}
