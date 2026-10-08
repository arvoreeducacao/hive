import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Icon, Keys } from "../panels/window.jsx";

function ThemeCard(props) {
  return (
    <div class="thm-card" classList={{ here: props.card.here }} data-name={props.card.name} role="button" tabindex="0" aria-pressed={String(props.card.here)}>
      <span class="thm-prev" style={{ background: props.card.bg }}>
        <span class="thm-aa" style={{ color: props.card.txt }}>Aa <span style={{ color: props.card.txt2 }}>{props.card.wears}</span></span>
        <span class="thm-dots"><For each={props.card.dots}>{(dot) => <i style={{ background: dot.colour }}></i>}</For></span>
      </span>
      <span class="thm-meta">
        <b>{props.card.name}</b>
        <Show when={props.card.here}><span class="tag on">{props.card.wearing}</span></Show>
        <Show when={props.card.custom}><span class="tag">{props.card.yours}</span></Show>
        <span class="thm-acts"><For each={props.card.acts}>{(act) => <button data-act={act.act}>{act.label}</button>}</For></span>
      </span>
    </div>
  );
}

function Themes(props) {
  return <For each={props.model.cards}>{(card) => <ThemeCard card={card} />}</For>;
}


function Swatch(props) {
  return (
    <span class="thm-sw" aria-hidden="true">
      <i style={{ background: props.row.bg }} /><i style={{ background: props.row.panel }} /><i style={{ background: props.row.txt }} />
      <b style={{ background: props.row.accent }} />
    </span>
  );
}

function ThemeRow(props) {
  const r = () => props.row;
  return (
    <button type="button" class="pw-row thm-row" role="option" aria-selected={r().here ? "true" : "false"} data-name={r().name}
      onClick={() => props.actions.pick(r().name)} onDblClick={() => props.actions.wear(r().name)}>
      <Swatch row={r()} />
      <span class="pw-t">{r().say || r().name}</span>
      <span class="pw-acc">
        <Show when={r().fresh}><span class="pw-m">{r().freshSay}</span></Show>
        <Show when={r().worn} fallback={<span class="pw-m">{r().tone}</span>}><span class="pw-st thm-worn"><Icon id="i-check" />{r().wearing}</span></Show>
      </span>
    </button>
  );
}

function ThemesWindow(props) {
  return (
    <>
      <For each={props.model.rows}>{(row) => <ThemeRow row={row} actions={props.actions} />}</For>
      <div class="pw-sec">{props.model.mineSay}<span class="n">{props.model.mine.length}</span></div>
      <For each={props.model.mine}>{(row) => <ThemeRow row={row} actions={props.actions} />}</For>
      <button type="button" class="pw-row thm-row thm-new" onClick={() => props.actions.fresh()}>
        <Icon id="i-plus" /><span class="pw-t">{props.model.newSay}</span><Keys keys={props.model.newKeys} />
      </button>
    </>
  );
}

function ThemePreview(props) {
  const p = () => props.model;
  return (
    <Show when={p().name}>
      <div class="thm-mini" style={p().vars} aria-hidden="true">
        <div class="bar"><i class="logo" /><span>you</span><span class="on">{p().seatSay}</span><span>checkout</span><span class="grow" /><span>20 PRs</span></div>
        <div class="seats">
          <div class="rl">
            <span><i class="d needs" />checkout</span><span><i class="d working" />fix login</span><span><i class="d working" />billing</span><span><i class="d ready" />refunds</span><span><i class="d idle" />revisor</span>
          </div>
          <For each={p().seats}>{(seat) => (
            <div class="st"><b>{seat.name}</b><span class="s"><i class={`d ${seat.state}`} />{seat.say}</span><i class="ln" /><i class="ln" /><i class="ln s2" /><span class="cp"><em /></span></div>
          )}</For>
        </div>
      </div>
      <h3 class="thm-name">{p().name}<Show when={p().fresh}><span class="rc-badge mono">{p().freshSay}</span></Show></h3>
      <Show when={p().desc}><p class="thm-desc">{p().desc}</p></Show>
      <div class="thm-pal">
        <For each={p().palette}>{(chip) => (
          <span class="thm-chip"><i style={{ background: chip.value }} /><small>{chip.name}<span>{chip.value}</span></small></span>
        )}</For>
      </div>
    </Show>
  );
}

let rowActions = {};

export function themeRowActions(actions) {
  rowActions = actions;
}

function ThemesPanel(props) {
  return <Show when={props.model.raycast} fallback={<Themes model={props.model} />}><ThemesWindow model={props.model} actions={rowActions} /></Show>;
}

export function mountThemes(host) {
  return mountView(host, ThemesPanel, { cards: [] });
}

export function mountThemePreview(host, extras) {
  return mountView(host, ThemePreview, { name: "", palette: [], seats: [] }, extras);
}
