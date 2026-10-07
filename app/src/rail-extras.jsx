import { For, Show, createEffect, createRoot } from "solid-js";
import { insert } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import { mountView } from "./view.jsx";
import { Raw } from "./raw.jsx";
import { Found } from "./rail.jsx";

function Mate(props) {
  return (
    <div
      class="item team"
      classList={{ here: props.one.here, quiet: props.one.quiet, mine: props.one.mine }}
      tabindex="-1"
      data-dev={props.one.dev}
      data-key={props.one.key}
      title={props.one.hint}
      onClick={() => props.actions.go(props.one.key)}
      onContextMenu={(ev) => props.actions.menu(props.one.dev, ev)}
    >
      <Raw html={props.one.avatar} />
      <Show when={props.one.mine} fallback={<Show when={!props.one.quiet}><span class="n">{props.one.tally}</span></Show>}>
        <span class="mine-ico"><svg aria-hidden="true"><use href="#i-local" /></svg></span>
      </Show>
      <span class="name">{props.one.name}</span>
    </div>
  );
}

function RaycastTeamRail(props) {
  return (
    <Show when={props.model.shown}>
      <div class="group-title"><span>{props.model.label}</span><b>{props.model.tally}</b></div>
      <Show when={props.model.trouble}>{(trouble) => (
        <div class="rail-err">
          <span class="why"><svg aria-hidden="true"><use href="#i-warn" /></svg>{trouble().said}</span>
          <Show when={trouble().when}><span class="sub">{trouble().when}</span></Show>
          <button type="button" onClick={() => props.actions.again()}>{trouble().again}<span class="rc-key">↵</span></button>
        </div>
      )}</Show>
      <Show
        when={props.model.hits}
        fallback={
          <div class="rail-crew">
            <For each={props.model.groups}>{(group) => <For each={group.devs}>{(one) => <Mate one={one} actions={props.actions} />}</For>}</For>
            <Show when={props.model.more}><span class="rail-crew-more">{props.model.more}</span></Show>
          </div>
        }
      >{(hits) => (
        <For each={hits()}>{(one) => (
          <div class="item team-hit" tabindex="-1" data-key={one.dev} title={one.hint} onClick={() => props.actions.go(one.dev)}>
            <Raw html={one.avatar} />
            <span class="name">{one.who}<Found parts={one.parts} /></span>
            <span class="meta t">{one.act}</span>
          </div>
        )}</For>
      )}</Show>
    </Show>
  );
}

function TeamRail(props) {
  return <Show when={props.model.raycast} fallback={<TeamRailNow model={props.model} actions={props.actions} />}><RaycastTeamRail model={props.model} actions={props.actions} /></Show>;
}

function TeamRailNow(props) {
  return (
    <For each={props.model.groups}>{(group) => (
    <Show when={group.devs.length}>
      <div class="group-title"><svg aria-hidden="true"><use href={group.key === "mine" ? "#i-local" : "#i-agent"} /></svg><span>{group.label}</span><b>{group.count}</b></div>
      <For each={group.devs}>{(one) => (
        <div
          class="item team"
          classList={{ here: one.here, quiet: one.quiet, mine: one.mine }}
          data-dev={one.dev}
          data-key={one.key}
          title={one.hint}
          onClick={() => props.actions.go(one.key)}
          onContextMenu={(ev) => props.actions.menu(one.dev, ev)}
        >
          <Raw html={one.avatar} /><span class="name">{one.name}</span>
          <span class="n">{one.tally}</span>
        </div>
      )}</For>
    </Show>
    )}</For>
  );
}

export function mountTeamRail(host, extras = {}) {
  return mountView(host, TeamRail, { key: "team", groups: [] }, extras);
}

