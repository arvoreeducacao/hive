import { For, Show, createEffect, createRoot } from "solid-js";
import { insert } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import { mountView } from "./view.jsx";
import { Raw } from "./raw.jsx";

function Blocks(props) {
  return (
    <>
      <Show when={props.model.open}>
        <div class="ws-open">
          <For each={props.model.open}>{(one) => (
            <button class={one.on ? "ws-one on" : "ws-one"} data-w={one.id} title={one.name}>
              <b>{one.n}</b><i class="swatch" style={{ background: one.tint }}></i><span>{one.name}</span><em>{one.count}</em>
            </button>
          )}</For>
        </div>
      </Show>
      <Show when={props.model.chip}>{(chip) => (
        <Show
          when={props.model.rc}
          fallback={
            <button class="ws-btn" id="btn-space" aria-expanded={chip().expanded} title={chip().title}>
              <i class="swatch" style={{ background: chip().tint }}></i><span>{chip().name}</span><em>{chip().count}</em><kbd>{chip().hint}</kbd>
            </button>
          }
        >
          <button class="ws-btn" id="btn-space" aria-expanded={chip().expanded} title={chip().title}>
            <span>{chip().name}</span><em>{chip().count}</em><svg class="chev" aria-hidden="true"><use href="#i-chev" /></svg><kbd class="rc-key">{chip().hint}</kbd>
          </button>
        </Show>
      )}</Show>
      <For each={props.model.tabs}>{(tab) => (
        <Show
          when={props.model.rc}
          fallback={
            <button data-i={tab.i} aria-pressed={tab.pressed} class={tab.calls ? "calls" : ""} title={tab.title}>
              <i>{tab.n}</i><span>{tab.name}</span><em>{tab.tally}</em>
            </button>
          }
        >
          <Show when={tab.pressed !== "true"}>
            <button data-i={tab.i} aria-pressed={tab.pressed} class={tab.calls ? "calls" : ""} title={tab.title}>
              <kbd class="rc-key">{tab.hint}</kbd><Show when={tab.calls}><i class="rc-dot needs" aria-hidden="true"></i></Show><span>{tab.name}</span>
            </button>
          </Show>
        </Show>
      )}</For>
      <Show when={props.model.mirror}>{(one) => (
        <button class="mirror-btn" data-dev={one().dev} aria-pressed="true" title={one().title}>
          <Raw html={one().avatar} /><span>{one().dev}</span><em>{one().count}</em>
        </button>
      )}</Show>
    </>
  );
}

export function mountBlocks(host) {
  return mountView(host, Blocks, { key: "blocks", open: null, chip: null, tabs: [], mirror: null });
}

function StripNum(props) {
  return <span class={props.model.mirrorOf ? "num mirror-of" : props.model.rc ? "num rc-key" : "num"}>{props.model.num}</span>;
}

function StripSeats(props) {
  return (
    <span class="seats">
      {props.model.seats}
      <Show when={props.model.bold}><b>{props.model.bold}</b></Show>
    </span>
  );
}

export function mountStrip(host) {
  const [model, setModel] = createStore({ key: "strip", num: "—", mirrorOf: false, seats: "", bold: "" });
  const label = host.querySelector("#f-label");
  const plane = host.querySelector("#btn-plane");
  host.querySelector(".num")?.remove();
  host.querySelector(".seats")?.remove();
  const stop = createRoot((dispose) => {
    insert(host, () => <StripNum model={model} />, label);
    insert(host, () => <StripSeats model={model} />, plane);
    createEffect(() => {
      if (model.title) host.title = model.title;
      else host.removeAttribute("title");
    });
    return dispose;
  });
  host.dataset.view = "solid";
  return {
    show(next) { setModel(reconcile(next, { key: "key" })); },
    dispose() { stop(); delete host.dataset.view; }
  };
}

function LimitChip(props) {
  createEffect(() => { props.host.hidden = props.model.hidden; });
  createEffect(() => { if (props.model.title) props.host.title = props.model.title; });
  return (
    <Show when={props.model.rc} fallback={<LimitAccounts model={props.model} />}>
      <For each={props.model.accounts}>{(one, at) => (
        <>
          <Show when={at() > 0}><i class="pipe" aria-hidden="true"></i></Show>
          <span class={one.quiet ? "acc quiet" : "acc"}>
            <svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><use href={`#${one.icon}`} /></svg>
            <Show when={one.who}><span class="who">{one.who}</span></Show>
            <For each={one.parts}>{(part) => (
              <span class={`meter ${part.heat}`}>
                <span class="track"><i style={{ width: part.width }}></i></span>
                <b>{part.pct}</b><Show when={part.k}><span class="k">{part.k}</span></Show>
              </span>
            )}</For>
          </span>
        </>
      )}</For>
    </Show>
  );
}

function LimitAccounts(props) {
  return (
    <For each={props.model.accounts}>{(one) => (
      <span class={one.quiet ? "acc quiet" : "acc"}>
        <svg class="mark" viewBox="0 0 16 16" aria-hidden="true" style={{ color: one.color }}><use href={`#${one.icon}`} /></svg>
        <Show when={one.who}><span class="who">{one.who}</span></Show>
        <For each={one.parts}>{(part, at) => (
          <>
            <Show when={at() > 0}><span class="dot">&middot;</span></Show>
            <span class={`track ${part.heat}`}><i style={{ width: part.width }}></i></span>
            <b class={part.heat}>{part.pct}<Show when={part.k}><span class="k">{part.k}</span></Show></b>
          </>
        )}</For>
      </span>
    )}</For>
  );
}

