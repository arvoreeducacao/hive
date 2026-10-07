import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Act(props) {
  return (
    <Show when={props.act.kind === "button"} fallback={
      <span class={props.act.cls} data-pt={props.act.pt}>{props.act.say}</span>
    }>
      <button class={props.act.cls} data-pt={props.act.pt} data-key={props.act.dataKey} data-link={props.act.dataLink}>{props.act.say}</button>
    </Show>
  );
}

function Row(props) {
  return (
    <div class="pt-row"><span class="g"><svg width="14" height="14" aria-hidden="true"><use href={`#${props.row.icon}`} /></svg></span>
      <span class="t"><b>{props.row.title}</b><small>{props.row.said}</small></span>
      <span class={props.row.pill.cls}>{props.row.pill.say}</span>
      <span class="acts">
        <Show when={props.row.ghost} fallback={<For each={props.row.acts}>{(act) => <Act act={act} />}</For>}>
          <span class="ghost">{props.row.ghost}</span>
        </Show>
      </span></div>
  );
}

function Zone(props) {
  return (
    <Show when={props.rows.length} fallback={<Show when={props.empty}>
      <div class="pt-empty"><b>{props.empty.head}</b>{props.empty.say}</div>
    </Show>}>
      <div class="pt-rows"><For each={props.rows}>{(row) => <Row row={row} />}</For></div>
    </Show>
  );
}

function Portaria(props) {
  return (
    <Show when={props.model.zones}>
      <div class="pt-zone"><h3>{props.model.devicesSay} <em>{props.model.devicesCount}</em><span class="grow"></span>
        <button class="btn go" data-pt="pair">{props.model.pairSay}</button></h3>
        <Show when={props.model.code}>
          <div class="pt-code">
            <span><span class="num">{props.model.code.num}</span>
              <small>{props.model.code.say}</small></span>
            <button class="btn" data-pt="unpair">{props.model.code.close}</button></div>
        </Show>
        <Zone rows={props.model.devices} empty={props.model.devicesEmpty} />
        <Show when={props.model.behind}><div class="pt-foot">{props.model.behind}</div></Show></div>
      <div class="pt-zone"><h3>{props.model.peopleSay} <em>{props.model.peopleCount}</em><span class="grow"></span>
        <button class="btn go" data-pt="invite">{props.model.inviteSay}</button></h3>
        <Zone rows={props.model.people} empty={null} />
        <Show when={props.model.never}>
          <div class="pt-empty"><b>{props.model.never.head}</b>{props.model.never.say}</div>
        </Show>
        <div class="pt-join"><label for="pt-link">{props.model.pasteSay}</label>
          <input id="pt-link" spellcheck="false" autocomplete="off" attr:value={props.model.link} placeholder={props.model.pastePlaceholder} />
          <button class="btn go" data-pt="join">{props.model.goSay}</button></div></div>
      <Show when={props.model.said}><div class="pt-said">{props.model.said}</div></Show>
      <div class="pt-foot">{props.model.foot}</div>
    </Show>
  );
}

function Shut(props) {
  return (
    <Show when={props.model.error}>
      <div class="pt-empty"><b>{props.model.shutSay}</b>{props.model.error}</div>
    </Show>
  );
}

function Body(props) {
  return (
    <>
      <Shut model={props.model} />
      <Portaria model={props.model} />
    </>
  );
}

export function mountPortaria(host) {
  return mountView(host, Body, { zones: false, error: "" });
}
