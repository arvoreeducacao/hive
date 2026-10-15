import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";
import { Raw } from "./raw.jsx";

function Icon(props) {
  return <svg class="nr-ic" aria-hidden="true"><use href={`#${props.id}`} /></svg>;
}

function NextRailTop(props) {
  return (
    <>
      <button type="button" class="nr-row nr-new" data-hud="new" title={props.model.newChat} aria-label={props.model.newChat} onClick={() => props.actions.newChat()}>
        <span class="nr-cell"><Icon id="i-plus" /></span><span class="nr-lb">{props.model.newChat}</span><span class="nr-tail">⌘N</span>
      </button>
      <Show when={props.model.groups.length}>
        <div class="nr-sec"><span>{props.model.groupsSaid}</span><b>{props.model.groups.length}</b></div>
        <For each={props.model.groups}>{(group) => (
          <button
            type="button"
            class="nr-row nr-group"
            classList={{ here: group.here, needs: group.needs }}
            data-block={group.i}
            data-hud={`group:${group.i}`}
            title={group.hint}
            aria-label={group.hint}
            aria-current={group.here ? "true" : undefined}
            onClick={() => props.actions.group(group.i)}
          >
            <span class="nr-cell"><span class="nr-num">{group.n}</span></span>
            <span class="nr-lb">{group.label}</span>
            <span class="nr-dots" aria-hidden="true"><For each={group.dots}>{(dot) => <i data-state={dot.state || undefined} />}</For></span>
          </button>
        )}</For>
      </Show>
      <div class="nr-sec"><span>{props.model.shortcutsSaid}</span></div>
      <For each={props.model.shortcuts}>{(one) => (
        <button type="button" class="nr-row nr-short" data-shortcut={one.key} data-hud={`short:${one.key}`} title={one.label} aria-label={one.label} onClick={() => props.actions.shortcut(one.key)}>
          <span class="nr-cell"><Icon id={one.icon} /></span><span class="nr-lb">{one.label}</span><span class="nr-tail">{one.tail}</span>
        </button>
      )}</For>
      <Show when={props.model.team.length || props.model.away}>
        <div class="nr-sec"><span>{props.model.teamSaid}</span><b>{props.model.teamTally}</b></div>
        <div class="nr-team" classList={{ scrolls: props.model.teamScrolls }}>
          <For each={props.model.team}>{(one) => (
            <button type="button" class="nr-row nr-mate" classList={{ here: one.here }} data-dev={one.dev} data-hud={`mate:${one.key}`} title={one.hint} aria-label={one.hint} onClick={() => props.actions.mate(one.key)}>
              <span class="nr-cell"><Raw html={one.avatar} /></span><span class="nr-lb">{one.name}</span><span class="nr-tail">{one.said}</span>
            </button>
          )}</For>
        </div>
        <Show when={props.model.away}>{(away) => (
            <>
              <button type="button" class="nr-row nr-mate nr-away" data-hud="away" aria-expanded={away().open ? "true" : "false"} title={away().said} aria-label={away().said} onClick={() => props.actions.away()}>
                <span class="nr-cell nr-stack"><For each={away().faces}>{(face) => <Raw html={face.avatar} />}</For></span>
                <span class="nr-lb">{away().said}</span><span class="nr-tail">{away().open ? "▾" : "▸"}</span>
              </button>
              <For each={away().rows}>{(one) => (
                <button type="button" class="nr-row nr-mate off" data-dev={one.dev} data-hud={`off:${one.key}`} title={one.hint} aria-label={one.hint} onClick={() => props.actions.mate(one.key)}>
                  <span class="nr-cell"><Raw html={one.avatar} /></span><span class="nr-lb">{one.name}</span>
                </button>
              )}</For>
            </>
          )}</Show>
      </Show>
    </>
  );
}