export function mountLimitChip(host) {
  return mountView(host, LimitChip, { key: "lim", hidden: true, title: "", accounts: [] }, { host });
}

function LimitResets(props) {
  return (
    <For each={props.model.resets}>{(one) => (
      <><span class="it">{one.text}</span><i class="pipe" aria-hidden="true"></i></>
    )}</For>
  );
}

export function mountLimitResets(host) {
  return mountView(host, LimitResets, { key: "limresets", resets: [] });
}

function LimPop(props) {
  return (
    <Show when={!props.model.empty} fallback={<p class="lp-empty">{props.model.empty}</p>}>
      <For each={props.model.accounts}>{(row) => (
        <div class="lp-acc">
          <Show when={row.named}><h4>{row.account}</h4></Show>
          <Show when={row.note}><p class="lp-note">{row.note}</p></Show>
          <For each={row.limits}>{(one) => (
            <div class={`limit ${one.heat}`} classList={{ sub: one.sub }}>
              <div class="top"><span class="name">{one.label}</span><span class="pct">{one.pct}</span></div>
              <div class="track"><i class="fill" style={{ width: one.width }}></i></div>
              <Show when={one.resets}><div class="resets">{one.resets}</div></Show>
            </div>
          )}</For>
        </div>
      )}</For>
    </Show>
  );
}

export function mountLimPop(host) {
  return mountView(host.querySelector(".lp-body"), LimPop, { key: "limpop", empty: "", accounts: [] });
}

function PrButton(props) {
  return (
    <Show
      when={props.model.rc}
      fallback={
        <Show when={props.model.lead} fallback={<span class="soft">{props.model.count}</span>}>
          <b>{props.model.lead}</b>{props.model.word}<span class="soft">{props.model.count}</span>
        </Show>
      }
    >
      <Show when={props.model.tone}><i class={`rc-dot ${props.model.tone}`} aria-hidden="true"></i></Show>
      <b>{props.model.lead}</b><span>{props.model.word}</span>
    </Show>
  );
}

export function mountPrButton(host) {
  return mountView(host, PrButton, { key: "prbtn", lead: "", word: "", count: "" });
}

function PrRow(props) {
  return (
    <li
      class={props.row.gone ? "gone" : ""}
      data-ci={props.row.ci}
      data-key={props.row.prKey}
      onClick={() => props.actions.open(props.row.prKey)}
    >
      <span class="mk"><Raw html={props.row.mark} /></span>
      <div class="body">
        <div class="top">
          <span>{props.row.where}</span>
          <Show when={props.row.flag}><span class="chip" data-state={props.row.flag}>{props.row.flag}</span></Show>
          <span class="seat">
            <Show when={props.row.seatNone} fallback={props.row.seat}><span class="none">{props.row.seat}</span></Show>
          </span>
          <span class="when">{props.row.when}</span>
        </div>
        <p class="subject">{props.row.subject}</p>
        <div class="acts">
          <Show when={props.row.why}><span class="why">{props.row.why}</span></Show>
          <div class="btns">
            <For each={props.row.acts}>{(one) => (
              <button
                class={`t-act ${one.tone}${one.busy ? " busy" : ""}`}
                disabled={one.busy}
                aria-busy={one.busy ? "true" : undefined}
                data-act={one.act}
                data-key={props.row.prKey}
                data-check={one.check}
                onClick={(ev) => { ev.stopPropagation(); props.actions.act(props.row.prKey, one.act, one.check, ev.currentTarget); }}
              >
                <Show when={one.busy}><i class="spinner" aria-hidden="true"></i></Show>{one.label}
              </button>
            )}</For>
          </div>
        </div>
      </div>
    </li>
  );
}

function PrRows(props) {
  return (
    <For each={props.model.rows}>{(row) => (
      <Show when={row.kind === "pr"} fallback={<li class={row.kind === "sec" ? "pp-sec" : "pp-empty"}>{row.text}</li>}>
        <PrRow row={row} actions={props.actions} />
      </Show>
    )}</For>
  );
}

export function mountPrPop(host, extras = {}) {
  const [model, setModel] = createStore({ key: "prpop", rows: [], empty: true, count: "", bad: false });
  const list = host.querySelector(".pp-list");
  const tally = host.querySelector(".pp-count");
  list.textContent = "";
  host.dataset.view = "solid";
  const stop = createRoot((dispose) => {
    insert(list, () => <PrRows model={model} actions={extras.actions} />);
    createEffect(() => { tally.textContent = model.count; });
    createEffect(() => { if (!model.empty) tally.classList.toggle("bad", model.bad); });
    return dispose;
  });
  return {
    show(next) { setModel(reconcile(next, { key: "key" })); },
    dispose() { stop(); delete host.dataset.view; }
  };
}

function ComposerTo(props) {
  createEffect(() => { props.host.hidden = false; });
  createEffect(() => { props.host.title = props.model.title; });
  createEffect(() => { props.host.classList.toggle("none", props.model.none); });
  return <>{props.model.text}</>;
}

export function mountComposerTo(host) {
  return mountView(host, ComposerTo, { key: "cmpto", text: "", title: "", none: false }, { host });
}

function Mode(props) {
  let said;
  createEffect(() => { props.host.hidden = !props.model.holding; });
  createEffect(() => { props.host.classList.toggle("holding", !!props.model.holding); });
  createEffect(() => { said.textContent = props.model.txt; });
  return (
    <>
      <span class="dot"></span>
      <span id="mode-txt" ref={said}></span>
    </>
  );
}

export function mountHold(host) {
  return mountView(host, Mode, { key: "mode", holding: false, txt: "" }, { host });
}