function Knocks(props) {
  return (
    <Show when={props.model.knocks.length}>
      <div class="kn-title"><svg aria-hidden="true"><use href="#i-hand" /></svg><span>{props.model.title}</span></div>
      <For each={props.model.knocks}>{(one) => (
        <div class="kn" data-from={one.from} data-seat={one.seat} title={one.hint}>
          <Raw html={one.avatar} />
          <span class="kn-who"><b>{one.from}</b><span class="kn-seat">{one.line}</span></span>
          <span class="kn-acts">
            <button type="button" class="yes" data-yes="1" onClick={() => props.actions.answer(one.from, one.seat, true)}>{one.yes}</button>
            <button type="button" data-no="1" onClick={() => props.actions.answer(one.from, one.seat, false)}>{one.no}</button>
          </span>
        </div>
      )}</For>
    </Show>
  );
}

export function mountKnocks(host, extras = {}) {
  return mountView(host, Knocks, { key: "knocks", title: "", knocks: [] }, extras);
}

function WorktreeRail(props) {
  createEffect(() => {
    if (!props.model.count) return;
    if (props.model.raycast) delete props.host.dataset.idle;
    else props.host.dataset.idle = props.model.idle;
  });
  createEffect(() => { if (props.model.count) props.host.title = props.model.title; });
  return (
    <Show when={props.model.count}>
      <Show
        when={props.model.raycast}
        fallback={
          <>
            <span class="wt-head"><svg aria-hidden="true"><use href="#i-tree" /></svg><span class="wt-name">{props.model.name}</span><b>{props.model.count}</b></span>
            <span class="wt-sub">{props.model.said}</span>
            <span class="wt-track"><i style={{ width: props.model.share }}></i></span>
          </>
        }
      >
        <span class="wt-head">
          <svg aria-hidden="true"><use href="#i-tree" /></svg><span class="wt-name">{props.model.name}</span>
          <span class="wt-keys"><For each={props.model.keys}>{(key) => <span class="rc-key">{key}</span>}</For></span>
          <b class="wt-n">{props.model.count}</b>
        </span>
        <span class="wt-track"><i style={{ width: props.model.share }}></i></span>
        <span class="wt-sub"><For each={props.model.said}>{(bit, at) => <><Show when={at()}><span class="wt-pipe">|</span></Show><span>{bit}</span></>}</For></span>
      </Show>
    </Show>
  );
}

export function mountWorktreeRail(host) {
  return mountView(host, WorktreeRail, { key: "wt", idle: "no", title: "", name: "", count: 0, said: "", share: "0%" }, { host });
}

function RailToggle(props) {
  createEffect(() => { props.host.classList.toggle("out", props.model.out); });
  createEffect(() => { props.host.title = props.model.say; });
  createEffect(() => { props.host.setAttribute("aria-label", props.model.say); });
  return <svg aria-hidden="true"><use href="#i-rail" /></svg>;
}

export function mountRailToggle(host) {
  return mountView(host, RailToggle, { key: "railtoggle", out: false, say: "" }, { host });
}

function NudgeWho(props) {
  return (
    <>
      <Raw html={props.model.avatar} />
      <span><b id="nudge-title">{props.model.title}</b><span class="nd-seat">{props.model.sub}</span></span>
    </>
  );
}

function NudgeNext(props) {
  return (
    <Show when={props.model.next}>
      <b>{props.model.nextLabel}</b><span>{props.model.next}</span>
    </Show>
  );
}

export function mountNudge(host) {
  const [model, setModel] = createStore({ key: "nudge", avatar: "", title: "", sub: "", next: "", nextLabel: "" });
  const who = host.querySelector("#nudge-who");
  const next = host.querySelector("#nudge-next");
  who.textContent = "";
  next.textContent = "";
  host.dataset.view = "solid";
  const stop = createRoot((dispose) => {
    insert(who, () => <NudgeWho model={model} />);
    insert(next, () => <NudgeNext model={model} />);
    createEffect(() => { next.hidden = !model.next; });
    return dispose;
  });
  return {
    show(one) { setModel(reconcile(one, { key: "key" })); },
    dispose() { stop(); delete host.dataset.view; }
  };
}