function NextRailFoot(props) {
  return (
    <>
      <Show when={props.model.worktrees}>{(wt) => (
        <button type="button" class="nr-card nr-wt" data-hud="wt" title={wt().hint} aria-label={wt().hint} onClick={() => props.actions.worktrees()}>
          <span class="nr-cell"><Icon id="i-tree" /></span><span class="nr-txt"><b>{wt().title}</b><span>{wt().said}</span></span>
        </button>
      )}</Show>
      <button type="button" class={`nr-card nr-health ${props.model.health.state}`} data-hud="health" title={props.model.health.hint} aria-label={props.model.health.hint} onClick={() => props.actions.health()}>
        <span class="nr-cell"><Icon id="i-heart" /></span><span class="nr-txt"><b>{props.model.health.title}</b><span>{props.model.health.said}</span></span>
      </button>
      <button type="button" class="nr-row nr-toggle" data-hud="toggle" title={props.model.toggleSaid} aria-label={props.model.toggleSaid} onClick={() => props.actions.toggle()}>
        <span class="nr-cell"><Icon id="i-rail" /></span><span class="nr-lb">{props.model.toggleLabel}</span>
      </button>
    </>
  );
}

function NextRailHud(props) {
  return (
    <Show when={props.model.on}>
      <svg class="rh-ln" aria-hidden="true"><polyline points={props.model.line} /></svg>
      <div class="rh-box" data-tone={props.model.tone} style={{ left: `${props.model.x}px`, top: `${props.model.y}px` }}>
        <i class="rh-c1" /><i class="rh-c2" />
        <Show
          when={props.model.big}
          fallback={<><span class="rh-inv">{props.model.title}</span><Show when={props.model.meta}><div class="rh-meta"><Show when={props.model.rows.length}><span class="rh-hatch" /></Show>{props.model.meta}</div></Show></>}
        >
          <div class="rh-head"><span class="rh-big">{props.model.title}</span><span class="rh-meta">{props.model.meta}</span></div>
        </Show>
        <Show when={props.model.said}><div class="rh-said">{props.model.said}</div></Show>
        <Show when={props.model.rows.length}>
          <div class="rh-rows">
            <For each={props.model.rows}>{(row) => (
              <div class="rh-row" classList={{ needs: row.needs }}>
                <span class="rh-k">{row.k}</span><span class="rh-lb">{row.label}</span><span class="rh-bar"><i data-state={row.state || undefined} /></span>
              </div>
            )}</For>
          </div>
        </Show>
        <Show when={props.model.seg.length}>
          <div class="rh-seg"><For each={props.model.seg}>{(one) => <i classList={{ bad: one.bad }} />}</For></div>
        </Show>
        <Show when={props.model.tasks.length}>
          <div class="rh-rows">
            <For each={props.model.tasks}>{(task) => (
              <button type="button" class="rh-task" data-task={task.key} onClick={() => props.actions.task(task.key)}>
                <span class="rh-k">{task.k}</span><span class="rh-lb">{task.label}</span><span class="rh-say" data-state={task.state || undefined}>{task.say}</span>
              </button>
            )}</For>
          </div>
        </Show>
        <Show when={props.model.foot}>{(foot) => (
          <div class="rh-meta rh-foot"><span>{foot().left}</span><button type="button" class="rh-go" onClick={() => props.actions.foot(foot().act)}>{foot().right} →</button></div>
        )}</Show>
      </div>
    </Show>
  );
}

const HUD_EMPTY = { key: "rail-hud", on: false, tone: "", x: 0, y: 0, line: "", big: false, title: "", meta: "", said: "", rows: [], seg: [], tasks: [], foot: null };

export function mountNextRailHud(host, extras = {}) {
  return mountView(host, NextRailHud, { ...HUD_EMPTY }, extras);
}

const EMPTY = { key: "next-rail", newChat: "", groupsSaid: "", groups: [], shortcutsSaid: "", shortcuts: [], teamSaid: "", teamTally: "", team: [], teamScrolls: false, away: null, worktrees: null, health: { state: "ok", title: "", said: "", hint: "" }, toggleSaid: "", toggleLabel: "" };

export function mountNextRail(host, extras = {}) {
  return mountView(host, NextRailTop, { ...EMPTY }, extras);
}

export function mountNextRailFoot(host, extras = {}) {
  return mountView(host, NextRailFoot, { ...EMPTY }, extras);
}
